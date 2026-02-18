import type React from 'react';

import { useEffect, useState } from 'react';
import {
  ArrowUpDown,
  CalendarIcon,
  ChevronDown,
  FilterX,
  MoreHorizontal,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getLastPaymentByCustomerId,
  toJapanMidnight,
} from '@/Config/firestore';
import {
  type Invoice,
  type Payment,
  type PaymentAllocation,
  type SelectedInvoice,
} from '@/Config/types';
import { toast } from 'sonner';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/Config/firebase';
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
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { useNavigate } from 'react-router-dom';
import type { AppDispatch, RootState } from '@/redux/store/store';
import { useDispatch, useSelector } from 'react-redux';
import {
  addPaymentToList,
  deletePaymentFromList,
  fetchCurrencies,
  fetchCustomers,
  fetchPayments,
} from '@/redux/features/paymentSlice';
import {
  fetchCustomerInvoices,
  resetCustomerInvoices,
  setSelectedInvoices,
} from '@/redux/features/invoiceSlice';
import { Spinner } from '@/components/ui/spinner';
import { format } from 'date-fns';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { getPaginationRange, toFixed2 } from '@/lib/utils';

export default function Payments() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  const { loading, payments, customers, currencies } = useSelector(
    (state: RootState) => state.payment
  );

  const { customerInvoices, selectedInvoices } = useSelector(
    (state: RootState) => state.invoice
  );

  useEffect(() => {
    if (currencies.length === 0) {
      dispatch(fetchCurrencies());
    }
    if (customers.length === 0) {
      dispatch(fetchCustomers());
    }
    if (payments.length === 0) {
      dispatch(fetchPayments());
    }
  }, [dispatch, currencies.length, customers.length, payments.length]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    paymentNo: '',
    customerId: '',
    amount: '',
    JPYamount: '',
    receivedJPY: '',
    localBankCharge: '',
    foreignBankCharge: '',
    exchangeRate: '',
    currency: 'USD',
    date: new Date(),
    paymentDate: new Date(),
  });

  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>([]);
  const [bankChargeInvoiceId, setBankChargeInvoiceId] = useState('');
  const [autoAllocate, setAutoAllocate] = useState(true);

  useEffect(() => {
    if (formData.customerId && formData.currency) {
      dispatch(
        fetchCustomerInvoices({
          customerId: formData.customerId,
          currency: formData.currency,
        })
      );
    }
  }, [formData.customerId, formData.currency, dispatch]);

  useEffect(() => {
    if (customerInvoices.length === 0) {
      setBankChargeInvoiceId('');
      return;
    }
    setBankChargeInvoiceId((current) => {
      if (current && customerInvoices.some((inv) => inv.id === current)) {
        return current;
      }
      return customerInvoices[0].id;
    });
  }, [customerInvoices]);

  const getTotalDue = () => {
    const total = customerInvoices.reduce((sum, inv) => sum + inv.balance, 0);
    return toFixed2(total);
  };

  const getPaymentMetrics = (
    value: string,
    jpyAmount: string,
    fbc: string,
    lbc: string
  ) => {
    const amount = toFixed2(value || '0');
    const jpy = toFixed2(jpyAmount || '0');
    const foreignBankCharge = toFixed2(fbc || '0');
    const localBankCharge = toFixed2(lbc || '0');
    const effectiveAmount = toFixed2(amount - foreignBankCharge);
    const exchangeRate = effectiveAmount > 0 ? jpy / effectiveAmount : 0;
    const totalFormJPY = toFixed2(jpy - localBankCharge);

    return {
      amount,
      foreignBankCharge,
      localBankCharge,
      exchangeRate: toFixed2(exchangeRate),
      totalFormJPY,
    };
  };

  const applyAllocationMath = (
    baseAllocations: SelectedInvoice[],
    metrics: ReturnType<typeof getPaymentMetrics>,
    preferredChargeInvoiceId: string
  ) => {
    const fallbackChargeInvoiceId =
      baseAllocations.find((a) => a.allocatedAmount > 0)?.invoiceId || '';
    const chargeInvoiceId =
      preferredChargeInvoiceId &&
      baseAllocations.some((a) => a.invoiceId === preferredChargeInvoiceId)
        ? preferredChargeInvoiceId
        : fallbackChargeInvoiceId;

    let totalJPY = 0;
    const allocations = baseAllocations.map((alloc) => {
      const isChargeInvoice = alloc.invoiceId === chargeInvoiceId;
      const adjustedAlloc = toFixed2(
        alloc.allocatedAmount - (isChargeInvoice ? metrics.foreignBankCharge : 0)
      );
      const grossJPY =
        alloc.allocatedAmount > 0
          ? Math.floor(adjustedAlloc * metrics.exchangeRate)
          : 0;
      const recievedJPY = isChargeInvoice
        ? toFixed2(grossJPY - metrics.localBankCharge)
        : grossJPY;
      totalJPY += recievedJPY;

      return {
        ...alloc,
        foreignBankCharge: isChargeInvoice ? metrics.foreignBankCharge : 0,
        localBankCharge: isChargeInvoice ? metrics.localBankCharge : 0,
        recievedJPY,
      };
    });

    const totalAllocated = toFixed2(
      baseAllocations.reduce((sum, alloc) => sum + alloc.allocatedAmount, 0)
    );
    // Only force rounding reconciliation when the full payment amount is allocated.
    // During partial/manual allocation, keep per-invoice JPY responsive to user edits.
    if (totalAllocated === metrics.amount) {
      const diff = metrics.totalFormJPY - totalJPY;
      const chargeIndex = allocations.findIndex(
        (a) => a.invoiceId === chargeInvoiceId && a.allocatedAmount > 0
      );
      const fallbackIndex = allocations.findIndex((a) => a.allocatedAmount > 0);
      const adjustIndex = chargeIndex !== -1 ? chargeIndex : fallbackIndex;
      if (adjustIndex !== -1) {
        allocations[adjustIndex].recievedJPY += diff;
      }
    }

    return { allocations, chargeInvoiceId };
  };

  const refreshComputedValues = (
    nextFormData: typeof formData,
    allocations: SelectedInvoice[],
    preferredChargeInvoiceId: string
  ) => {
    const metrics = getPaymentMetrics(
      nextFormData.amount,
      nextFormData.JPYamount,
      nextFormData.foreignBankCharge,
      nextFormData.localBankCharge
    );
    const { allocations: recalculated, chargeInvoiceId } = applyAllocationMath(
      allocations,
      metrics,
      preferredChargeInvoiceId
    );

    setFormData({
      ...nextFormData,
      exchangeRate: metrics.exchangeRate.toString(),
      receivedJPY: metrics.totalFormJPY.toString(),
    });
    dispatch(setSelectedInvoices(recalculated));
    if (chargeInvoiceId && chargeInvoiceId !== bankChargeInvoiceId) {
      setBankChargeInvoiceId(chargeInvoiceId);
    }
  };

  const handleAutoAllocate = (
    nextFormData: typeof formData = formData,
    forceOldestChargeInvoice = false
  ) => {
    if (!customerInvoices.length) {
      refreshComputedValues(nextFormData, selectedInvoices, bankChargeInvoiceId);
      return;
    }

    const amount = toFixed2(nextFormData.amount || '0');
    let remaining = amount;

    const baseAllocations: SelectedInvoice[] = customerInvoices.map((inv) => {
      const allocatedAmount =
        remaining > 0 ? toFixed2(Math.min(remaining, inv.balance)) : 0;
      remaining = toFixed2(remaining - allocatedAmount);
      return {
        invoiceId: inv.id,
        allocatedAmount,
        balance: inv.balance,
        foreignBankCharge: 0,
        localBankCharge: 0,
        recievedJPY: 0,
      };
    });

    const firstAllocatedInvoiceId =
      baseAllocations.find((a) => a.allocatedAmount > 0)?.invoiceId || '';
    const preferredChargeInvoiceId =
      !forceOldestChargeInvoice &&
      bankChargeInvoiceId &&
      baseAllocations.some((a) => a.invoiceId === bankChargeInvoiceId)
        ? bankChargeInvoiceId
        : firstAllocatedInvoiceId;
    setBankChargeInvoiceId(preferredChargeInvoiceId);
    refreshComputedValues(nextFormData, baseAllocations, preferredChargeInvoiceId);
  };

  const handleAllocationChange = (invoiceId: string, value: string) => {
    const nextAmount = toFixed2(value || '0');
    const updatedAllocations = selectedInvoices.map((alloc) => {
      if (alloc.invoiceId !== invoiceId) return alloc;
      const boundedAmount = Math.max(0, Math.min(nextAmount, alloc.balance));
      return {
        ...alloc,
        allocatedAmount: boundedAmount,
      };
    });

    const preferredChargeInvoiceId =
      bankChargeInvoiceId ||
      updatedAllocations.find((a) => a.allocatedAmount > 0)?.invoiceId ||
      '';
    refreshComputedValues(formData, updatedAllocations, preferredChargeInvoiceId);
  };

  const generatePaymentNo = () => {
    const timestamp = Date.now().toString().slice(-6);
    return `PAY-${timestamp}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.paymentNo ||
      !formData.customerId ||
      !formData.amount ||
      !formData.paymentDate ||
      selectedInvoices.length === 0
    ) {
      toast.error('Error', {
        description:
          'Please fill in all required fields and select at least one invoice',
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

    const localBankCharge = toFixed2(formData.localBankCharge) || 0;
    const foreignBankCharge = toFixed2(formData.foreignBankCharge) || 0;
    const hasBankCharge = localBankCharge > 0 || foreignBankCharge > 0;

    if (hasBankCharge && !bankChargeInvoiceId) {
      toast.error('Error', {
        description: 'Please select a bank charge invoice.',
      });
      return;
    }

    const nonZeroAllocations = selectedInvoices
      .filter((i) => i.allocatedAmount > 0)
      .map((invoice) => ({
        ...invoice,
      }));

    const amount = toFixed2(formData.amount);
    const amountInJPY = toFixed2(formData.receivedJPY);
    const totalAllocated = toFixed2(
      nonZeroAllocations.reduce((sum, i) => sum + i.allocatedAmount, 0)
    );
    const totalJPY = toFixed2(
      nonZeroAllocations.reduce((sum, i) => sum + i.recievedJPY, 0)
    );

    const exchangeRate = toFixed2(formData.exchangeRate || '0');

    if (totalAllocated !== amount) {
      toast.error('Error', {
        description: 'Allocated amount does not match payment amount',
      });
      return;
    }

    if (totalJPY !== amountInJPY) {
      toast.error('Error', {
        description: 'Allocated JPY amount does not match payment amount',
      });
      return;
    }

    // 1. Check each allocation ≤ invoice balance
    const hasOverAllocated = nonZeroAllocations.some(
      (inv) => inv.allocatedAmount > inv.balance
    );

    if (hasOverAllocated) {
      toast.error('Error', {
        description:
          'One or more invoices have allocations greater than their balance.',
      });
      return;
    }

    if (hasBankCharge) {
      const bankChargeAllocation = nonZeroAllocations.find(
        (alloc) => alloc.invoiceId === bankChargeInvoiceId
      );
      if (!bankChargeAllocation) {
        toast.error('Error', {
          description:
            'The selected bank charge invoice must have an allocated amount.',
        });
        return;
      }
      if (bankChargeAllocation.allocatedAmount < foreignBankCharge) {
        toast.error('Error', {
          description:
            'Bank charge invoice allocation must be at least the foreign bank charge.',
        });
        return;
      }
    }

    try {
      setIsLoading(true);

      // 1. Prepare atomic write batch
      const batch = writeBatch(db);
      const paymentRef = doc(collection(db, 'payments'));

      // 2. Prepare Payment
      const paymentData = {
        paymentNo: formData.paymentNo,
        date: toJapanMidnight(formData.date),
        paymentDate: toJapanMidnight(formData.paymentDate),
        customerId: formData.customerId,
        customerName: customer.name,
        currency: formData.currency,
        amount,
        exchangeRate,
        allocatedAmount: totalAllocated,
        amountInJPY,
        foreignBankCharge,
        localBankCharge,
        createdAt: new Date(),
      };

      const paymentId = paymentRef.id;
      batch.set(paymentRef, paymentData);

      // 3. Allocate to Invoices
      for (const alloc of nonZeroAllocations) {
        const invoiceRef = doc(db, 'invoices', alloc.invoiceId);
        const invoiceSnap = await getDoc(invoiceRef);
        if (!invoiceSnap.exists()) continue;

        const invoice = invoiceSnap.data() as Invoice;
        const newAmountPaid = toFixed2(
          invoice.amountPaid + alloc.allocatedAmount
        );
        const newBalance = toFixed2(invoice.totalAmount - newAmountPaid);
        const newStatus = newBalance === 0 ? 'paid' : 'partially_paid';
        const newforeignBankCharge = toFixed2(
          invoice.foreignBankCharge + alloc.foreignBankCharge
        );
        const newlocalBankCharge = toFixed2(
          invoice.localBankCharge + alloc.localBankCharge
        );
        const newRecievedJPY = toFixed2(
          (invoice.recievedJPY || 0) + alloc.recievedJPY
        );

        batch.update(invoiceRef, {
          amountPaid: newAmountPaid,
          balance: newBalance,
          status: newStatus,
          foreignBankCharge: newforeignBankCharge,
          localBankCharge: newlocalBankCharge,
          recievedJPY: newRecievedJPY,
        });

        // Set bank payment values only for the first allocation
        const allocRef = doc(collection(db, 'paymentAllocations'));
        batch.set(allocRef, {
          paymentId,
          invoiceId: alloc.invoiceId,
          invoiceNo: invoice.invoiceNo,
          allocatedAmount: alloc.allocatedAmount,
          createdAt: new Date(),
          localBankCharge: alloc.localBankCharge,
          foreignBankCharge: alloc.foreignBankCharge,
          recievedJPY: alloc.recievedJPY,
          exchangeRate,
        });
      }

      // 4. Update Customer Due
      const customerRef = doc(db, 'customers', formData.customerId);
      const customerSnap = await getDoc(customerRef);
      if (customerSnap.exists()) {
        const currentAmount = customerSnap.data().amountInJPY || 0;
        batch.update(customerRef, {
          amountInJPY: toFixed2(currentAmount + amountInJPY),
        });
      }

      // 5. Update Currency Due
      const currencyQuery = query(
        collection(db, 'currencies'),
        where('code', '==', formData.currency)
      );
      const currencySnap = await getDocs(currencyQuery);
      if (!currencySnap.empty) {
        const currencyDoc = currencySnap.docs[0];
        const currencyData = currencyDoc.data();
        const currentAmountDue = currencyData.amountDue || 0;
        const currentAmountPaid = currencyData.amountPaid || 0;
        const currentlocalBankCharge = currencyData.localBankCharge || 0;
        const currentforeignBankCharge = currencyData.foreignBankCharge || 0;
        const currentAmountInJPY = currencyData.amountInJPY || 0;

        batch.update(currencyDoc.ref, {
          amountDue: Math.max(0, toFixed2(currentAmountDue - totalAllocated)),
          amountPaid: toFixed2(currentAmountPaid + totalAllocated),
          localBankCharge: toFixed2(currentlocalBankCharge + localBankCharge),
          foreignBankCharge: toFixed2(
            currentforeignBankCharge + foreignBankCharge
          ),
          amountInJPY: toFixed2(currentAmountInJPY + amountInJPY),
        });
      }

      await batch.commit();

      dispatch(
        addPaymentToList({
          id: paymentId,
          ...paymentData,
        })
      );

      toast.success('Success', {
        description: 'Payment recorded and allocated successfully',
      });

      setIsDialogOpen(false);
      setFormData({
        paymentNo: '',
        customerId: '',
        amount: '',
        JPYamount: '',
        receivedJPY: '',
        localBankCharge: '',
        foreignBankCharge: '',
        currency: 'USD',
        exchangeRate: '',
        date: new Date(),
        paymentDate: new Date(),
      });
      setBankChargeInvoiceId('');
      setAutoAllocate(true);
      dispatch(setSelectedInvoices([]));
    } catch (error) {
      console.error('Error recording payment:', error);
      toast.error('Error', {
        description: 'Failed to record payment',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (paymentId: string) => {
    if (!paymentId) return;

    try {
      setIsLoading(true);

      // 1. Get Payment
      const paymentRef = doc(db, 'payments', paymentId);
      const paymentSnap = await getDoc(paymentRef);
      if (!paymentSnap.exists()) {
        toast.error('Error', { description: 'Payment not found' });
        return;
      }

      const paymentData = paymentSnap.data() as Payment;

      // 2. Get Allocations
      const allocationsSnap = await getDocs(
        query(
          collection(db, 'paymentAllocations'),
          where('paymentId', '==', paymentId)
        )
      );

      if (allocationsSnap.empty) {
        toast.error('Error', {
          description: 'No allocations found for payment',
        });
        return;
      }

      const batch = writeBatch(db);

      for (const allocDoc of allocationsSnap.docs) {
        const alloc = allocDoc.data() as PaymentAllocation;
        const invoiceRef = doc(db, 'invoices', alloc.invoiceId);
        const invoiceSnap = await getDoc(invoiceRef);
        if (!invoiceSnap.exists()) continue;

        const invoice = invoiceSnap.data() as Invoice;

        const newAmountPaid = toFixed2(
          invoice.amountPaid - alloc.allocatedAmount
        );
        const newBalance = toFixed2(invoice.totalAmount - newAmountPaid);
        const newStatus =
          newBalance === 0
            ? 'paid'
            : newAmountPaid === 0
            ? 'pending'
            : 'partially_paid';

        const newforeignBankCharge = toFixed2(
          invoice.foreignBankCharge - (alloc.foreignBankCharge || 0)
        );

        const newlocalBankCharge = toFixed2(
          invoice.localBankCharge - (alloc.localBankCharge || 0)
        );

        const newRecievedJPY = toFixed2(
          (invoice.recievedJPY || 0) - (alloc.recievedJPY || 0)
        );

        batch.update(invoiceRef, {
          amountPaid: Math.max(0, newAmountPaid),
          balance: newBalance,
          status: newStatus,
          foreignBankCharge: newforeignBankCharge,
          localBankCharge: newlocalBankCharge,
          recievedJPY: newRecievedJPY,
        });

        // Delete allocation
        batch.delete(allocDoc.ref);
      }

      // 3. Delete Payment
      batch.delete(paymentRef);

      // 4. Update Customer amountInJPY
      const customerRef = doc(db, 'customers', paymentData.customerId);
      const customerSnap = await getDoc(customerRef);
      if (customerSnap.exists()) {
        const currentJPY = customerSnap.data().amountInJPY || 0;
        batch.update(customerRef, {
          amountInJPY: +(currentJPY - (paymentData.amountInJPY || 0)).toFixed(
            2
          ),
        });
      }

      // 5. Update Currency Info
      const currencyQuery = query(
        collection(db, 'currencies'),
        where('code', '==', paymentData.currency)
      );
      const currencySnap = await getDocs(currencyQuery);
      if (!currencySnap.empty) {
        const currencyDoc = currencySnap.docs[0];
        const currencyData = currencyDoc.data();

        const updatedAmountPaid = toFixed2(
          currencyData.amountPaid - paymentData.allocatedAmount
        );
        const updatedAmountDue = toFixed2(
          currencyData.amountDue + paymentData.allocatedAmount
        );
        const updatedLocalCharge = toFixed2(
          currencyData.localBankCharge - (paymentData.localBankCharge || 0)
        );
        const updatedForeignCharge = toFixed2(
          currencyData.foreignBankCharge - (paymentData.foreignBankCharge || 0)
        );
        const updatedJPY = toFixed2(
          currencyData.amountInJPY - (paymentData.amountInJPY || 0)
        );

        batch.update(currencyDoc.ref, {
          amountPaid: updatedAmountPaid,
          amountDue: updatedAmountDue,
          localBankCharge: updatedLocalCharge,
          foreignBankCharge: updatedForeignCharge,
          amountInJPY: updatedJPY,
        });
      }

      await batch.commit();

      dispatch(deletePaymentFromList(paymentId));

      toast.success('Success', {
        description: 'Payment deleted and allocations reversed successfully',
      });
    } catch (error) {
      console.error('Error deleting payment:', error);
      toast.error('Error', {
        description: 'Failed to delete payment',
      });
    } finally {
      setIsLoading(false);
      setIsDeleteDialogOpen(false);
    }
  };

  const columns: ColumnDef<Payment>[] = [
    // {
    //   id: 'select',
    //   header: ({ table }) => (
    //     <Checkbox
    //       checked={
    //         table.getIsAllPageRowsSelected() ||
    //         (table.getIsSomePageRowsSelected() && 'indeterminate')
    //       }
    //       onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
    //       aria-label="Select all"
    //     />
    //   ),
    //   cell: ({ row }) => (
    //     <Checkbox
    //       checked={row.getIsSelected()}
    //       onCheckedChange={(value) => row.toggleSelected(!!value)}
    //       aria-label="Select row"
    //     />
    //   ),
    //   enableSorting: false,
    //   enableHiding: false,
    // },

    {
      accessorKey: 'paymentNo',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            No
            <ArrowUpDown />
          </Button>
        );
      },
      cell: ({ row }) => (
        <div className="capitalize">{row.getValue('paymentNo')}</div>
      ),
    },
    {
      accessorKey: 'paymentDate',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Payment Date
            <ArrowUpDown />
          </Button>
        );
      },
      cell: ({ row }) => {
        const value = row.getValue('paymentDate');
        if (!value) return <div>-</div>;
        return (
          <div className="capitalize">
            {new Date(value as string | number | Date).toLocaleDateString('ja-JP')}
          </div>
        );
      },
    },
    {
      accessorKey: 'date',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Credit Date
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
        <div className="capitalize">{row.getValue('currency')}</div>
      ),
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Amount
            <ArrowUpDown />
          </Button>
        );
      },
      cell: ({ row }) => {
        const amount = toFixed2(row.getValue('amount'));
        // Format the amount as a dollar amount
        const formatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: row.getValue('currency') || 'USD',
        }).format(amount);
        return <div>{formatted}</div>;
      },
    },

    {
      id: 'actions',
      enableHiding: false,
      cell: ({ row }) => {
        const payment = row.original;
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
                  navigator.clipboard.writeText(payment.id);
                }}
              >
                Copy payment ID
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  // Navigate to customer details page
                }}
              >
                View customer
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async (e) => {
                  e.stopPropagation();

                  const lastPayment = await getLastPaymentByCustomerId(
                    payment.customerId
                  );

                  if (lastPayment?.id === payment.id) {
                    // Safe to delete
                    setPaymentId(payment.id);
                    setIsDeleteDialogOpen(true);
                  } else {
                    toast.error('Cannot delete', {
                      description:
                        'Only the latest payment for this customer can be deleted.',
                    });
                  }
                }}
              >
                <Trash2 className="text-red-700" />
                Delete Payment
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const table = useReactTable({
    data: payments,
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
    table.getColumn('currency')?.setFilterValue(selectedCurrencies);
  }, [selectedCurrencies, table]);

  const allocatedInvoices = selectedInvoices.filter(
    (invoice) => invoice.allocatedAmount > 0
  );
  const allocatedInvoiceOptions = customerInvoices.filter((invoice) =>
    allocatedInvoices.some((alloc) => alloc.invoiceId === invoice.id)
  );

  useEffect(() => {
    if (allocatedInvoiceOptions.length === 0) {
      setBankChargeInvoiceId('');
      return;
    }
    if (
      !bankChargeInvoiceId ||
      !allocatedInvoiceOptions.some((invoice) => invoice.id === bankChargeInvoiceId)
    ) {
      setBankChargeInvoiceId(allocatedInvoiceOptions[0].id);
    }
  }, [allocatedInvoiceOptions, bankChargeInvoiceId]);

  const totalAllocatedAmount = toFixed2(
    selectedInvoices.reduce((sum, inv) => sum + inv.allocatedAmount, 0)
  );
  const remainingAllocation = toFixed2(
    toFixed2(formData.amount || '0') - totalAllocatedAmount
  );

  return (
    <div className="h-screen flex flex-col py-6 gap-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 px-6 md:px-8">
        <div>
          <h1 className="text-3xl font-bold">Payments</h1>
          <p className="text-muted-foreground">
            Record and track customer payments
          </p>
        </div>

        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Payment</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this payment? This action cannot
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
                className="min-w-36"
                isLoading={isLoading}
                onClick={() => {
                  if (paymentId) {
                    handleDelete(paymentId);
                  }
                }}
              >
                Delete Payment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
              className="min-w-36"
              onClick={() => {
                setErrorMessage(null);
                setBankChargeInvoiceId('');
                setAutoAllocate(true);
                setFormData({
                  paymentNo: generatePaymentNo(),
                  customerId: '',
                  amount: '',
                  JPYamount: '',
                  receivedJPY: '',
                  localBankCharge: '',
                  exchangeRate: '',
                  foreignBankCharge: '',
                  currency: 'USD',
                  date: new Date(),
                  paymentDate: new Date(),
                });
                dispatch(resetCustomerInvoices());
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Record Payment
            </Button>
          </DialogTrigger>
          <DialogContent
            onPointerDownOutside={(e) => e.preventDefault()}
            // onEscapeKeyDown={(e) => e.preventDefault()}
            className="overflow-y-auto max-h-[90vh]"
          >
            <DialogHeader>
              <DialogTitle>Record New Payment</DialogTitle>
              <DialogDescription>
                Enter payment details, allocate manually, or use auto allocation.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="paymentNo">Payment Number *</Label>
                  <Input
                    id="paymentNo"
                    value={formData.paymentNo}
                    onChange={(e) =>
                      setFormData({ ...formData, paymentNo: e.target.value })
                    }
                    placeholder="PAY-001"
                    required
                  />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Payment Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant={'outline'}
                          className="w-full justify-start text-left font-normal"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.paymentDate ? (
                            format(formData.paymentDate, 'PPP')
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={formData.paymentDate}
                          captionLayout="dropdown"
                          onSelect={(date) => {
                            if (date) {
                              setFormData({ ...formData, paymentDate: date });
                            }
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="grid gap-2">
                    <Label>CreditDate</Label>
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
                </div>
                <div className="flex flex-col md:flex-row gap-4 justify-between">
                  <div className="flex gap-4 ">
                    <div className="grid gap-2">
                      <Label htmlFor="customer">Customer *</Label>
                      <Select
                        value={formData.customerId}
                        onValueChange={(value) => {
                          setErrorMessage(null);
                          setBankChargeInvoiceId('');
                          dispatch(resetCustomerInvoices());
                          setFormData({
                            ...formData,
                            customerId: value,
                            amount: '',
                            JPYamount: '',
                            receivedJPY: '',
                            localBankCharge: '',
                            foreignBankCharge: '',
                            exchangeRate: '',
                            currency:
                              customers.find((c) => c.id === value)?.currency ||
                              'USD',
                          });
                        }}
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
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="currency">Currency</Label>
                      <Select
                        value={formData.currency}
                        onValueChange={(value) => {
                          setErrorMessage(null);
                          setBankChargeInvoiceId('');
                          dispatch(resetCustomerInvoices());
                          setFormData({
                            ...formData,
                            currency: value,
                            amount: '',
                            JPYamount: '',
                            receivedJPY: '',
                            localBankCharge: '',
                            foreignBankCharge: '',
                            exchangeRate: value === 'JPY' ? '1' : '',
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {currencies.map((currency) => (
                            <SelectItem
                              key={currency.code}
                              value={currency.code}
                            >
                              {currency.code}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {customerInvoices.length > 0 ? (
                    <div className="grid gap-2 align-end">
                      <Label>Total Due</Label>

                      <p className=" text-orange-500">
                        {getTotalDue()} {formData.currency}
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-2 align-end">
                      <Label>Total Due</Label>
                      <p className=" text-green-500">0 {formData.currency}</p>
                    </div>
                  )}
                </div>
                <div className="grid md:grid-cols-2 gap-4 w-full">
                  <div className="grid gap-2 w-full">
                    <Label htmlFor="amount">Amount *</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      value={formData.amount}
                      disabled={!formData.customerId}
                      min="0"
                      max={getTotalDue()}
                      onChange={(e) => {
                        const max = getTotalDue();

                        if (parseFloat(e.target.value) > max) {
                          setErrorMessage('Allocated amount exceeds total due');
                        } else {
                          setErrorMessage(null);
                        }

                        let nextFormData = { ...formData, amount: e.target.value };
                        if (formData.currency === 'JPY') {
                          const jpyAmount = toFixed2(
                            Math.max(
                              0,
                              toFixed2(e.target.value || '0') -
                                toFixed2(formData.foreignBankCharge || '0')
                            )
                          ).toString();
                          nextFormData = {
                            ...formData,
                            JPYamount: jpyAmount,
                            amount: e.target.value,
                          };
                        }
                        if (autoAllocate) {
                          handleAutoAllocate(nextFormData);
                        } else {
                          refreshComputedValues(
                            nextFormData,
                            selectedInvoices,
                            bankChargeInvoiceId
                          );
                        }
                      }}
                      placeholder="0.00"
                      required
                    />
                    {errorMessage && (
                      <p className="text-red-500">{errorMessage}</p>
                    )}
                  </div>
                  <div className="grid gap-2 w-full">
                    <Label htmlFor="foreignBankCharge">
                      Foreign Bank Charge
                    </Label>
                    <Input
                      id="foreignBankCharge"
                      type="number"
                      step="0.01"
                      disabled={!formData.customerId}
                      value={formData.foreignBankCharge}
                      onChange={(e) => {
                        const nextForeignBankCharge = e.target.value;
                        const nextJpyAmount =
                          formData.currency === 'JPY'
                            ? toFixed2(
                                Math.max(
                                  0,
                                  toFixed2(formData.amount || '0') -
                                    toFixed2(nextForeignBankCharge || '0')
                                )
                              ).toString()
                            : formData.JPYamount;
                        const nextFormData = {
                          ...formData,
                          foreignBankCharge: nextForeignBankCharge,
                          JPYamount: nextJpyAmount,
                        };
                        if (autoAllocate) {
                          handleAutoAllocate(nextFormData);
                        } else {
                          refreshComputedValues(
                            nextFormData,
                            selectedInvoices,
                            bankChargeInvoiceId
                          );
                        }
                      }}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2 w-full">
                  <div className="grid gap-2 w-full">
                    <Label htmlFor="JPYamount">Amount In JPY*</Label>
                    <Input
                      id="JPYamount"
                      type="number"
                      disabled={!formData.customerId}
                      readOnly={formData.currency === 'JPY'}
                      value={formData.JPYamount}
                      placeholder="0"
                      required
                      onChange={(e) => {
                        if (formData.currency === 'JPY') return;
                        const nextFormData = {
                          ...formData,
                          JPYamount: e.target.value,
                        };
                        if (autoAllocate) {
                          handleAutoAllocate(nextFormData);
                        } else {
                          refreshComputedValues(
                            nextFormData,
                            selectedInvoices,
                            bankChargeInvoiceId
                          );
                        }
                      }}
                    />
                  </div>{' '}
                  <div className="grid gap-2 w-full">
                    <Label htmlFor="exchangeRate">Exchange Rate</Label>
                    <Input
                      id="exchangeRate"
                      type="number"
                      step="0.01"
                      readOnly
                      disabled
                      value={formData.exchangeRate}
                      placeholder="0.00"
                      required
                    />
                  </div>
                </div>{' '}
                <div className="grid md:grid-cols-2 gap-4 w-full">
                  <div className="grid gap-2 w-full">
                    <Label htmlFor="localBankCharge">Local Bank Charge</Label>
                    <Input
                      id="localBankCharge"
                      type="number"
                      step="0.01"
                      value={formData.localBankCharge}
                      disabled={!formData.JPYamount}
                      onChange={(e) => {
                        const nextFormData = {
                          ...formData,
                          localBankCharge: e.target.value,
                        };
                        if (autoAllocate) {
                          handleAutoAllocate(nextFormData);
                        } else {
                          refreshComputedValues(
                            nextFormData,
                            selectedInvoices,
                            bankChargeInvoiceId
                          );
                        }
                      }}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="grid gap-2 w-full">
                    <Label htmlFor="receivedJPY">Received JPY</Label>
                    <Input
                      id="receivedJPY"
                      type="number"
                      step="0.01"
                      value={formData.receivedJPY}
                      readOnly
                      placeholder="0.00"
                    />
                  </div>
                </div>
                {selectedInvoices.length > 0 && (
                  <div className="grid gap-2">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <Label>Allocate Amounts</Label>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="auto-allocate"
                            checked={autoAllocate}
                            onCheckedChange={(checked) => {
                              const value = !!checked;
                              setAutoAllocate(value);
                              if (value) {
                                handleAutoAllocate(formData, true);
                              }
                            }}
                          />
                          <Label htmlFor="auto-allocate" className="text-sm">
                            Auto Allocate
                          </Label>
                        </div>
                        <p
                          className={
                            remainingAllocation === 0
                              ? 'text-green-600 text-sm'
                              : remainingAllocation < 0
                              ? 'text-red-600 text-sm'
                              : 'text-orange-500 text-sm'
                          }
                        >
                          {remainingAllocation < 0
                            ? `Over allocated: ${Math.abs(remainingAllocation)} ${formData.currency}`
                            : `Remaining: ${remainingAllocation} ${formData.currency}`}
                        </p>
                      </div>
                    </div>
                    {selectedInvoices.map((item, index) => {
                      const invoice = customerInvoices.find(
                        (inv) => inv.id === item.invoiceId
                      );
                      return (
                        <div
                          key={index}
                          className="flex items-center gap-2 my-1"
                        >
                          <span className="flex-1">
                            <span> {invoice?.invoiceNo} </span>:{' '}
                            <span className=" text-muted-foreground">
                              {new Intl.NumberFormat('ja-JP', {
                                style: 'currency',
                                currency: invoice?.currency || 'JPY',
                              }).format(invoice?.balance || 0)}{' '}
                            </span>
                          </span>
                          <div className="grid gap-2 grid-cols-2 items-center">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max={item.balance}
                              value={item.allocatedAmount}
                              disabled={autoAllocate}
                              onChange={(e) =>
                                handleAllocationChange(item.invoiceId, e.target.value)
                              }
                              placeholder="0.00"
                              className="w-32"
                            />

                            <p className="bg-muted p-1 rounded-md min-w-24 flex justify-center">
                              {new Intl.NumberFormat('ja-JP', {
                                style: 'currency',
                                currency: 'JPY',
                              }).format(item.recievedJPY)}{' '}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {customerInvoices.length > 0 && (
                  <div className="grid gap-2">
                    <Label htmlFor="bankChargeInvoice">
                      Bank Charge Invoice
                    </Label>
                    <Select
                      value={bankChargeInvoiceId}
                      disabled={allocatedInvoiceOptions.length === 0 || autoAllocate}
                      onValueChange={(value) => {
                        setBankChargeInvoiceId(value);
                        refreshComputedValues(formData, selectedInvoices, value);
                      }}
                    >
                      <SelectTrigger id="bankChargeInvoice">
                        <SelectValue placeholder="Allocate an invoice first" />
                      </SelectTrigger>
                      <SelectContent>
                        {allocatedInvoiceOptions.map((invoice) => (
                          <SelectItem key={invoice.id} value={invoice.id}>
                            {invoice.invoiceNo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <DialogFooter className="mt-4">
                <Button
                  type="button"
                  className="min-w-36"
                  variant={'outline'}
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="min-w-36"
                  type="submit"
                  isLoading={isLoading}
                >
                  Record Payment
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-8 space-y-6 ">
        <Card>
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
            <CardDescription>
              All recorded payments and their allocation status
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                      Currency <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
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
                        key={row.id}
                        data-state={row.getIsSelected() && 'selected'}
                        className="cursor-pointer"
                        onClick={() => {
                          navigate(`/payments/${row.original.id}`);
                        }}
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
                        No Payments Found
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
                  of {table.getFilteredRowModel().rows.length} payments
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
