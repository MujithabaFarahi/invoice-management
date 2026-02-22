import React from 'react';

import { useEffect, useState } from 'react';
import {
  Plus,
  ArrowUpDown,
  MoreHorizontal,
  ChevronDown,
  FilterX,
  Trash2,
  Edit,
  Download,
  CalendarIcon,
  MinusCircle,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  addInvoice,
  addInvoiceCatalogItem,
  updateInvoice,
  deleteInvoice,
  getInvoiceItemsCatalog,
  getInvoiceById,
  getInvoiceMetadataSettings,
  toJapanMidnight,
  toJapanDate,
} from '@/Config/firestore';
import {
  type Invoice,
  type InvoiceMetadataSettings,
  type BankAccountDetails,
  type InvoiceItem,
  type InvoiceItemGroup,
  type InvoiceItemCatalog,
} from '@/Config/types';
import { toast } from 'sonner';
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@/redux/store/store';
import { setInvoices } from '@/redux/features/invoiceSlice';
import { fetchCurrencies, fetchCustomers } from '@/redux/features/paymentSlice';
import { Spinner } from '@/components/ui/spinner';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/Config/firebase';
import { useNavigate } from 'react-router-dom';
import { cn, getPaginationRange, toFixed2 } from '@/lib/utils';
import { downloadInvoicePdf } from '@/lib/invoicePdf';

type MarkupMode = 'percent' | 'fixed';

type InvoiceItemFormRow = {
  lineNo: string;
  groupId: string;
  itemsCatalogId: string | null;
  itemName: string;
  description: string;
  partNo: string;
  itemCode: string;
  cost: string;
  quantity: string;
  markupMode?: MarkupMode;
  markupValue?: string;
};

type InvoiceItemGroupForm = {
  id: string;
  name: string;
  isShow: boolean;
};

const createGroupId = () => `grp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createDefaultGroup = (name = 'General'): InvoiceItemGroupForm => ({
  id: createGroupId(),
  name,
  isShow: true,
});

const createEmptyItemRow = (
  groupId: string,
  lineNo = '1'
): InvoiceItemFormRow => ({
  lineNo,
  groupId,
  itemsCatalogId: null,
  itemName: '',
  description: '',
  partNo: '',
  itemCode: '',
  cost: '',
  quantity: '1',
});

const toLineNo = (value: string | number | undefined, fallback: number) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return fallback;
};

const getUnitPriceJPY = (cost: number, markupMode: MarkupMode, markupValue: number) => {
  if (markupMode === 'fixed') {
    return toFixed2(cost + markupValue);
  }
  return toFixed2(cost * (1 + markupValue / 100));
};

const getUnitPrice = (unitPriceJPY: number, exchangeRate: number) => {
  return toFixed2(unitPriceJPY * exchangeRate);
};

const getMarkupInput = (value?: string) =>
  value && value.trim() !== '' ? value : undefined;
const toFixed4 = (value: number | string): number =>
  +parseFloat(String(value)).toFixed(4);

const normalizeCatalogField = (value?: string) => (value || '').trim().toLowerCase();

const deriveBankAccounts = (
  metadata: InvoiceMetadataSettings | null
): BankAccountDetails[] => {
  if (!metadata) return [];
  if (metadata.bankAccounts && metadata.bankAccounts.length > 0) {
    return metadata.bankAccounts;
  }

  const hasLegacy = [
    metadata.bankName,
    metadata.branch,
    metadata.swiftCode,
    metadata.bankAddress,
    metadata.accountName,
    metadata.accountType,
    metadata.accountNumber,
  ].some((value) => (value || '').trim() !== '');

  if (!hasLegacy) return [];

  return [
    {
      id: 'legacy-primary',
      label: 'Primary',
      bankName: metadata.bankName || '',
      branch: metadata.branch || '',
      swiftCode: metadata.swiftCode || '',
      bankAddress: metadata.bankAddress || '',
      accountName: metadata.accountName || '',
      accountType: metadata.accountType || '',
      accountNumber: metadata.accountNumber || '',
    },
  ];
};

const isDuplicateCatalogItem = (
  existing: {
    itemName?: string;
    partNo?: string;
    itemCode?: string;
  },
  incoming: {
    itemName?: string;
    partNo?: string;
    itemCode?: string;
  }
) => {
  const existingName = normalizeCatalogField(existing.itemName);
  const incomingName = normalizeCatalogField(incoming.itemName);
  if (!existingName || existingName !== incomingName) {
    return false;
  }

  const existingPart = normalizeCatalogField(existing.partNo);
  const incomingPart = normalizeCatalogField(incoming.partNo);
  const existingCode = normalizeCatalogField(existing.itemCode);
  const incomingCode = normalizeCatalogField(incoming.itemCode);

  // Duplicate only when same name + same partNo + same itemCode.
  // Empty values are part of the exact-match combination.
  return existingPart === incomingPart && existingCode === incomingCode;
};

function FieldTooltip({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative group">
      {children}
      <div className="pointer-events-none absolute left-1/2 top-0 z-50 -translate-x-1/2 -translate-y-[110%] whitespace-nowrap rounded bg-black px-2 py-1 text-xs text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
        {value || '(empty)'}
      </div>
    </div>
  );
}

export default function Invoices() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  const { currencies, customers } = useSelector(
    (state: RootState) => state.payment
  );

  const { loading, invoices } = useSelector(
    (state: RootState) => state.invoice
  );

  useEffect(() => {
    if (currencies.length === 0) {
      dispatch(fetchCurrencies());
    }
    if (customers.length === 0) {
      dispatch(fetchCustomers());
    }
  }, [dispatch, invoices.length, currencies.length, customers.length]);

  const listenToInvoices = (dispatch: AppDispatch) => {
    const invoicesRef = collection(db, 'invoices');
    const q = query(
      invoicesRef,
      orderBy('date', 'desc'),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const invoices = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        date: toJapanDate(doc.data().date.toDate()),
        createdAt: doc.data().createdAt.toDate(),
      })) as Invoice[];

      dispatch(setInvoices(invoices));
    });

    return unsub;
  };

  useEffect(() => {
    const unsubscribe = listenToInvoices(dispatch);
    return () => unsubscribe();
  }, [dispatch]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>([]);
  const statusOptions = ['draft', 'paid', 'partially_paid', 'pending'];
  const [catalogItems, setCatalogItems] = useState<InvoiceItemCatalog[]>([]);

  const [formData, setFormData] = useState({
    invoiceNo: '',
    customerId: '',
    currency: 'USD',
    invoiceLink: '',
    date: new Date(),
    exchangeRate: '1',
    markupMode: 'percent' as MarkupMode,
    markupValue: '30',
    itemsPerPage: '20',
    bankAccountId: '',
    remarks: '',
  });
  const [itemGroups, setItemGroups] = useState<InvoiceItemGroupForm[]>([
    createDefaultGroup(),
  ]);
  const [itemRows, setItemRows] = useState<InvoiceItemFormRow[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false);
  const [isRateLoading, setIsRateLoading] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'draft' | 'pending'>(
    'pending'
  );
  const [invoiceMetadata, setInvoiceMetadata] =
    useState<InvoiceMetadataSettings | null>(null);

  const loadCatalogItems = async () => {
    try {
      const items = await getInvoiceItemsCatalog(true);
      setCatalogItems(items);
    } catch (error) {
      console.error('Error fetching item catalog:', error);
    }
  };

  useEffect(() => {
    loadCatalogItems();
  }, []);

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const metadata = await getInvoiceMetadataSettings();
        setInvoiceMetadata(metadata);
      } catch (error) {
        console.error('Error fetching invoice metadata:', error);
      }
    };
    loadMetadata();
  }, []);

  const fetchExchangeRate = async (currencyCode: string) => {
    if (!currencyCode) return;
    if (currencyCode === 'JPY') {
      setFormData((prev) => ({ ...prev, exchangeRate: '1' }));
      return;
    }

    try {
      setIsRateLoading(true);
      const response = await fetch(
        `https://api.frankfurter.app/latest?from=JPY&to=${currencyCode}`
      );
      if (!response.ok) {
        throw new Error(`Exchange API failed: ${response.status}`);
      }

      const data = (await response.json()) as {
        rates?: Record<string, number>;
      };
      const rate = data.rates?.[currencyCode];
      if (!rate) {
        throw new Error('Rate not available');
      }

      setFormData((prev) => ({
        ...prev,
        exchangeRate: String(toFixed4(rate)),
      }));
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      toast.error('Error', {
        description: `Unable to fetch ${currencyCode} rate from API`,
      });
    } finally {
      setIsRateLoading(false);
    }
  };

  const fetchHistoricalExchangeRate = async (
    currencyCode: string,
    invoiceDate: Date
  ): Promise<number | null> => {
    if (!currencyCode || currencyCode === 'JPY') {
      return 1;
    }

    try {
      const dateKey = format(invoiceDate, 'yyyy-MM-dd');
      const response = await fetch(
        `https://api.frankfurter.app/${dateKey}?from=JPY&to=${currencyCode}`
      );
      if (!response.ok) {
        throw new Error(`Exchange API failed: ${response.status}`);
      }
      const data = (await response.json()) as {
        rates?: Record<string, number>;
      };
      const rate = data.rates?.[currencyCode];
      if (!rate) {
        return null;
      }
      return toFixed4(rate);
    } catch (error) {
      console.error('Error fetching historical exchange rate:', error);
      return null;
    }
  };

  useEffect(() => {
    if (!isDialogOpen) return;
    if (!formData.currency) return;
    if (
      editingInvoice &&
      typeof editingInvoice.exchangeRate === 'number' &&
      editingInvoice.exchangeRate > 0
    ) {
      return;
    }
    fetchExchangeRate(formData.currency);
  }, [editingInvoice, formData.currency, isDialogOpen]);

  const activeCatalogItems = catalogItems.filter((item) => item.isActive);
  const filteredCatalogItems = activeCatalogItems.filter((item) =>
    item.itemName.toLowerCase().includes(catalogSearch.trim().toLowerCase())
  );

  const exchangeRate = Math.max(0, toFixed4(formData.exchangeRate || 0));
  const invoiceMarkupValue = Math.max(0, toFixed2(formData.markupValue || 0));
  const bankAccounts = deriveBankAccounts(invoiceMetadata);
  const defaultBankAccountId = bankAccounts[0]?.id || '';
  const selectedCustomerAddress =
    customers.find((c) => c.id === formData.customerId)?.address?.trim() || '';

  useEffect(() => {
    if (!isDialogOpen) return;
    if (!defaultBankAccountId) return;
    setFormData((prev) =>
      prev.bankAccountId ? prev : { ...prev, bankAccountId: defaultBankAccountId }
    );
  }, [defaultBankAccountId, isDialogOpen]);
  const validGroupIds = new Set(itemGroups.map((group) => group.id));
  const fallbackGroupId = itemGroups[0]?.id || '';

  const sortedItemRows = [...itemRows].sort(
    (a, b) => toLineNo(a.lineNo, Number.MAX_SAFE_INTEGER) - toLineNo(b.lineNo, Number.MAX_SAFE_INTEGER)
  );

  const computedItemsWithGroup = sortedItemRows
    .filter((row) => row.itemName.trim().length > 0)
    .map((row, index) => {
      const cost = Math.max(0, toFixed2(row.cost || 0));
      const quantity = Math.max(0, toFixed2(row.quantity || 0));
      const markupMode = row.markupMode ?? formData.markupMode;
      const rowMarkupInput = getMarkupInput(row.markupValue);
      const markupValue = Math.max(
        0,
        toFixed2((rowMarkupInput ?? formData.markupValue) || 0)
      );
      const unitPriceJPY = getUnitPriceJPY(cost, markupMode, markupValue);
      const unitPrice = getUnitPrice(unitPriceJPY, exchangeRate);

      const item: InvoiceItem = {
        lineNo: toLineNo(row.lineNo, index + 1),
        itemsCatalogId: row.itemsCatalogId,
        itemName: row.itemName.trim(),
        description: row.description.trim(),
        partNo: row.partNo.trim(),
        itemCode: row.itemCode.trim(),
        cost,
        unitPriceJPY,
        markupMode: row.markupMode,
        markupValue: rowMarkupInput ? markupValue : undefined,
        unitPrice,
        quantity,
        totalPrice: toFixed2(unitPrice * quantity),
      };

      return {
        groupId: validGroupIds.has(row.groupId) ? row.groupId : fallbackGroupId,
        item,
      };
    });

  const computedItemGroups: InvoiceItemGroup[] = itemGroups
    .map((group) => ({
      id: group.id,
      name: group.name.trim() || 'Unnamed Group',
      isShow: group.isShow,
      items: computedItemsWithGroup
        .filter((entry) => entry.groupId === group.id)
        .map((entry) => entry.item),
    }));

  const calculatedTotalAmount = toFixed2(
    computedItemGroups
      .flatMap((group) => group.items)
      .reduce((sum, item) => sum + item.totalPrice, 0)
  );
  const calculatedTotalCost = toFixed2(
    computedItemGroups
      .flatMap((group) => group.items)
      .reduce((sum, item) => sum + (item.cost ?? 0) * (item.quantity ?? 0), 0)
  );
  const calculatedTotalJPY =
    exchangeRate > 0 ? toFixed2(calculatedTotalAmount / exchangeRate) : 0;
  const calculatedTotalProfitJPY = toFixed2(
    calculatedTotalJPY - calculatedTotalCost
  );
  const isEditingLegacyInvoice =
    !!editingInvoice &&
    (!editingInvoice.itemGroups || editingInvoice.itemGroups.length === 0);
  const existingLegacyTotalAmount = toFixed2(editingInvoice?.totalAmount ?? 0);
  const shouldShowExistingLegacyTotal =
    isEditingLegacyInvoice && calculatedTotalAmount !== existingLegacyTotalAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (errorMessage) {
      toast.error('Error', {
        description: 'Please provide a unique invoice number',
      });
      return;
    }

    if (!formData.invoiceNo || !formData.customerId) {
      toast.error('Error', {
        description: 'Please fill in all required fields',
      });
      return;
    }
    const selectedBankAccount = bankAccounts.find(
      (account) => account.id === formData.bankAccountId
    );
    if (bankAccounts.length > 0 && !selectedBankAccount) {
      toast.error('Error', {
        description: 'Please select a bank account',
      });
      return;
    }
    const hasMissingCost = itemRows.some(
      (row) => row.itemName.trim() && row.cost.trim() === ''
    );
    if (hasMissingCost) {
      toast.error('Error', {
        description: 'Cost is required for all invoice items with name',
      });
      return;
    }
    const computedItemCount = computedItemGroups.flatMap(
      (group) => group.items
    ).length;
    const isEditingLegacyWithoutItems =
      !!editingInvoice &&
      (!editingInvoice.itemGroups || editingInvoice.itemGroups.length === 0);

    if (computedItemCount === 0 && !isEditingLegacyWithoutItems) {
      toast.error('Error', {
        description: 'Add at least one invoice item',
      });
      return;
    }
    if (computedItemCount > 0 && computedItemGroups.length === 0) {
      toast.error('Error', {
        description: 'Assign invoice items to at least one group',
      });
      return;
    }

    const customer = customers.find((c) => c.id === formData.customerId);
    if (!customer) {
      toast.error('Error', {
        description: 'Selected customer not found',
      });
      return;
    }

    const shouldPreserveLegacyTotals =
      isEditingLegacyWithoutItems && computedItemCount === 0;
    const shouldKeepLegacyTotalOnItemEdit =
      isEditingLegacyWithoutItems &&
      computedItemCount > 0 &&
      calculatedTotalAmount !== existingLegacyTotalAmount;
    const isPaidOrPartiallyPaidInvoice =
      !!editingInvoice &&
      (editingInvoice.status === 'paid' ||
        editingInvoice.status === 'partially_paid');

    if (editingInvoice && shouldKeepLegacyTotalOnItemEdit) {
      toast.error('Cannot update invoice', {
        description:
          'Calculated total must match existing total for legacy invoices.',
      });
      return;
    }

    const totalAmount = isPaidOrPartiallyPaidInvoice
      ? toFixed2(editingInvoice.totalAmount)
      : (
      shouldPreserveLegacyTotals || shouldKeepLegacyTotalOnItemEdit
        ? existingLegacyTotalAmount
        : calculatedTotalAmount);
    const itemsPerPage = Math.max(
      1,
      Math.floor(Number(formData.itemsPerPage || 20) || 20)
    );
    const totalCost = shouldPreserveLegacyTotals
      ? toFixed2(editingInvoice?.totalCost ?? 0)
      : calculatedTotalCost;
    const effectiveExchangeRate = exchangeRate;
    const effectiveCurrency = editingInvoice
      ? editingInvoice.currency
      : formData.currency;
    const totalJPY = shouldPreserveLegacyTotals
      ? toFixed2(editingInvoice?.totalJPY ?? 0)
      : effectiveExchangeRate > 0
        ? toFixed2(totalAmount / effectiveExchangeRate)
        : 0;
    const totalProfitJPY = shouldPreserveLegacyTotals
      ? toFixed2(editingInvoice?.totalProfitJPY ?? 0)
      : toFixed2(totalJPY - totalCost);
    const amountPaid = isPaidOrPartiallyPaidInvoice
      ? toFixed2(editingInvoice.amountPaid ?? 0)
      : 0;
    const balance = isPaidOrPartiallyPaidInvoice
      ? toFixed2(editingInvoice.balance ?? 0)
      : totalAmount;
    const recievedJPY = isPaidOrPartiallyPaidInvoice
      ? toFixed2(editingInvoice.recievedJPY ?? 0)
      : 0;
    const foreignBankCharge = isPaidOrPartiallyPaidInvoice
      ? toFixed2(editingInvoice.foreignBankCharge ?? 0)
      : 0;
    const localBankCharge = isPaidOrPartiallyPaidInvoice
      ? toFixed2(editingInvoice.localBankCharge ?? 0)
      : 0;

    try {
      setIsLoading(true);
      const finalStatus: Invoice['status'] = isPaidOrPartiallyPaidInvoice
        ? editingInvoice.status
        : submitStatus;

      const invoiceData = {
        invoiceNo: formData.invoiceNo,
        customerId: formData.customerId,
        customerName: customer.name,
        invoiceLink: formData.invoiceLink,
        totalCost,
        totalJPY,
        totalProfitJPY,
        totalAmount,
        amountPaid,
        currency: effectiveCurrency,
        balance,
        recievedJPY,
        status: finalStatus,
        date: toJapanMidnight(formData.date),
        foreignBankCharge,
        localBankCharge,
        exchangeRate: effectiveExchangeRate,
        markupMode: formData.markupMode,
        markupValue: invoiceMarkupValue,
        itemsPerPage,
        remarks: formData.remarks.trim(),
        bankAccountId: selectedBankAccount?.id,
        bankAccount: selectedBankAccount,
        itemGroups: computedItemCount > 0 ? computedItemGroups : undefined,
        templateVersion: 'v1',
        documentSource: 'system' as const,
      };

      if (editingInvoice) {
        await updateInvoice(editingInvoice.id, invoiceData);
        // dispatch(
        //   updateInvoiceInList({
        //     id: editingInvoice.id,
        //     invoiceNo: formData.invoiceNo,
        //     customerId: formData.customerId,
        //     currency: formData.currency,
        //     date: formData.date,
        //     customerName: customer.name,
        //     totalAmount,
        //     amountPaid: 0,
        //     balance: totalAmount,
        //     status: 'pending' as const,
        //     createdAt: editingInvoice.createdAt,
        //   })
        // );
        toast.success('Success', {
          description: 'Invoice updated successfully',
        });
      } else {
        await addInvoice({
          createdAt: new Date(),
          ...invoiceData,
        });

        toast.success('Success', {
          description: 'Invoice created successfully',
        });
      }

      setIsDialogOpen(false);
      setEditingInvoice(null);
      setFormData({
        invoiceNo: '',
        customerId: '',
        currency: 'USD',
        date: new Date(),
        invoiceLink: '',
        exchangeRate: '1',
        markupMode: 'percent',
        markupValue: '30',
        itemsPerPage: '20',
        bankAccountId: defaultBankAccountId,
        remarks: '',
      });
      setItemGroups([createDefaultGroup()]);
      setItemRows([]);
      setSubmitStatus('pending');
    } catch (error) {
      console.error('Error saving invoice:', error);
      toast.error('Error', {
        description: 'Failed to save invoice',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = async (invoice: Invoice) => {
    const groupsFromInvoice: InvoiceItemGroupForm[] =
      invoice.itemGroups && invoice.itemGroups.length > 0
        ? invoice.itemGroups.map((group) => ({
            id: group.id || createGroupId(),
            name: group.name || 'Unnamed Group',
            isShow: group.isShow ?? true,
          }))
        : [createDefaultGroup()];

    let resolvedExchangeRate =
      typeof invoice.exchangeRate === 'number' && invoice.exchangeRate > 0
        ? invoice.exchangeRate
        : null;

    if (!resolvedExchangeRate && invoice.currency !== 'JPY') {
      const historicalRate = await fetchHistoricalExchangeRate(
        invoice.currency,
        new Date(invoice.date)
      );
      if (historicalRate) {
        resolvedExchangeRate = historicalRate;
        toast('Exchange rate loaded', {
          description: `Historical rate loaded for ${invoice.currency} on invoice date`,
        });
      }
    }

    setEditingInvoice(invoice);
    setFormData({
      invoiceNo: invoice.invoiceNo,
      customerId: invoice.customerId,
      currency: invoice.currency,
      date: new Date(invoice.date),
      invoiceLink: invoice.invoiceLink ?? '',
      exchangeRate: String(resolvedExchangeRate ?? 1),
      markupMode: invoice.markupMode ?? 'percent',
      markupValue: String(invoice.markupValue ?? 0),
      itemsPerPage: String(invoice.itemsPerPage ?? 20),
      bankAccountId:
        invoice.bankAccountId || invoice.bankAccount?.id || defaultBankAccountId,
      remarks: invoice.remarks ?? '',
    });
    setSubmitStatus(invoice.status === 'draft' ? 'draft' : 'pending');
    setItemGroups(groupsFromInvoice);

    if (invoice.itemGroups && invoice.itemGroups.length > 0) {
      const groupedRows = invoice.itemGroups.flatMap((group) =>
        (group.items || []).map((item) => ({
          lineNo: String(item.lineNo ?? 1),
          groupId: group.id,
          itemsCatalogId: item.itemsCatalogId ?? null,
          itemName: item.itemName,
          description: item.description ?? '',
          partNo: item.partNo ?? '',
          itemCode: item.itemCode ?? '',
          cost: String(item.cost ?? item.unitPriceJPY ?? 0),
          quantity: String(item.quantity ?? 1),
          markupMode: item.markupMode,
          markupValue:
            item.markupValue !== undefined ? String(item.markupValue) : '',
        }))
      );

      setItemRows(groupedRows);
    } else {
      setItemRows([]);
    }
    setIsDialogOpen(true);
  };

  const updateItemRow = (
    index: number,
    patch: Partial<InvoiceItemFormRow>
  ) => {
    setItemRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  };

  const updateGroup = (groupId: string, patch: Partial<InvoiceItemGroupForm>) => {
    setItemGroups((prev) =>
      prev.map((group) => (group.id === groupId ? { ...group, ...patch } : group))
    );
  };

  const addItemGroup = () => {
    setItemGroups((prev) => [...prev, createDefaultGroup(`Group ${prev.length + 1}`)]);
  };

  const removeItemGroup = (groupId: string) => {
    if (itemGroups.length <= 1) {
      toast.error('Error', {
        description: 'At least one group is required',
      });
      return;
    }

    const fallbackGroup = itemGroups.find((group) => group.id !== groupId);
    if (!fallbackGroup) return;

    setItemRows((prev) =>
      prev.map((row) =>
        row.groupId === groupId ? { ...row, groupId: fallbackGroup.id } : row
      )
    );
    setItemGroups((prev) => prev.filter((group) => group.id !== groupId));
  };

  const addCustomItemRow = () => {
    const defaultGroup = itemGroups[0] ?? createDefaultGroup();
    if (itemGroups.length === 0) {
      setItemGroups([defaultGroup]);
    }
    setItemRows((prev) => {
      const nextNo =
        prev.reduce(
          (max, row) => Math.max(max, toLineNo(row.lineNo, 0)),
          0
        ) + 1;
      return [...prev, createEmptyItemRow(defaultGroup.id, String(nextNo))];
    });
  };

  const addCatalogItemRow = (catalogId: string) => {
    const catalogItem = catalogItems.find((item) => item.id === catalogId);
    if (!catalogItem) return;
    const defaultGroup = itemGroups[0] ?? createDefaultGroup();
    if (itemGroups.length === 0) {
      setItemGroups([defaultGroup]);
    }

    setItemRows((prev) => [
      ...prev,
      {
        lineNo: String(
          prev.reduce((max, row) => Math.max(max, toLineNo(row.lineNo, 0)), 0) + 1
        ),
        groupId: defaultGroup.id,
        itemsCatalogId: catalogItem.id,
        itemName: catalogItem.itemName,
        description: catalogItem.description ?? '',
        partNo: catalogItem.partNo ?? '',
        itemCode: catalogItem.itemCode ?? '',
        cost: String(catalogItem.defaultUnitPriceJPY ?? 0),
        quantity: '1',
      },
    ]);
  };

  const removeItemRow = (index: number) => {
    setItemRows((prev) => prev.filter((_, i) => i !== index));
  };

  const saveRowToCatalog = async (row: InvoiceItemFormRow, index: number) => {
    if (row.itemsCatalogId) {
      toast.error('Error', {
        description: 'This row is already linked to catalog',
      });
      return;
    }

    if (!row.itemName.trim()) {
      toast.error('Error', {
        description: 'Item name is required before saving to catalog',
      });
      return;
    }

    const isDuplicate = catalogItems.some(
      (item) => isDuplicateCatalogItem(item, row)
    );
    if (isDuplicate) {
      toast.error('Error', {
        description: 'Duplicate catalog item exists with same name/part/code',
      });
      return;
    }

    if (row.cost.trim() === '') {
      toast.error('Error', {
        description: 'Cost is required before saving to catalog',
      });
      return;
    }

    const defaultUnitPriceJPY = Number(row.cost);
    if (Number.isNaN(defaultUnitPriceJPY) || defaultUnitPriceJPY < 0) {
      toast.error('Error', {
        description: 'Invalid unit price for catalog save',
      });
      return;
    }

    try {
      const id = await addInvoiceCatalogItem({
        itemName: row.itemName.trim(),
        description: row.description.trim(),
        partNo: row.partNo.trim(),
        itemCode: row.itemCode.trim(),
        defaultUnitPriceJPY,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      updateItemRow(index, { itemsCatalogId: id });
      await loadCatalogItems();
      toast.success('Success', {
        description: 'Custom item saved to catalog',
      });
    } catch (error) {
      console.error('Error saving row to catalog:', error);
      toast.error('Error', {
        description: 'Failed to save custom item to catalog',
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteInvoice(id);
      toast.success('Success', {
        description: 'Invoice deleted successfully',
      });
      // dispatch(deleteInvoiceFromList(id));
    } catch (error) {
      console.error('Error deleting invoice:', error);
      toast.error('Error', {
        description: 'Failed to delete invoice',
      });
    } finally {
      setIsDeleteDialogOpen(false);
      setEditingInvoice(null);
    }
  };

  const handleDownloadPdf = async (invoice: Invoice) => {
    if (invoice.status === 'draft') {
      return;
    }
    try {
      const [fullInvoice, metadata] = await Promise.all([
        getInvoiceById(invoice.id),
        getInvoiceMetadataSettings(),
      ]);
      const customerAddress =
        customers.find((customer) => customer.id === fullInvoice.customerId)?.address || '';
      await downloadInvoicePdf(fullInvoice, metadata, { customerAddress });
    } catch (error) {
      console.error('Error generating invoice PDF:', error);
      toast.error('Error', {
        description: 'Failed to generate invoice PDF',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <Badge className="bg-zinc-600 text-zinc-100">Draft</Badge>;
      case 'paid':
        return <Badge className="bg-green-800 text-green-100">Paid</Badge>;
      case 'partially_paid':
        return (
          <Badge className="bg-yellow-700 text-yellow-100">
            Partially Paid
          </Badge>
        );
      case 'pending':
        return <Badge className="bg-red-800 text-red-100">Pending</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const columns: ColumnDef<Invoice>[] = [
    {
      accessorKey: 'invoiceNo',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            No
            <ArrowUpDown />
          </Button>
        );
      },
      cell: ({ row }) => (
        <div className="capitalize text-center">
          {row.getValue('invoiceNo')}
        </div>
      ),
    },
    {
      accessorKey: 'date',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Date
            <ArrowUpDown />
          </Button>
        );
      },
      cell: ({ row }) => (
        <div className="capitalize">
          {new Date(row.getValue('date')).toLocaleDateString('ja-JP')}
        </div>
      ),
    },
    {
      accessorKey: 'customerName',
      header: 'Customer Name',
      filterFn: (row, columnId, filterValue) => {
        if (!filterValue?.length) return true;
        return filterValue.includes(row.getValue(columnId));
      },
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue('customerName')}</div>
      ),
    },
    {
      accessorKey: 'currency',
      header: 'Currency',
      filterFn: (row, columnId, filterValue) => {
        if (!filterValue?.length) return true;
        return filterValue.includes(row.getValue(columnId));
      },
      cell: ({ row }) => (
        <div className="capitalize text-center">{row.getValue('currency')}</div>
      ),
    },
    {
      accessorKey: 'totalAmount',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Amount
            <ArrowUpDown />
          </Button>
        );
      },
      cell: ({ row }) => {
        const amount = toFixed2(row.getValue('totalAmount'));
        // Format the amount as a dollar amount
        const formatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: row.getValue('currency') || 'USD',
        }).format(amount);
        return <div className="text-center">{formatted}</div>;
      },
    },
    {
      accessorKey: 'amountPaid',
      header: () => <div className="text-center">Paid</div>,
      cell: ({ row }) => {
        const amount = toFixed2(row.getValue('amountPaid'));
        // Format the amount as a dollar amount
        const formatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: row.getValue('currency') || 'USD',
        }).format(amount);
        return <div className="text-center">{formatted}</div>;
      },
    },
    {
      accessorKey: 'balance',
      header: () => <div className="text-center">Balance</div>,
      cell: ({ row }) => {
        const amount = toFixed2(row.getValue('balance'));
        // Format the amount as a dollar amount
        const formatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: row.getValue('currency') || 'USD',
        }).format(amount);
        return (
          <div
            className={cn(
              'text-center',
              amount > 0 ? 'text-orange-600 font-medium' : 'text-green-600'
            )}
          >
            {formatted}
          </div>
        );
      },
    },
    {
      accessorKey: 'status',
      header: () => <div className="text-center">Status</div>,
      filterFn: (row, columnId, filterValue) => {
        if (!filterValue?.length) return true;
        return filterValue.includes(row.getValue(columnId));
      },

      cell: ({ row }) => (
        <div className="text-center">
          {getStatusBadge(row.getValue('status'))}
        </div>
      ),
    },

    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => {
        const invoice = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(invoice.invoiceNo);
                }}
              >
                Copy Invoice No
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={invoice.status === 'draft'}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownloadPdf(invoice);
                }}
              >
                <Download className="text-primary" />
                Generate PDF
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit(invoice);
                }}
              >
                <Edit className="text-primary" />
                Edit Invoice
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  if (invoice.status === 'paid') {
                    toast.error('Error', {
                      description: 'Cannot delete a paid invoice',
                    });
                    return;
                  } else if (invoice.status === 'partially_paid') {
                    toast.error('Error', {
                      description: 'Cannot delete a partially paid invoice',
                    });
                    return;
                  }
                  setEditingInvoice(invoice);
                  setIsDeleteDialogOpen(true);
                }}
              >
                <Trash2 className="text-red-700" />
                Delete Invoice
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const table = useReactTable({
    data: invoices,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  const currentPage = table.getState().pagination.pageIndex + 1;
  const totalPages = table.getPageCount();
  const paginationRange = getPaginationRange(currentPage, totalPages);

  useEffect(() => {
    table.getColumn('customerName')?.setFilterValue(selectedCustomers);
  }, [selectedCustomers, table]);

  useEffect(() => {
    table.getColumn('status')?.setFilterValue(selectedStatuses);
  }, [selectedStatuses, table]);

  useEffect(() => {
    table.getColumn('currency')?.setFilterValue(selectedCurrencies);
  }, [selectedCurrencies, table]);

  return (
    <div className="h-screen flex flex-col py-6 gap-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 px-6 md:px-8">
        <div className="">
          <h1 className="text-3xl font-bold">Invoices</h1>
          <p className="text-muted-foreground">
            Manage customer invoices and track payments
          </p>
        </div>

        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Invoice</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this invoice? This action cannot
                be undone.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDeleteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                isLoading={isLoading}
                onClick={() => {
                  if (editingInvoice) {
                    handleDelete(editingInvoice.id);
                  }
                }}
              >
                Delete Invoice
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={() => {
                setEditingInvoice(null);
                setFormData({
                  invoiceNo: '',
                  customerId: '',
                  invoiceLink: '',
                  currency: 'USD',
                  date: new Date(),
                  exchangeRate: '1',
                  markupMode: 'percent',
                  markupValue: '30',
                  itemsPerPage: '20',
                  bankAccountId: defaultBankAccountId,
                  remarks: '',
                });
                setItemGroups([createDefaultGroup()]);
                setItemRows([]);
                setErrorMessage(null);
                setSubmitStatus('pending');
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Invoice
            </Button>
          </DialogTrigger>

          <DialogContent
            className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] max-h-[92vh] overflow-y-auto xl:max-w-[1400px]"
            onPointerDownOutside={(e) => e.preventDefault()}
            // onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>
                {editingInvoice ? 'Edit Invoice' : 'Create New Invoice'}
              </DialogTitle>
              <DialogDescription>
                {editingInvoice
                  ? 'Update invoice information'
                  : 'Enter invoice details to create a new invoice'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="invoiceNo">Invoice Number *</Label>
                    <Input
                      id="invoiceNo"
                      value={formData.invoiceNo}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFormData({ ...formData, invoiceNo: value });

                        const exists = invoices.some(
                          (inv) =>
                            inv.invoiceNo === value.trim() &&
                            inv.id !== editingInvoice?.id
                        );
                        setErrorMessage(
                          exists ? 'Invoice number already exists' : ''
                        );
                      }}
                      placeholder="INV-001"
                      required
                    />
                    {errorMessage && (
                      <p className="text-sm text-red-500">{errorMessage}</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label>Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant={'outline'}
                          className="w-full justify-start text-left font-normal"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.date ? (
                            format(formData.date, 'PPP')
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={formData.date}
                          captionLayout="dropdown"
                          onSelect={(date) => {
                            if (date) {
                              setFormData({ ...formData, date });
                            }
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="invoiceLink">Invoice Link</Label>
                    <Input
                      id="invoiceLink"
                      value={formData.invoiceLink}
                      onChange={(e) =>
                        setFormData({ ...formData, invoiceLink: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                  <div className="grid gap-2 md:col-span-2">
                    <Label htmlFor="customer">Customer *</Label>
                    <Select
                      value={formData.customerId}
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          customerId: value,
                          currency: editingInvoice
                            ? formData.currency
                            : customers.find((c) => c.id === value)?.currency ||
                              'USD',
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a customer" />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedCustomerAddress && (
                      <p className="text-xs text-muted-foreground">
                        Address: {selectedCustomerAddress}
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Select
                      value={formData.currency}
                      onValueChange={(value) =>
                        setFormData({ ...formData, currency: value })
                      }
                      disabled={!!editingInvoice}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {currencies.map((currency) => (
                          <SelectItem key={currency.code} value={currency.code}>
                            {currency.code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="exchangeRate">Exchange Rate</Label>
                    <div className="flex gap-2">
                      <Input
                        id="exchangeRate"
                        type="number"
                        step="0.0001"
                        min={0}
                        value={formData.exchangeRate}
                        onChange={(e) =>
                          setFormData({ ...formData, exchangeRate: e.target.value })
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="min-w-20"
                        isLoading={isRateLoading}
                        onClick={() => fetchExchangeRate(formData.currency)}
                      >
                        Refresh
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Auto-fetched from API for selected currency (base: JPY)
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="markupMode">Invoice Markup</Label>
                    <div className="grid gap-2">
                      <Select
                        value={formData.markupMode}
                        onValueChange={(value) =>
                          setFormData({
                            ...formData,
                            markupMode: value as MarkupMode,
                          })
                        }
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent">%</SelectItem>
                          <SelectItem value="fixed">Fixed</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        id="markupValue"
                        type="number"
                        step="0.01"
                        min={0}
                        value={formData.markupValue}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            markupValue: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="itemsPerPage">Items Per Page</Label>
                    <Input
                      id="itemsPerPage"
                      type="number"
                      min={1}
                      step={1}
                      value={formData.itemsPerPage}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          itemsPerPage: e.target.value,
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Used when generating PDF pagination
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="bankAccount">Bank Account</Label>
                    <Select
                      value={formData.bankAccountId}
                      onValueChange={(value) =>
                        setFormData({ ...formData, bankAccountId: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            bankAccounts.length > 0
                              ? 'Select account'
                              : 'No bank account configured'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {bankAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.label?.trim() ||
                              account.bankName?.trim() ||
                              account.accountNumber?.trim() ||
                              'Bank Account'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2 md:col-span-2">
                    <Label htmlFor="remarks">Remarks</Label>
                    <Input
                      id="remarks"
                      value={formData.remarks}
                      onChange={(e) =>
                        setFormData({ ...formData, remarks: e.target.value })
                      }
                      placeholder="Payment terms or notes"
                    />
                  </div>
                </div>

                <div className="border rounded-md p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Item Groups</p>
                    <Button type="button" variant="outline" onClick={addItemGroup}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Group
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    {itemGroups.map((group) => (
                      <div
                        key={group.id}
                        className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-center"
                      >
                        <Input
                          value={group.name}
                          onChange={(e) =>
                            updateGroup(group.id, { name: e.target.value })
                          }
                          placeholder="Group name"
                        />
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`group-show-${group.id}`}
                            checked={group.isShow}
                            onCheckedChange={(checked) =>
                              updateGroup(group.id, { isShow: checked === true })
                            }
                          />
                          <Label
                            htmlFor={`group-show-${group.id}`}
                            className="text-sm"
                          >
                            Show in PDF
                          </Label>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => removeItemGroup(group.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border rounded-md">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-3 border-b">
                    <p className="font-medium">Invoice Items</p>
                    <div className="flex flex-wrap gap-2">
                      <Popover
                        open={catalogPickerOpen}
                        onOpenChange={setCatalogPickerOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-[320px] justify-start"
                          >
                            Add from catalog
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-[360px] p-2">
                          <Input
                            value={catalogSearch}
                            onChange={(e) => setCatalogSearch(e.target.value)}
                            placeholder="Search by item name..."
                          />
                          <div
                            className="mt-2 max-h-64 overflow-y-auto overscroll-contain space-y-1"
                            onWheel={(e) => e.stopPropagation()}
                          >
                            {filteredCatalogItems.length === 0 ? (
                              <p className="text-sm text-muted-foreground px-2 py-1">
                                No catalog items found
                              </p>
                            ) : (
                              filteredCatalogItems.map((item) => (
                                <Button
                                  key={item.id}
                                  type="button"
                                  variant="ghost"
                                  className="w-full h-auto py-2 justify-start"
                                  onClick={() => {
                                    addCatalogItemRow(item.id);
                                    setCatalogSearch('');
                                    setCatalogPickerOpen(false);
                                  }}
                                >
                                  <div className="flex flex-col items-start">
                                    <span>{item.itemName}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {item.itemCode || '-'} | {item.partNo || '-'}
                                    </span>
                                  </div>
                                </Button>
                              ))
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                      <Button
                        variant="outline"
                        type="button"
                        onClick={addCustomItemRow}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Custom Item
                      </Button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <Table className="table-fixed">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-16">No</TableHead>
                          <TableHead className="w-[140px] min-w-[140px] max-w-[140px]">
                            Group
                          </TableHead>
                          <TableHead className="w-[140px] min-w-[140px]">Item</TableHead>
                          <TableHead className="min-w-44">Part / Code</TableHead>
                          <TableHead className="min-w-30">Cost (JPY)</TableHead>
                          <TableHead className="min-w-30">Markup</TableHead>
                          <TableHead className="min-w-30">
                            Unit Price (JPY)
                          </TableHead>
                          <TableHead className="min-w-20">Qty</TableHead>
                          <TableHead className="min-w-30">Unit Price</TableHead>
                          <TableHead className="min-w-30">Amount</TableHead>
                          <TableHead className="w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itemRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={10} className="h-24 text-center">
                              No invoice items added yet. Use "Add from catalog" or
                              "Add Custom Item".
                            </TableCell>
                          </TableRow>
                        ) : (
                          itemRows
                            .map((row, index) => ({ row, index }))
                            .sort(
                              (a, b) =>
                                toLineNo(a.row.lineNo, Number.MAX_SAFE_INTEGER) -
                                toLineNo(b.row.lineNo, Number.MAX_SAFE_INTEGER)
                            )
                            .map(({ row, index }) => {
                          const markupMode = row.markupMode ?? formData.markupMode;
                          const rowMarkupInput = getMarkupInput(row.markupValue);
                          const markupValue = Math.max(
                            0,
                            toFixed2(
                              (rowMarkupInput ?? formData.markupValue) || 0
                            )
                          );
                          const cost = Math.max(0, toFixed2(row.cost || 0));
                          const quantity = Math.max(0, toFixed2(row.quantity || 0));
                          const unitPriceJPY = getUnitPriceJPY(
                            cost,
                            markupMode,
                            markupValue
                          );
                          const calculatedUnitPrice = getUnitPrice(
                            unitPriceJPY,
                            exchangeRate
                          );
                          const lineAmount = toFixed2(calculatedUnitPrice * quantity);

                              return (
                                <TableRow key={`${index}-${row.itemsCatalogId ?? 'custom'}`}>
                              <TableCell>
                                <Input
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={row.lineNo}
                                  onChange={(e) =>
                                    updateItemRow(index, { lineNo: e.target.value })
                                  }
                                />
                              </TableCell>
                              <TableCell className="w-[140px] max-w-[140px]">
                                <FieldTooltip
                                  value={
                                    itemGroups.find((group) => group.id === row.groupId)
                                      ?.name || ''
                                  }
                                >
                                  <Select
                                    value={row.groupId}
                                    onValueChange={(value) =>
                                      updateItemRow(index, { groupId: value })
                                    }
                                  >
                                    <SelectTrigger className="w-full min-w-0">
                                      <SelectValue placeholder="Select group" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {itemGroups.map((group) => (
                                        <SelectItem key={group.id} value={group.id}>
                                          {group.name || 'Unnamed Group'}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </FieldTooltip>
                              </TableCell>
                              <TableCell>
                                <FieldTooltip value={row.itemName}>
                                    <Input
                                      value={row.itemName}
                                      onChange={(e) =>
                                        updateItemRow(index, {
                                          itemName: e.target.value,
                                        })
                                      }
                                      placeholder="Item name"
                                    />
                                </FieldTooltip>
                                <FieldTooltip value={row.description}>
                                    <Input
                                      className="mt-2"
                                      value={row.description}
                                      onChange={(e) =>
                                        updateItemRow(index, {
                                          description: e.target.value,
                                        })
                                      }
                                      placeholder="Description (optional)"
                                    />
                                </FieldTooltip>
                              </TableCell>
                              <TableCell>
                                <FieldTooltip value={row.partNo}>
                                    <Input
                                      value={row.partNo}
                                      onChange={(e) =>
                                        updateItemRow(index, {
                                          partNo: e.target.value,
                                        })
                                      }
                                      placeholder="Part no"
                                    />
                                </FieldTooltip>
                                <FieldTooltip value={row.itemCode}>
                                    <Input
                                      className="mt-2"
                                      value={row.itemCode}
                                      onChange={(e) =>
                                        updateItemRow(index, {
                                          itemCode: e.target.value,
                                        })
                                      }
                                      placeholder="Item code"
                                    />
                                </FieldTooltip>
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  value={row.cost}
                                  onChange={(e) =>
                                    updateItemRow(index, {
                                      cost: e.target.value,
                                    })
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <div className="grid gap-2">
                                  <Select
                                    value={markupMode}
                                    onValueChange={(value) =>
                                      updateItemRow(index, {
                                        markupMode: value as MarkupMode,
                                      })
                                    }
                                  >
                                    <SelectTrigger className="w-24">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="percent">%</SelectItem>
                                      <SelectItem value="fixed">Fixed</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    value={row.markupValue ?? ''}
                                    placeholder={formData.markupValue}
                                    onChange={(e) =>
                                      updateItemRow(index, {
                                        markupValue: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                              </TableCell>
                              <TableCell>
                                {new Intl.NumberFormat('ja-JP', {
                                  style: 'currency',
                                  currency: 'JPY',
                                }).format(unitPriceJPY)}
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  step="1"
                                  min={0}
                                  value={row.quantity}
                                  onChange={(e) =>
                                    updateItemRow(index, {
                                      quantity: e.target.value,
                                    })
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                {new Intl.NumberFormat('en-US', {
                                  style: 'currency',
                                  currency: formData.currency || 'USD',
                                }).format(calculatedUnitPrice)}
                              </TableCell>
                              <TableCell>
                                {new Intl.NumberFormat('en-US', {
                                  style: 'currency',
                                  currency: formData.currency || 'USD',
                                }).format(lineAmount)}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  type="button"
                                  onClick={() => removeItemRow(index)}
                                >
                                  <MinusCircle className="h-4 w-4 text-red-600" />
                                </Button>
                                {!row.itemsCatalogId && row.itemName.trim() && (
                                  <Button
                                    variant="ghost"
                                    type="button"
                                    onClick={() => saveRowToCatalog(row, index)}
                                  >
                                    <Save className="h-4 w-4 text-blue-600" />
                                  </Button>
                                )}
                              </TableCell>
                                </TableRow>
                              );
                            })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="flex justify-end">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-[560px]">
                    <div className="border rounded-md p-4 min-w-56 space-y-2">
                      <p className="text-sm text-muted-foreground">Total Cost (JPY)</p>
                      <p className="text-2xl font-semibold">
                        {new Intl.NumberFormat('ja-JP', {
                          style: 'currency',
                          currency: 'JPY',
                        }).format(calculatedTotalCost)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Total Profit (JPY):{' '}
                        {new Intl.NumberFormat('ja-JP', {
                          style: 'currency',
                          currency: 'JPY',
                        }).format(calculatedTotalProfitJPY)}
                      </p>
                    </div>
                    <div className="border rounded-md p-4 min-w-56 space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Calculated Total
                      </p>
                      <p className="text-2xl font-semibold">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: formData.currency || 'USD',
                        }).format(calculatedTotalAmount)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Total (JPY):{' '}
                        {new Intl.NumberFormat('ja-JP', {
                          style: 'currency',
                          currency: 'JPY',
                        }).format(calculatedTotalJPY)}
                      </p>
                      {shouldShowExistingLegacyTotal && (
                        <p className="text-sm text-muted-foreground">
                          Existing Total:{' '}
                          {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: formData.currency || 'USD',
                          }).format(existingLegacyTotalAmount)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button
                  className="min-w-36"
                  variant={'outline'}
                  type="button"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                {(!editingInvoice || editingInvoice.status === 'draft') && (
                  <Button
                    className="min-w-36"
                    type="submit"
                    variant="outline"
                    isLoading={isLoading}
                    onClick={() => setSubmitStatus('draft')}
                  >
                    Save as Draft
                  </Button>
                )}
                <Button
                  className="min-w-36"
                  type="submit"
                  isLoading={isLoading}
                  onClick={() => setSubmitStatus('pending')}
                >
                  {editingInvoice && editingInvoice.status !== 'draft'
                    ? 'Update Invoice'
                    : 'Create Invoice'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-8 space-y-6 ">
        <Card>
          <CardHeader>
            <CardTitle>Invoice List</CardTitle>
            <CardDescription>
              All invoices and their payment status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* <TableCell>
                    <div className="flex space-x-2 justify-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(invoice)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(invoice.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell> */}

            <div className="flex flex-col md:flex-row items-end py-4 gap-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 w-full md:w-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      Customers <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="max-h-64 overflow-auto"
                  >
                    {customers.map((customer) => (
                      <DropdownMenuCheckboxItem
                        key={customer.id}
                        checked={selectedCustomers.includes(customer.name)}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={(checked) => {
                          setSelectedCustomers((prev) =>
                            checked
                              ? [...prev, customer.name]
                              : prev.filter((name) => name !== customer.name)
                          );
                        }}
                      >
                        {customer.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      Status <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {statusOptions.map((status) => (
                      <DropdownMenuCheckboxItem
                        key={status}
                        checked={selectedStatuses.includes(status)}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={(checked) => {
                          setSelectedStatuses((prev) =>
                            checked
                              ? [...prev, status]
                              : prev.filter((s) => s !== status)
                          );
                        }}
                        className="capitalize"
                      >
                        {status.replace('_', ' ')}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      Currency <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuCheckboxItem
                      checked={selectedCurrencies.length === currencies.length}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedCurrencies(currencies.map((c) => c.code));
                        } else {
                          setSelectedCurrencies([]);
                        }
                      }}
                      className="capitalize font-semibold"
                    >
                      Select All
                    </DropdownMenuCheckboxItem>

                    <DropdownMenuSeparator />
                    {currencies.map((currency) => (
                      <DropdownMenuCheckboxItem
                        key={currency.code}
                        checked={selectedCurrencies.includes(currency.code)}
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={(checked) => {
                          setSelectedCurrencies((prev) =>
                            checked
                              ? [...prev, currency.code]
                              : prev.filter((c) => c !== currency.code)
                          );
                        }}
                        className="capitalize"
                      >
                        {currency.code}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  onClick={() => {
                    setSelectedCustomers([]);
                    setSelectedStatuses([]);
                    setSelectedCurrencies([]);
                    table.resetColumnFilters();
                  }}
                >
                  <FilterX className="" />
                  Reset Filters
                </Button>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="ml-auto">
                    Columns <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {table
                    .getAllColumns()
                    .filter((column) => column.getCanHide())
                    .map((column) => {
                      return (
                        <DropdownMenuCheckboxItem
                          key={column.id}
                          className="capitalize"
                          checked={column.getIsVisible()}
                          onCheckedChange={(value) =>
                            column.toggleVisibility(!!value)
                          }
                        >
                          {column.id}
                        </DropdownMenuCheckboxItem>
                      );
                    })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => {
                        return (
                          <TableHead key={header.id}>
                            {header.isPlaceholder
                              ? null
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext()
                                )}
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => navigate(`/invoices/${row.original.id}`)}
                        key={row.id}
                        data-state={row.getIsSelected() && 'selected'}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : loading ? (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="h-24 text-center"
                      >
                        <Spinner className="mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="h-24 text-center"
                      >
                        No Invoices Found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
          <CardFooter>
            <div className="flex flex-col justify-between gap-4 w-full md:flex-row">
              <div className="flex items-center gap-2 justify-center">
                <p className="text-sm text-muted-foreground">
                  Showing{' '}
                  {table.getState().pagination.pageIndex *
                    table.getState().pagination.pageSize +
                    1}
                  -
                  {Math.min(
                    (table.getState().pagination.pageIndex + 1) *
                      table.getState().pagination.pageSize,
                    table.getFilteredRowModel().rows.length
                  )}{' '}
                  of {table.getFilteredRowModel().rows.length} invoices
                </p>
              </div>
              <Pagination>
                <PaginationContent>
                  {/* Previous Button */}
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => table.previousPage()}
                      className={
                        !table.getCanPreviousPage()
                          ? 'pointer-events-none opacity-50'
                          : 'cursor-pointer'
                      }
                    />
                  </PaginationItem>

                  {/* Numbered Pages with Truncation */}
                  {paginationRange.map((item, idx) => (
                    <PaginationItem key={idx}>
                      {typeof item === 'string' ? (
                        <span className="px-2 text-muted-foreground">…</span>
                      ) : (
                        <PaginationLink
                          isActive={item === currentPage}
                          onClick={() => table.setPageIndex(item - 1)}
                          className="cursor-pointer"
                        >
                          {item}
                        </PaginationLink>
                      )}
                    </PaginationItem>
                  ))}

                  {/* Next Button */}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => table.nextPage()}
                      className={
                        !table.getCanNextPage()
                          ? 'pointer-events-none opacity-50'
                          : 'cursor-pointer'
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>

              <div className="flex justify-end ">
                <Select
                  value={table.getState().pagination.pageSize.toString()}
                  onValueChange={(value) => table.setPageSize(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Rows per page" />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 10, 25, 50].map((size) => (
                      <SelectItem key={size} value={size.toString()}>
                        {size} per page
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
