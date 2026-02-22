import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import {
  getInvoiceById,
  getPaymentAllocationsByInvoiceId,
} from "@/Config/firestore";
import type { Invoice, PaymentAllocation } from "@/Config/types";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function InvoiceDetails() {
  const navigate = useNavigate();
  const { id: invoiceId } = useParams();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!invoiceId) return;

    const fetchInvoice = async () => {
      try {
        const data = await getPaymentAllocationsByInvoiceId(invoiceId);
        const invoice = await getInvoiceById(invoiceId);
        setInvoice(invoice);
        setAllocations(data);
      } catch (err) {
        console.error("Error fetching invoice:", err);
        toast.error("Failed to load invoice");
      } finally {
        setLoading(false);
      }
    };

    fetchInvoice();
  }, [invoiceId]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge className="bg-zinc-600 text-zinc-100">Draft</Badge>;
      case "paid":
        return <Badge className="bg-green-800 text-green-100">Paid</Badge>;
      case "partially_paid":
        return (
          <Badge className="bg-yellow-700 text-yellow-100">
            Partially Paid
          </Badge>
        );
      case "pending":
        return <Badge className="bg-red-800 text-red-100">Pending</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading)
    return (
      <div className="p-6 md:p-8">
        <Button onClick={() => navigate(-1)} variant="ghost" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <div className="flex justify-center items-center min-h-[85vh]">
          <Spinner size="large" />
        </div>
      </div>
    );

  if (!invoice) return null;
  return (
    <div className="p-6 md:p-8">
      <Button onClick={() => navigate(-1)} variant="ghost" className="mb-6">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <Card>
        <CardContent>
          <CardTitle className="text-2xl font-bold">
            Invoice Information
          </CardTitle>
          <CardDescription className="mb-4">
            {invoice?.invoiceNo}
          </CardDescription>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-sm text-muted-foreground">Customer</p>
              <p className="font-medium">{invoice.customerName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Date</p>
              <p className="font-medium">
                {invoice.date.toLocaleDateString("ja-JP")}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <p className="font-medium capitalize">
                {getStatusBadge(invoice.status)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Cost</p>
              <p className="font-medium">
                {new Intl.NumberFormat("ja-JP", {
                  style: "currency",
                  currency: "JPY",
                }).format(invoice.totalCost ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Markup</p>
              <p className="font-medium">
                {invoice.markupMode ?? "percent"} / {invoice.markupValue ?? 0}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total (JPY)</p>
              <p className="font-medium">
                {new Intl.NumberFormat("ja-JP", {
                  style: "currency",
                  currency: "JPY",
                }).format(invoice.totalJPY ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Total Profit (JPY)
              </p>
              <p className="font-medium">
                {new Intl.NumberFormat("ja-JP", {
                  style: "currency",
                  currency: "JPY",
                }).format(invoice.totalProfitJPY ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Currency</p>
              <p className="font-medium capitalize">{invoice.currency}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Exchange Rate</p>
              <p className="font-medium">{invoice.exchangeRate ?? 1}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Amount</p>
              <p className="font-medium">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: invoice?.currency || "JPY",
                }).format(invoice.totalAmount)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Amount Paid</p>
              <p className="font-medium">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: invoice?.currency || "JPY",
                }).format(invoice.amountPaid)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Balance</p>
              <p className="font-medium">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: invoice?.currency || "JPY",
                }).format(invoice.balance)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Foreign Bank Charge
              </p>
              <p className="font-medium">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: invoice?.currency || "JPY",
                }).format(invoice.foreignBankCharge)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Local Bank Charge</p>
              <p className="font-medium">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "JPY",
                }).format(invoice.localBankCharge)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Recieved in JPY</p>
              <p className="font-medium">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "JPY",
                }).format(invoice.recievedJPY)}
              </p>
            </div>
            {invoice.remarks && (
              <div>
                <p className="text-sm text-muted-foreground">Remarks</p>
                <p className="font-medium">{invoice.remarks}</p>
              </div>
            )}
            {invoice.invoiceLink && (
              <div>
                <p className="text-sm text-muted-foreground">Invoice File</p>
                <a
                  href={invoice.invoiceLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline font-medium"
                >
                  View Invoice
                </a>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <Card className="mt-6">
        <CardContent>
          <CardTitle className="text-lg font-semibold mb-4">Items</CardTitle>
          {invoice.itemGroups && invoice.itemGroups.length > 0 ? (
            <div className="space-y-4">
              {invoice.itemGroups.map((group) => (
                <div key={group.id} className="border rounded-md p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{group.name}</p>
                    <Badge variant={group.isShow ? "default" : "secondary"}>
                      {group.isShow ? "Show in PDF" : "Hidden in PDF"}
                    </Badge>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>No</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead>Part / Code</TableHead>
                          <TableHead className="text-right">
                            Cost (JPY)
                          </TableHead>
                          <TableHead className="text-right">
                            Unit Price (JPY)
                          </TableHead>
                          <TableHead className="text-right">Markup</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">
                            Unit Price
                          </TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...group.items]
                          .sort(
                            (a, b) =>
                              (a.lineNo ?? Number.MAX_SAFE_INTEGER) -
                              (b.lineNo ?? Number.MAX_SAFE_INTEGER),
                          )
                          .map((item, index) => (
                            <TableRow
                              key={`${group.id}-${item.itemCode ?? "item"}-${index}`}
                            >
                              <TableCell>{item.lineNo ?? index + 1}</TableCell>
                              <TableCell>
                                <p>{item.itemName}</p>
                                {item.description && (
                                  <p className="text-xs text-muted-foreground">
                                    {item.description}
                                  </p>
                                )}
                              </TableCell>
                              <TableCell>
                                <p className="text-xs text-muted-foreground">
                                  Part No: {item.partNo || "-"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Item Code: {item.itemCode || "-"}
                                </p>
                              </TableCell>
                              <TableCell className="text-right">
                                {new Intl.NumberFormat("ja-JP", {
                                  style: "currency",
                                  currency: "JPY",
                                }).format(item.cost ?? item.unitPriceJPY)}
                              </TableCell>
                              <TableCell className="text-right">
                                {new Intl.NumberFormat("ja-JP", {
                                  style: "currency",
                                  currency: "JPY",
                                }).format(item.unitPriceJPY)}
                              </TableCell>
                              <TableCell className="text-right">
                                {(() => {
                                  const markupMode =
                                    item.markupMode ?? invoice.markupMode;
                                  const markupValue =
                                    item.markupValue ?? invoice.markupValue;
                                  if (
                                    !markupMode ||
                                    markupValue === undefined
                                  ) {
                                    return "-";
                                  }
                                  if (markupMode === "percent") {
                                    return `${markupValue}%`;
                                  }
                                  return new Intl.NumberFormat("ja-JP", {
                                    style: "currency",
                                    currency: "JPY",
                                  }).format(markupValue);
                                })()}
                              </TableCell>
                              <TableCell className="text-right">
                                {item.quantity}
                              </TableCell>
                              <TableCell className="text-right">
                                {new Intl.NumberFormat("en-US", {
                                  style: "currency",
                                  currency: invoice.currency || "JPY",
                                }).format(item.unitPrice)}
                              </TableCell>
                              <TableCell className="text-right">
                                {new Intl.NumberFormat("en-US", {
                                  style: "currency",
                                  currency: invoice.currency || "JPY",
                                }).format(item.totalPrice)}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">
              No line items on this invoice.
            </p>
          )}
        </CardContent>
      </Card>
      <Card className="mt-6">
        <CardContent>
          <CardTitle className="text-lg font-semibold mb-4">
            Allocations
          </CardTitle>
          <div>
            {allocations.length === 0 ? (
              <p className="text-muted-foreground">No allocations found.</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {allocations.map((allocation) => (
                  <div
                    key={allocation.id}
                    className="border p-4 rounded-md shadow-sm"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span
                        onClick={() => {
                          navigate(`/payments/${allocation.paymentId}`);
                        }}
                        className="text-xs text-muted-foreground hover:scale-105 cursor-pointer"
                      >
                        Payment ID: {allocation.paymentId}
                      </span>
                    </div>
                    <div>
                      <Label
                        htmlFor={`alloc-${allocation.id}`}
                        className="text-sm mb-1"
                      >
                        Allocated Amount
                      </Label>

                      <div className="grid gap-2 grid-cols-2">
                        <p className="bg-muted p-1 rounded-md border border-muted-foreground min-w-24 flex justify-center">
                          {new Intl.NumberFormat("ja-JP", {
                            style: "currency",
                            currency: invoice?.currency || "JPY",
                          }).format(allocation.allocatedAmount)}{" "}
                        </p>

                        <p className="bg-muted p-1 rounded-md min-w-24 flex justify-center">
                          {new Intl.NumberFormat("ja-JP", {
                            style: "currency",
                            currency: "JPY",
                          }).format(allocation.recievedJPY)}{" "}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        EX Rate: {allocation.exchangeRate || 0} | FBC:{" "}
                        {new Intl.NumberFormat("ja-JP", {
                          style: "currency",
                          currency: invoice?.currency || "JPY",
                        }).format(allocation.foreignBankCharge || 0)}{" "}
                        | LBC:{" "}
                        {new Intl.NumberFormat("ja-JP", {
                          style: "currency",
                          currency: "JPY",
                        }).format(allocation.localBankCharge || 0)}
                      </p>
                    </div>
                    <div></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
