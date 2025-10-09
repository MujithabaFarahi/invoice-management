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
  CalendarIcon,
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
  updateInvoice,
  deleteInvoice,
  toJapanMidnight,
  toJapanDate,
} from '@/Config/firestore';
import { type Invoice } from '@/Config/types';
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
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/Config/firebase';
import { useNavigate } from 'react-router-dom';
import { cn, getPaginationRange, toFixed2 } from '@/lib/utils';

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
  const statusOptions = ['paid', 'partially_paid', 'pending'];

  const [formData, setFormData] = useState({
    invoiceNo: '',
    customerId: '',
    totalAmount: '',
    currency: 'USD',
    invoiceLink: '',
    date: new Date(),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (errorMessage) {
      toast.error('Error', {
        description: 'Please provide a unique invoice number',
      });
      return;
    }

    if (!formData.invoiceNo || !formData.customerId || !formData.totalAmount) {
      toast.error('Error', {
        description: 'Please fill in all required fields',
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

    const totalAmount = toFixed2(formData.totalAmount);

    try {
      setIsLoading(true);
      const invoiceData = {
        invoiceNo: formData.invoiceNo,
        customerId: formData.customerId,
        customerName: customer.name,
        invoiceLink: formData.invoiceLink,
        totalAmount,
        amountPaid: 0,
        currency: formData.currency,
        balance: totalAmount,
        recievedJPY: 0,
        status: 'pending' as const,
        date: toJapanMidnight(formData.date),
        foreignBankCharge: 0,
        localBankCharge: 0,
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
        totalAmount: '',
        currency: 'USD',
        date: new Date(),
        invoiceLink: '',
      });
    } catch (error) {
      console.error('Error saving invoice:', error);
      toast.error('Error', {
        description: 'Failed to save invoice',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setFormData({
      invoiceNo: invoice.invoiceNo,
      customerId: invoice.customerId,
      totalAmount: invoice.totalAmount.toString(),
      currency: invoice.currency,
      date: new Date(invoice.date),
      invoiceLink: invoice.invoiceLink ?? '',
    });
    setIsDialogOpen(true);
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

  const getStatusBadge = (status: string) => {
    switch (status) {
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
                onClick={(e) => {
                  e.stopPropagation();
                  if (invoice.status === 'paid') {
                    toast.error('Error', {
                      description: 'Cannot edit a paid invoice',
                    });
                    return;
                  } else if (invoice.status === 'partially_paid') {
                    toast.error('Error', {
                      description: 'Cannot edit a partially paid invoice',
                    });
                    return;
                  }
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
                  totalAmount: '',
                  invoiceLink: '',
                  currency: 'USD',
                  date: new Date(),
                });
                setErrorMessage(null);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Invoice
            </Button>
          </DialogTrigger>

          <DialogContent
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
                <div className="grid gap-2">
                  <Label htmlFor="invoiceNo">Invoice Number *</Label>
                  <Input
                    id="invoiceNo"
                    value={formData.invoiceNo}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFormData({ ...formData, invoiceNo: value });

                      const exists = invoices.some(
                        (inv) => inv.invoiceNo === value.trim()
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
                <div className="flex gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="customer">Customer *</Label>
                    <Select
                      value={formData.customerId}
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          customerId: value,
                          currency:
                            customers.find((c) => c.id === value)?.currency ||
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
                          <SelectItem key={currency.code} value={currency.code}>
                            {currency.code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="totalAmount">Total Amount *</Label>
                  <Input
                    id="totalAmount"
                    type="number"
                    step="0.01"
                    value={formData.totalAmount}
                    onChange={(e) =>
                      setFormData({ ...formData, totalAmount: e.target.value })
                    }
                    placeholder="0.00"
                    required
                  />
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
              <DialogFooter className="mt-4">
                <Button
                  className="min-w-36"
                  variant={'outline'}
                  type="button"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="min-w-36"
                  type="submit"
                  isLoading={isLoading}
                >
                  {editingInvoice ? 'Update Invoice' : 'Create Invoice'}
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
