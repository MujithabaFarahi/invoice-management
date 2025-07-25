'use client';

import type React from 'react';

import { useEffect, useState } from 'react';
import {
  ArrowUpDown,
  CalendarIcon,
  ChevronDown,
  FilterX,
  MoreHorizontal,
  Plus,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { addPayment } from '@/Config/firestore';
import { getPaginationRange, type Invoice, type Payment } from '@/Config/types';
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
import { Checkbox } from '@/components/ui/checkbox';
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
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    paymentNo: '',
    customerId: '',
    amount: '',
    localBankPayment: '',
    foreignBankPayment: '',
    currency: 'USD',
    date: new Date(),
  });

  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>([]);

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

  const getTotalDue = () => {
    return customerInvoices.reduce((sum, inv) => sum + inv.balance, 0);
  };

  const allocatePaymentToInvoices = (value: string) => {
    const amount = parseFloat(value) ?? 0;

    if (customerInvoices.length === 0) return;

    let remaining = amount;
    const allocations = customerInvoices.map((inv) => {
      if (remaining <= 0) {
        return {
          invoiceId: inv.id,
          allocatedAmount: 0,
          balance: inv.balance,
          foreignBankPayment: 0,
          localBankPayment: 0,
        };
      }

      const alloc = Math.min(remaining, inv.balance);
      remaining -= alloc;

      return {
        invoiceId: inv.id,
        allocatedAmount: alloc,
        balance: inv.balance,
        foreignBankPayment: 0,
        localBankPayment: 0,
      };
    });

    dispatch(setSelectedInvoices(allocations));
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

    const localBankPayment = parseFloat(formData.localBankPayment) || 0;
    const foreignBankPayment = parseFloat(formData.foreignBankPayment) || 0;

    const nonZeroAllocations = selectedInvoices
      .filter((i) => i.allocatedAmount > 0)
      .map((invoice, index) => ({
        ...invoice,
        foreignBankPayment: index === 0 ? foreignBankPayment : 0,
        localBankPayment: index === 0 ? localBankPayment : 0,
      }));

    const amount = Number.parseFloat(formData.amount);
    const totalAllocated = nonZeroAllocations.reduce(
      (sum, i) => sum + i.allocatedAmount,
      0
    );

    if (totalAllocated > amount) {
      toast.error('Error', {
        description: 'Allocated amount exceeds payment amount',
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

    // 2. Check totalAllocated === amount
    if (totalAllocated !== amount) {
      toast.error('Error', {
        description: 'Allocated amount must exactly match the payment amount.',
      });
      return;
    }

    try {
      setIsLoading(true);

      // 1. Add Payment
      const paymentData = {
        paymentNo: formData.paymentNo,
        date: formData.date,
        customerId: formData.customerId,
        customerName: customer.name,
        currency: formData.currency,
        amount,
        allocatedAmount: totalAllocated,
        remainingAmount: amount - totalAllocated,
        foreignBankPayment,
        localBankPayment,
        createdAt: new Date(),
      };

      const paymentId = await addPayment(paymentData);

      // 2. Allocate to Invoices
      const batch = writeBatch(db);
      for (const alloc of nonZeroAllocations) {
        const invoiceRef = doc(db, 'invoices', alloc.invoiceId);
        const invoiceSnap = await getDoc(invoiceRef);
        if (!invoiceSnap.exists()) continue;

        const invoice = invoiceSnap.data() as Invoice;
        const newAmountPaid = invoice.amountPaid + alloc.allocatedAmount;
        const newBalance = invoice.totalAmount - newAmountPaid;
        const newStatus = newBalance === 0 ? 'paid' : 'partially_paid';
        const newForeignBankPayment =
          invoice.foreignBankPayment + alloc.foreignBankPayment;
        const newLocalBankPayment =
          invoice.localBankPayment + alloc.localBankPayment;

        batch.update(invoiceRef, {
          amountPaid: newAmountPaid,
          balance: newBalance,
          status: newStatus,
          foreignBankPayment: newForeignBankPayment,
          localBankPayment: newLocalBankPayment,
        });

        // Set bank payment values only for the first allocation
        const allocRef = doc(collection(db, 'paymentAllocations'));
        batch.set(allocRef, {
          paymentId,
          invoiceId: alloc.invoiceId,
          invoiceNo: invoice.invoiceNo,
          allocatedAmount: alloc.allocatedAmount,
          createdAt: new Date(),
          localBankPayment: alloc.localBankPayment,
          foreignBankPayment: alloc.foreignBankPayment,
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
        const currentLocalBankPayment = currencyData.localBankPayment || 0;
        const currentForeignBankPayment = currencyData.foreignBankPayment || 0;

        batch.update(currencyDoc.ref, {
          amountDue: Math.max(0, currentAmountDue - totalAllocated),
          amountPaid: currentAmountPaid + totalAllocated,
          localBankPayment: currentLocalBankPayment + localBankPayment,
          foreignBankPayment: currentForeignBankPayment + foreignBankPayment,
        });
      }

      // 6. Update Payment allocation info
      batch.update(doc(db, 'payments', paymentId), {
        allocatedAmount: totalAllocated,
        remainingAmount: amount - totalAllocated,
      });

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
        localBankPayment: '',
        foreignBankPayment: '',
        currency: 'USD',
        date: new Date(),
      });
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

  const columns: ColumnDef<Payment>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },

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
      accessorKey: 'createdAt',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Date
            <ArrowUpDown />
          </Button>
        );
      },
      cell: ({ row }) => (
        <div className="capitalize">
          {new Date(row.getValue('createdAt')).toISOString().split('T')[0]}
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
        const amount = parseFloat(row.getValue('amount'));
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
                onClick={() => navigator.clipboard.writeText(payment.id)}
              >
                Copy payment ID
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>View customer</DropdownMenuItem>
              <DropdownMenuItem>View payment details</DropdownMenuItem>
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Payments</h1>
          <p className="text-muted-foreground">
            Record and track customer payments
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
              className="min-w-36"
              onClick={() => {
                setErrorMessage(null);
                setFormData({
                  paymentNo: generatePaymentNo(),
                  customerId: '',
                  amount: '',
                  localBankPayment: '',
                  foreignBankPayment: '',
                  currency: 'USD',
                  date: new Date(),
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
                Enter payment details. The payment will be automatically
                allocated to pending invoices.
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
                <div className="flex flex-col md:flex-row gap-4 justify-between">
                  <div className="flex gap-4 ">
                    <div className="grid gap-2">
                      <Label htmlFor="customer">Customer *</Label>
                      <Select
                        value={formData.customerId}
                        onValueChange={(value) => {
                          setFormData({
                            ...formData,
                            customerId: value,
                            currency:
                              customers.find((c) => c.id === value)?.currency ||
                              'USD',
                          });
                          if (formData.customerId !== value) {
                            setSelectedInvoices([]);
                          }
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
                        onValueChange={(value) =>
                          setFormData({ ...formData, currency: value })
                        }
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
                <div className="grid gap-2 w-full">
                  <Label htmlFor="amount">Amount *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    min="0"
                    max={getTotalDue()}
                    onChange={(e) => {
                      const max = getTotalDue();

                      if (parseFloat(e.target.value) > max) {
                        setErrorMessage('Allocated amount exceeds total due');
                      } else {
                        setErrorMessage(null);
                      }

                      setFormData({ ...formData, amount: e.target.value });

                      if (e.target.value) {
                        allocatePaymentToInvoices(e.target.value);
                      } else {
                        allocatePaymentToInvoices('0');
                      }
                    }}
                    placeholder="0.00"
                    required
                  />
                  {errorMessage && (
                    <p className="text-red-500">{errorMessage}</p>
                  )}
                </div>
                <div className="grid md:grid-cols-2 gap-4 w-full">
                  <div className="grid gap-2 w-full">
                    <Label htmlFor="foreignBankPayment">
                      Foreign Bank Payment
                    </Label>
                    <Input
                      id="foreignBankPayment"
                      type="number"
                      step="0.01"
                      value={formData.foreignBankPayment}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          foreignBankPayment: e.target.value,
                        })
                      }
                      placeholder="0.00"
                    />
                  </div>
                  <div className="grid gap-2 w-full">
                    <Label htmlFor="localBankPayment">Local Bank Payment</Label>
                    <Input
                      id="localBankPayment"
                      type="number"
                      step="0.01"
                      value={formData.localBankPayment}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          localBankPayment: e.target.value,
                        })
                      }
                      placeholder="0.00"
                    />
                  </div>
                </div>
                {selectedInvoices.length > 0 && (
                  <div className="grid gap-2">
                    <Label>Allocate Amounts</Label>
                    {selectedInvoices.map((item, index) => {
                      const invoice = customerInvoices.find(
                        (inv) => inv.id === item.invoiceId
                      );
                      return (
                        <div key={index} className="flex items-center gap-2">
                          <span className="flex-1">
                            Invoice No:
                            <span className="font-semibold">
                              {' '}
                              {invoice?.invoiceNo}{' '}
                            </span>
                            ({invoice?.currency} {invoice?.balance})
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            readOnly
                            value={item.allocatedAmount}
                            placeholder="0.00"
                            className="w-32 bg-muted text-center  border border-muted-foreground"
                          />
                        </div>
                      );
                    })}
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
                Selected {table.getFilteredSelectedRowModel().rows.length} of{' '}
                {table.getFilteredRowModel().rows.length} payments
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
  );
}
