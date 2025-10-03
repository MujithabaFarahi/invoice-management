import { Button } from '@/components/ui/button';
import {
  fetchInvoices,
  filterCustomerInvoices,
} from '@/redux/features/invoiceSlice';
import {
  fetchCurrencies,
  fetchCustomers,
  selectCustomer,
} from '@/redux/features/paymentSlice';
import type { AppDispatch, RootState } from '@/redux/store/store';
import {
  ArrowLeft,
  ArrowUpDown,
  ChevronDown,
  Edit,
  FilterX,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { type Invoice } from '@/Config/types';
import { Checkbox } from '@radix-ui/react-checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import React from 'react';
import { Spinner } from '@/components/ui/spinner';
import { getPaginationRange, toFixed2 } from '@/lib/utils';

export default function CustomerDetail() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  const { id: customerId } = useParams();

  const { loading, customer, currencies, customers } = useSelector(
    (state: RootState) => state.payment
  );

  const {
    loading: invoiceLoading,
    customerInvoices,
    invoices,
  } = useSelector((state: RootState) => state.invoice);

  useEffect(() => {
    if (currencies.length === 0) {
      dispatch(fetchCurrencies());
    }

    if (customers.length === 0) {
      dispatch(fetchCustomers()).then(() => {
        if (customerId) {
          dispatch(selectCustomer(customerId));
        }
      });
    }

    if (invoices.length === 0) {
      dispatch(fetchInvoices()).then(() => {
        if (customerId) {
          dispatch(filterCustomerInvoices(customerId));
        }
      });
    }
  }, [
    dispatch,
    currencies.length,
    customers.length,
    customerId,
    invoices.length,
  ]);

  useEffect(() => {
    if (!customerId) return;

    const fetchData = async () => {
      dispatch(selectCustomer(customerId));
      dispatch(filterCustomerInvoices(customerId));
    };
    fetchData();
  }, [customerId, dispatch]);

  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>([]);
  const statusOptions = ['paid', 'partially_paid', 'pending'];
  const [stats, setStats] = useState({
    USDPending: 0,
    EURPending: 0,
    JPYPending: 0,
    USDFBC: 0,
    EURFBC: 0,
    JPYFBC: 0,
  });
  useEffect(() => {
    const pending = {
      USDPending: 0,
      EURPending: 0,
      JPYPending: 0,
      USDFBC: 0,
      EURFBC: 0,
      JPYFBC: 0,
    };

    customerInvoices
      .filter((invoice) => invoice.status !== 'paid')
      .forEach((invoice) => {
        if (invoice.currency === 'USD') {
          pending.USDPending += invoice.balance;
        } else if (invoice.currency === 'EUR') {
          pending.EURPending += invoice.balance;
        } else if (invoice.currency === 'JPY') {
          pending.JPYPending += invoice.balance;
        }
      });

    customerInvoices.forEach((invoice) => {
      if (invoice.currency === 'USD') {
        pending.USDFBC += invoice.foreignBankCharge;
      } else if (invoice.currency === 'EUR') {
        pending.EURFBC += invoice.foreignBankCharge;
      } else if (invoice.currency === 'JPY') {
        pending.JPYFBC += invoice.foreignBankCharge;
      }
    });

    setStats((prev) => ({
      ...prev,
      ...pending,
    }));
  }, [customerInvoices]);

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
      accessorKey: 'invoiceNo',
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
        <div className="capitalize">{row.getValue('invoiceNo')}</div>
      ),
    },
    {
      accessorKey: 'date',
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
          {new Date(row.getValue('date')).toLocaleDateString('ja-JP')}
        </div>
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
      accessorKey: 'totalAmount',
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
        const amount = toFixed2(row.getValue('totalAmount'));
        // Format the amount as a dollar amount
        const formatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: row.getValue('currency') || 'USD',
        }).format(amount);
        return <div>{formatted}</div>;
      },
    },
    {
      accessorKey: 'amountPaid',
      header: 'Paid',
      cell: ({ row }) => {
        const amount = toFixed2(row.getValue('amountPaid'));
        // Format the amount as a dollar amount
        const formatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: row.getValue('currency') || 'USD',
        }).format(amount);
        return <div>{formatted}</div>;
      },
    },
    {
      accessorKey: 'balance',
      header: () => <div>Balance</div>,
      cell: ({ row }) => {
        const amount = toFixed2(row.getValue('balance'));
        // Format the amount as a dollar amount
        const formatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: row.getValue('currency') || 'USD',
        }).format(amount);
        return (
          <div
            className={
              amount > 0 ? 'text-orange-600 font-medium' : 'text-green-600'
            }
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
                onClick={() => navigator.clipboard.writeText(invoice.invoiceNo)}
              >
                Copy Invoice No
              </DropdownMenuItem>
              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={() => {
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
                  //   handleEdit(invoice);
                }}
              >
                <Edit className="text-primary" />
                Edit Invoice
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
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
                  //   handleDelete(invoice.id);
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
    data: customerInvoices,
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
    table.getColumn('status')?.setFilterValue(selectedStatuses);
  }, [selectedStatuses, table]);

  useEffect(() => {
    table.getColumn('currency')?.setFilterValue(selectedCurrencies);
  }, [selectedCurrencies, table]);

  return (
    <div className="p-6 md:p-8">
      <Button onClick={() => navigate(-1)} variant="ghost" className="mb-4">
        <ArrowLeft /> Back
      </Button>

      {customer &&
        (loading ? (
          <Card className="mb-6">
            <CardContent>
              <Spinner />
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-2xl font-bold">
                {customer.name}
              </CardTitle>
              <CardDescription>{customer.email}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{customer.phone || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Address</p>
                  <p className="font-medium">{customer.address || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Preferred Currency
                  </p>
                  <p className="font-medium">{customer.currency}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created At</p>
                  <p className="font-medium">
                    {new Date(customer.createdAt).toLocaleDateString('ja-JP')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total LBC</p>
                  <p className="font-medium">
                    {new Intl.NumberFormat('ja-JP', {
                      style: 'currency',
                      currency: 'JPY',
                    }).format(
                      customerInvoices
                        .map((inv) => inv.localBankCharge)
                        .reduce((a, b) => a + b, 0)
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total FBC</p>
                  <div className="font-medium">
                    {new Intl.NumberFormat('ja-JP', {
                      style: 'currency',
                      currency: 'JPY',
                    }).format(stats.JPYFBC)}{' '}
                    +{' '}
                    {new Intl.NumberFormat('ja-JP', {
                      style: 'currency',
                      currency: 'USD',
                    }).format(stats.USDFBC)}
                    +{' '}
                    {new Intl.NumberFormat('ja-JP', {
                      style: 'currency',
                      currency: 'EUR',
                    }).format(stats.EURFBC)}
                  </div>
                </div>
              </div>
            </CardContent>

            <CardFooter>
              <div className="">
                <p className="text-sm text-muted-foreground">Pending Amounts</p>
                <div className=" font-bold">
                  {new Intl.NumberFormat('ja-JP', {
                    style: 'currency',
                    currency: 'JPY',
                  }).format(stats.JPYPending)}{' '}
                  +{' '}
                  {new Intl.NumberFormat('ja-JP', {
                    style: 'currency',
                    currency: 'USD',
                  }).format(stats.USDPending)}
                  +{' '}
                  {new Intl.NumberFormat('ja-JP', {
                    style: 'currency',
                    currency: 'EUR',
                  }).format(stats.EURPending)}
                </div>
              </div>
            </CardFooter>
          </Card>
        ))}

      <h2 className="text-xl font-semibold mb-2">Invoices</h2>

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
                ) : invoiceLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      <Spinner />
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
  );
}
