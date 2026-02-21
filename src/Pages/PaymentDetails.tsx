import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  getPaymentAllocations,
  getPaymentById,
  toJapanMidnight,
} from '@/Config/firestore';
import type { Payment, PaymentAllocation } from '@/Config/types';
import { ArrowLeft, CalendarIcon } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { db } from '@/Config/firebase';
import { doc, updateDoc } from 'firebase/firestore';

export default function PaymentDetails() {
  const navigate = useNavigate();
  const { id: paymentId } = useParams();
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([]);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingDates, setSavingDates] = useState(false);
  const [editablePaymentDate, setEditablePaymentDate] = useState<Date>(new Date());
  const [editableCreditDate, setEditableCreditDate] = useState<Date>(new Date());

  useEffect(() => {
    if (!paymentId) return;

    const fetchData = async () => {
      try {
        const data = await getPaymentAllocations(paymentId);
        const payment = await getPaymentById(paymentId);
        setPayment(payment);
        setEditablePaymentDate(payment.paymentDate || payment.date);
        setEditableCreditDate(payment.date);
        setAllocations(data);
      } catch (error) {
        console.error('Error fetching allocations:', error);
        toast.error('Failed to load payment allocations');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [paymentId]);

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

  const handleSaveDates = async () => {
    if (!paymentId || !payment) return;

    try {
      setSavingDates(true);
      await updateDoc(doc(db, 'payments', paymentId), {
        paymentDate: toJapanMidnight(editablePaymentDate),
        date: toJapanMidnight(editableCreditDate),
      });

      setPayment({
        ...payment,
        paymentDate: editablePaymentDate,
        date: editableCreditDate,
      });

      toast.success('Dates updated successfully');
    } catch (error) {
      console.error('Error updating payment dates:', error);
      toast.error('Failed to update dates');
    } finally {
      setSavingDates(false);
    }
  };

  const isDateChanged =
    !payment ||
    (payment.paymentDate || payment.date).getTime() !==
      editablePaymentDate.getTime() ||
    payment.date.getTime() !== editableCreditDate.getTime();

  return (
    <div className="p-6 md:p-8">
      <Button onClick={() => navigate(-1)} variant="ghost" className="mb-6">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <Card>
        <CardContent>
          <div className="flex items-center justify-between gap-4 mb-2">
            <CardTitle className="text-lg font-semibold">
              Payment Information
            </CardTitle>
            <Button
              type="button"
              onClick={handleSaveDates}
              isLoading={savingDates}
              disabled={!isDateChanged}
            >
              Save Dates
            </Button>
          </div>
          <CardDescription className="mb-4">
            {payment?.paymentNo}
          </CardDescription>
          {payment && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Payment Date</p>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editablePaymentDate ? (
                        format(editablePaymentDate, 'PPP')
                      ) : (
                        <span>Pick a date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={editablePaymentDate}
                      captionLayout="dropdown"
                      onSelect={(date) => {
                        if (date) setEditablePaymentDate(date);
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Credit Date</p>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editableCreditDate ? (
                        format(editableCreditDate, 'PPP')
                      ) : (
                        <span>Pick a date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={editableCreditDate}
                      captionLayout="dropdown"
                      onSelect={(date) => {
                        if (date) setEditableCreditDate(date);
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Customer</p>
                <p className="font-medium">{payment.customerName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Currency</p>
                <p className="font-medium">{payment.currency}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Amount</p>
                <p className="font-medium">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: payment.currency,
                  }).format(payment.amount)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Foreign Bank Charge
                </p>
                <p className="font-medium ">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: payment.currency,
                  }).format(payment.foreignBankCharge)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Amount In JPY</p>
                <p className="font-medium">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'JPY',
                  }).format(payment.amountInJPY + (payment.localBankCharge || 0))}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Exchange Rate</p>
                <p className="font-medium">{payment.exchangeRate}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Local Bank Charge
                </p>
                <p className="font-medium">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'JPY',
                  }).format(payment.localBankCharge)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Received JPY</p>
                <p className="font-medium">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'JPY',
                  }).format(payment.amountInJPY)}
                </p>
              </div>
            </div>
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
              <div className="grid md:grid-cols-2 gap-4">
                {allocations.map((allocation) => (
                  <div
                    key={allocation.id}
                    className="border p-4 rounded-md shadow-sm"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">
                        Invoice No: {allocation.invoiceNo ?? 'N/A'}
                      </span>
                      <span
                        onClick={() => {
                          navigate(`/invoices/${allocation.invoiceId}`);
                        }}
                        className="text-xs text-muted-foreground hover:scale-105 cursor-pointer"
                      >
                        Invoice ID: {allocation.invoiceId}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <Label className="text-sm mb-1">Allocated Amount</Label>

                        <div className="grid gap-2 grid-cols-2">
                          <p className="bg-muted p-1 rounded-md border border-muted-foreground min-w-24 flex justify-center">
                            {new Intl.NumberFormat('ja-JP', {
                              style: 'currency',
                              currency: payment?.currency || 'JPY',
                            }).format(allocation.allocatedAmount)}{' '}
                          </p>

                          <p className="bg-muted p-1 rounded-md min-w-24 flex justify-center">
                            {new Intl.NumberFormat('ja-JP', {
                              style: 'currency',
                              currency: 'JPY',
                            }).format(allocation.recievedJPY)}{' '}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          EX Rate: {allocation.exchangeRate || 0} | FBC:{' '}
                          {new Intl.NumberFormat('ja-JP', {
                            style: 'currency',
                            currency: payment?.currency || 'JPY',
                          }).format(allocation.foreignBankCharge || 0)}{' '}
                          | LBC:{' '}
                          {new Intl.NumberFormat('ja-JP', {
                            style: 'currency',
                            currency: 'JPY',
                          }).format(allocation.localBankCharge || 0)}
                        </p>
                      </div>
                    </div>
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
