import { useEffect, useState } from 'react';
import {
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  FilterX,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  addInvoiceCatalogItem,
  deleteInvoiceCatalogItem,
  getInvoiceItemsCatalog,
  updateInvoiceCatalogItem,
} from '@/Config/firestore';
import type { InvoiceItemCatalog } from '@/Config/types';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { getPaginationRange } from '@/lib/utils';

const normalizeCatalogField = (value?: string) => (value || '').trim().toLowerCase();

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

export default function ItemsCatalog() {
  const [items, setItems] = useState<InvoiceItemCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InvoiceItemCatalog | null>(
    null
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>(
    'all'
  );
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [columnVisibility, setColumnVisibility] = useState({
    itemName: true,
    partNo: true,
    itemCode: true,
    description: true,
    defaultUnitPriceJPY: true,
    status: true,
  });
  const [formData, setFormData] = useState({
    itemName: '',
    description: '',
    partNo: '',
    itemCode: '',
    defaultUnitPriceJPY: '',
    isActive: true,
  });

  const loadItems = async () => {
    try {
      const data = await getInvoiceItemsCatalog(true);
      const sorted = data.sort((a, b) => {
        const left = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const right = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return right - left;
      });
      setItems(sorted);
    } catch (error) {
      console.error('Error fetching item catalog:', error);
      toast.error('Error', {
        description: 'Failed to load items catalog',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, pageSize]);

  const resetForm = () => {
    setFormData({
      itemName: '',
      description: '',
      partNo: '',
      itemCode: '',
      defaultUnitPriceJPY: '',
      isActive: true,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.itemName.trim()) {
      toast.error('Error', {
        description: 'Item name is required',
      });
      return;
    }
    if (formData.defaultUnitPriceJPY.trim() === '') {
      toast.error('Error', {
        description: 'Default unit price is required',
      });
      return;
    }

    const price = Number(formData.defaultUnitPriceJPY);
    if (Number.isNaN(price) || price < 0) {
      toast.error('Error', {
        description: 'Default unit price should be zero or greater',
      });
      return;
    }

    const duplicate = items.some(
      (item) => item.id !== editingItem?.id && isDuplicateCatalogItem(item, formData)
    );
    if (duplicate) {
      toast.error('Error', {
        description: 'Duplicate item exists with same name/part/code',
      });
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        itemName: formData.itemName.trim(),
        description: formData.description.trim(),
        partNo: formData.partNo.trim(),
        itemCode: formData.itemCode.trim(),
        defaultUnitPriceJPY: price,
        isActive: formData.isActive,
        updatedAt: new Date(),
      };

      if (editingItem) {
        await updateInvoiceCatalogItem(editingItem.id, payload);
        toast.success('Success', {
          description: 'Catalog item updated successfully',
        });
      } else {
        await addInvoiceCatalogItem({
          ...payload,
          createdAt: new Date(),
        });
        toast.success('Success', {
          description: 'Catalog item created successfully',
        });
      }

      setIsDialogOpen(false);
      setEditingItem(null);
      resetForm();
      await loadItems();
    } catch (error) {
      console.error('Error saving catalog item:', error);
      toast.error('Error', {
        description: 'Failed to save catalog item',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (item: InvoiceItemCatalog) => {
    setEditingItem(item);
    setFormData({
      itemName: item.itemName,
      description: item.description ?? '',
      partNo: item.partNo ?? '',
      itemCode: item.itemCode ?? '',
      defaultUnitPriceJPY: String(item.defaultUnitPriceJPY ?? 0),
      isActive: item.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleToggleStatus = async (item: InvoiceItemCatalog) => {
    try {
      setIsSaving(true);
      await updateInvoiceCatalogItem(item.id, {
        isActive: !item.isActive,
        updatedAt: new Date(),
      });
      toast.success('Success', {
        description: `Item ${item.isActive ? 'deactivated' : 'activated'}`,
      });
      await loadItems();
    } catch (error) {
      console.error('Error updating item status:', error);
      toast.error('Error', {
        description: 'Failed to update item status',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingItem) return;
    try {
      setIsSaving(true);
      await deleteInvoiceCatalogItem(editingItem.id);
      toast.success('Success', {
        description: 'Catalog item deleted successfully',
      });
      setIsDeleteDialogOpen(false);
      setEditingItem(null);
      await loadItems();
    } catch (error) {
      console.error('Error deleting item:', error);
      toast.error('Error', {
        description: 'Failed to delete catalog item',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const filteredItems = items.filter((item) => {
    const q = searchTerm.trim().toLowerCase();
    const matchesQuery =
      q.length === 0 ||
      item.itemName.toLowerCase().includes(q) ||
      (item.itemCode || '').toLowerCase().includes(q) ||
      (item.partNo || '').toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q);

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' ? item.isActive : !item.isActive);

    return matchesQuery && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginationRange = getPaginationRange(safeCurrentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * pageSize;
  const pagedItems = filteredItems.slice(pageStart, pageStart + pageSize);
  const visibleColumnCount =
    Object.values(columnVisibility).filter(Boolean).length + 1;

  return (
    <div className="h-screen flex flex-col gap-6 py-6 md:py-8">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 px-6 md:px-8">
        <div>
          <h1 className="text-3xl font-bold">Items Catalog</h1>
          <p className="text-muted-foreground">
            Manage predefined invoice items and default JPY costs
          </p>
        </div>

        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Catalog Item</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this item? This action cannot be
                undone.
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
                onClick={handleDelete}
                isLoading={isSaving}
              >
                Delete Item
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
              className="min-w-36"
              onClick={() => {
                setEditingItem(null);
                resetForm();
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Item
            </Button>
          </DialogTrigger>
          <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>
                {editingItem ? 'Edit Catalog Item' : 'Add Catalog Item'}
              </DialogTitle>
              <DialogDescription>
                Define reusable item fields used in invoice line items.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="itemName">Item Name *</Label>
                  <Input
                    id="itemName"
                    value={formData.itemName}
                    onChange={(e) =>
                      setFormData({ ...formData, itemName: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="partNo">Part No</Label>
                    <Input
                      id="partNo"
                      value={formData.partNo}
                      onChange={(e) =>
                        setFormData({ ...formData, partNo: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="itemCode">Item Code</Label>
                    <Input
                      id="itemCode"
                      value={formData.itemCode}
                      onChange={(e) =>
                        setFormData({ ...formData, itemCode: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="defaultUnitPriceJPY">Default Unit Price (JPY)</Label>
                  <Input
                    id="defaultUnitPriceJPY"
                    type="number"
                    min={0}
                    step="0.01"
                    value={formData.defaultUnitPriceJPY}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        defaultUnitPriceJPY: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, isActive: checked === true })
                    }
                  />
                  <Label htmlFor="isActive">Active</Label>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" isLoading={isSaving}>
                  {editingItem ? 'Update Item' : 'Create Item'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Catalog Items</CardTitle>
            <CardDescription>
              These items are available in invoice line item selection.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row md:items-end gap-3 mb-4">
              <div className="grid gap-1 w-full md:max-w-sm">
                <Label htmlFor="catalog-search">Search</Label>
                <Input
                  id="catalog-search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Name, code, part no, description..."
                />
              </div>
              <div className="grid gap-1 w-full md:w-44">
                <Label>Status</Label>
                <Select
                  value={statusFilter}
                  onValueChange={(value) =>
                    setStatusFilter(value as 'all' | 'active' | 'inactive')
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                }}
              >
                <FilterX />
                Reset Filters
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="md:ml-auto">
                    Columns <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {[
                    ['itemName', 'Item Name'],
                    ['partNo', 'Part No'],
                    ['itemCode', 'Item Code'],
                    ['description', 'Description'],
                    ['defaultUnitPriceJPY', 'Default JPY'],
                    ['status', 'Status'],
                  ].map(([key, label]) => (
                    <DropdownMenuCheckboxItem
                      key={key}
                      checked={columnVisibility[key as keyof typeof columnVisibility]}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(checked) =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          [key]: checked,
                        }))
                      }
                    >
                      {label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columnVisibility.itemName && <TableHead>Item Name</TableHead>}
                    {columnVisibility.partNo && <TableHead>Part No</TableHead>}
                    {columnVisibility.itemCode && <TableHead>Item Code</TableHead>}
                    {columnVisibility.description && <TableHead>Description</TableHead>}
                    {columnVisibility.defaultUnitPriceJPY && (
                      <TableHead className="text-right">Default JPY</TableHead>
                    )}
                    {columnVisibility.status && <TableHead>Status</TableHead>}
                    <TableHead className="w-12">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={visibleColumnCount} className="h-24 text-center">
                        <Spinner />
                      </TableCell>
                    </TableRow>
                  ) : filteredItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={visibleColumnCount} className="h-24 text-center">
                        No catalog items found
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedItems.map((item) => (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer"
                        onClick={() => handleEdit(item)}
                      >
                        {columnVisibility.itemName && (
                          <TableCell className="font-medium">{item.itemName}</TableCell>
                        )}
                        {columnVisibility.partNo && <TableCell>{item.partNo || '-'}</TableCell>}
                        {columnVisibility.itemCode && (
                          <TableCell>{item.itemCode || '-'}</TableCell>
                        )}
                        {columnVisibility.description && (
                          <TableCell>{item.description || '-'}</TableCell>
                        )}
                        {columnVisibility.defaultUnitPriceJPY && (
                          <TableCell className="text-right">
                            {new Intl.NumberFormat('ja-JP', {
                              style: 'currency',
                              currency: 'JPY',
                            }).format(item.defaultUnitPriceJPY || 0)}
                          </TableCell>
                        )}
                        {columnVisibility.status && (
                          <TableCell>
                            <Badge
                              className={
                                item.isActive
                                  ? 'bg-green-700 text-green-50'
                                  : 'bg-zinc-500 text-white'
                              }
                            >
                              {item.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                        )}
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => handleEdit(item)}>
                                <Edit className="text-primary" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleToggleStatus(item)}
                              >
                                {item.isActive ? (
                                  <ToggleLeft className="text-amber-600" />
                                ) : (
                                  <ToggleRight className="text-green-600" />
                                )}
                                {item.isActive ? 'Deactivate' : 'Activate'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditingItem(item);
                                  setIsDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="text-red-700" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
          <CardFooter>
            <div className="flex flex-col justify-between gap-4 w-full md:flex-row">
              <div className="flex items-center gap-2 justify-center">
                <p className="text-sm text-muted-foreground">
                  Showing {filteredItems.length === 0 ? 0 : pageStart + 1}-
                  {Math.min(pageStart + pageSize, filteredItems.length)} of{' '}
                  {filteredItems.length} items
                </p>
              </div>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (safeCurrentPage > 1) {
                          setCurrentPage((prev) => prev - 1);
                        }
                      }}
                      className={
                        safeCurrentPage <= 1
                          ? 'pointer-events-none opacity-50'
                          : 'cursor-pointer'
                      }
                    />
                  </PaginationItem>

                  {paginationRange.map((item, idx) => (
                    <PaginationItem key={idx}>
                      {typeof item === 'string' ? (
                        <span className="px-2 text-muted-foreground">...</span>
                      ) : (
                        <PaginationLink
                          href="#"
                          isActive={item === safeCurrentPage}
                          onClick={(e) => {
                            e.preventDefault();
                            setCurrentPage(item);
                          }}
                          className="cursor-pointer"
                        >
                          {item}
                        </PaginationLink>
                      )}
                    </PaginationItem>
                  ))}

                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (safeCurrentPage < totalPages) {
                          setCurrentPage((prev) => prev + 1);
                        }
                      }}
                      className={
                        safeCurrentPage >= totalPages
                          ? 'pointer-events-none opacity-50'
                          : 'cursor-pointer'
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>

              <div className="flex justify-end">
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => setPageSize(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Rows per page" />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50].map((size) => (
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
