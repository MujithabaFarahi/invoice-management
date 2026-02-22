import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getAllPaymentAllocations,
  getInvoices,
  getPayments,
} from '@/Config/firestore';
import type { Invoice, Payment, PaymentAllocation } from '@/Config/types';
import { toFixed2 } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';

type ChargePair = {
  foreignBankCharge: number;
  localBankCharge: number;
};

type ReconciliationIssue = {
  id: string;
  label: string;
  expectedForeign: number;
  actualForeign: number;
  expectedLocal: number;
  actualLocal: number;
};

const isClose = (a: number, b: number) => Math.abs(a - b) <= 0.01;

const sumCharges = (rows: ChargePair[]): ChargePair =>
  rows.reduce(
    (acc, row) => ({
      foreignBankCharge: toFixed2(acc.foreignBankCharge + (row.foreignBankCharge || 0)),
      localBankCharge: toFixed2(acc.localBankCharge + (row.localBankCharge || 0)),
    }),
    { foreignBankCharge: 0, localBankCharge: 0 }
  );

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export default function SettingsReconciliationPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (showSpinner = true) => {
    try {
      if (showSpinner) setLoading(true);
      setRefreshing(true);

      const [invoiceRows, paymentRows, allocationRows] = await Promise.all([
        getInvoices(),
        getPayments(),
        getAllPaymentAllocations(),
      ]);

      setInvoices(invoiceRows);
      setPayments(paymentRows);
      setAllocations(allocationRows);
    } catch (error) {
      console.error('Failed to load reconciliation data:', error);
      toast.error('Failed to load reconciliation data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const paymentIssues = useMemo(() => {
    const byPayment = new Map<string, ChargePair>();

    allocations.forEach((alloc) => {
      const current = byPayment.get(alloc.paymentId) || {
        foreignBankCharge: 0,
        localBankCharge: 0,
      };
      byPayment.set(alloc.paymentId, {
        foreignBankCharge: toFixed2(
          current.foreignBankCharge + (alloc.foreignBankCharge || 0)
        ),
        localBankCharge: toFixed2(current.localBankCharge + (alloc.localBankCharge || 0)),
      });
    });

    const issues: ReconciliationIssue[] = [];
    payments.forEach((payment) => {
      const allocTotals = byPayment.get(payment.id) || {
        foreignBankCharge: 0,
        localBankCharge: 0,
      };
      if (
        !isClose(payment.foreignBankCharge || 0, allocTotals.foreignBankCharge) ||
        !isClose(payment.localBankCharge || 0, allocTotals.localBankCharge)
      ) {
        issues.push({
          id: payment.id,
          label: payment.paymentNo || payment.id,
          expectedForeign: payment.foreignBankCharge || 0,
          actualForeign: allocTotals.foreignBankCharge,
          expectedLocal: payment.localBankCharge || 0,
          actualLocal: allocTotals.localBankCharge,
        });
      }
    });

    return issues;
  }, [allocations, payments]);

  const invoiceIssues = useMemo(() => {
    const byInvoice = new Map<string, ChargePair>();

    allocations.forEach((alloc) => {
      const current = byInvoice.get(alloc.invoiceId) || {
        foreignBankCharge: 0,
        localBankCharge: 0,
      };
      byInvoice.set(alloc.invoiceId, {
        foreignBankCharge: toFixed2(
          current.foreignBankCharge + (alloc.foreignBankCharge || 0)
        ),
        localBankCharge: toFixed2(current.localBankCharge + (alloc.localBankCharge || 0)),
      });
    });

    const issues: ReconciliationIssue[] = [];
    invoices.forEach((invoice) => {
      const allocTotals = byInvoice.get(invoice.id) || {
        foreignBankCharge: 0,
        localBankCharge: 0,
      };
      if (
        !isClose(invoice.foreignBankCharge || 0, allocTotals.foreignBankCharge) ||
        !isClose(invoice.localBankCharge || 0, allocTotals.localBankCharge)
      ) {
        issues.push({
          id: invoice.id,
          label: invoice.invoiceNo || invoice.id,
          expectedForeign: invoice.foreignBankCharge || 0,
          actualForeign: allocTotals.foreignBankCharge,
          expectedLocal: invoice.localBankCharge || 0,
          actualLocal: allocTotals.localBankCharge,
        });
      }
    });

    return issues;
  }, [allocations, invoices]);

  const orphanAllocations = useMemo(() => {
    const paymentIds = new Set(payments.map((payment) => payment.id));
    const invoiceIds = new Set(invoices.map((invoice) => invoice.id));

    return allocations.filter(
      (alloc) => !paymentIds.has(alloc.paymentId) || !invoiceIds.has(alloc.invoiceId)
    );
  }, [allocations, invoices, payments]);

  const totals = useMemo(() => {
    const invoiceTotals = sumCharges(invoices);
    const paymentTotals = sumCharges(payments);
    const allocationTotals = sumCharges(allocations);

    return {
      invoiceTotals,
      paymentTotals,
      allocationTotals,
      isForeignMatched:
        isClose(invoiceTotals.foreignBankCharge, paymentTotals.foreignBankCharge) &&
        isClose(invoiceTotals.foreignBankCharge, allocationTotals.foreignBankCharge),
      isLocalMatched:
        isClose(invoiceTotals.localBankCharge, paymentTotals.localBankCharge) &&
        isClose(invoiceTotals.localBankCharge, allocationTotals.localBankCharge),
    };
  }, [allocations, invoices, payments]);

  const hasIssues =
    !totals.isForeignMatched ||
    !totals.isLocalMatched ||
    paymentIssues.length > 0 ||
    invoiceIssues.length > 0 ||
    orphanAllocations.length > 0;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>FBC / LBC Reconciliation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading reconciliation data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>FBC / LBC Reconciliation</CardTitle>
            <p className="text-sm text-muted-foreground">
              Checks whether charges are aligned across invoices, payments, and
              payment allocations.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={hasIssues ? 'destructive' : 'default'}>
              {hasIssues ? 'Mismatch Found' : 'All Matched'}
            </Badge>
            <Button
              type="button"
              variant="outline"
              onClick={() => loadData(false)}
              isLoading={refreshing}
            >
              Refresh Check
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          <div className="rounded-md border p-3">
            <p className="text-muted-foreground">Total FBC (Invoices)</p>
            <p className="font-semibold">
              {formatCurrency(totals.invoiceTotals.foreignBankCharge)}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-muted-foreground">Total FBC (Payments)</p>
            <p className="font-semibold">
              {formatCurrency(totals.paymentTotals.foreignBankCharge)}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-muted-foreground">Total FBC (Allocations)</p>
            <p className="font-semibold">
              {formatCurrency(totals.allocationTotals.foreignBankCharge)}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-muted-foreground">Total LBC (Invoices)</p>
            <p className="font-semibold">
              {formatCurrency(totals.invoiceTotals.localBankCharge)}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-muted-foreground">Total LBC (Payments)</p>
            <p className="font-semibold">
              {formatCurrency(totals.paymentTotals.localBankCharge)}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-muted-foreground">Total LBC (Allocations)</p>
            <p className="font-semibold">
              {formatCurrency(totals.allocationTotals.localBankCharge)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment vs Allocation (by Payment)</CardTitle>
        </CardHeader>
        <CardContent>
          {paymentIssues.length === 0 ? (
            <p className="text-sm text-muted-foreground">No mismatches found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">FBC Payment</TableHead>
                  <TableHead className="text-right">FBC Alloc</TableHead>
                  <TableHead className="text-right">LBC Payment</TableHead>
                  <TableHead className="text-right">LBC Alloc</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentIssues.map((issue) => (
                  <TableRow key={issue.id}>
                    <TableCell className="font-medium">{issue.label}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(issue.expectedForeign)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(issue.actualForeign)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(issue.expectedLocal)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(issue.actualLocal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoice vs Allocation (by Invoice)</CardTitle>
        </CardHeader>
        <CardContent>
          {invoiceIssues.length === 0 ? (
            <p className="text-sm text-muted-foreground">No mismatches found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="text-right">FBC Invoice</TableHead>
                  <TableHead className="text-right">FBC Alloc</TableHead>
                  <TableHead className="text-right">LBC Invoice</TableHead>
                  <TableHead className="text-right">LBC Alloc</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoiceIssues.map((issue) => (
                  <TableRow key={issue.id}>
                    <TableCell className="font-medium">{issue.label}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(issue.expectedForeign)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(issue.actualForeign)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(issue.expectedLocal)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(issue.actualLocal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Orphan Allocations</CardTitle>
        </CardHeader>
        <CardContent>
          {orphanAllocations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orphan allocations.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Allocation ID</TableHead>
                  <TableHead>Payment ID</TableHead>
                  <TableHead>Invoice ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orphanAllocations.map((alloc) => (
                  <TableRow key={alloc.id}>
                    <TableCell>{alloc.id}</TableCell>
                    <TableCell>{alloc.paymentId}</TableCell>
                    <TableCell>{alloc.invoiceId}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
