export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  amountInJPY?: number;
  currency: string;
  createdAt: Date;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  customerId: string;
  customerName: string;
  totalAmount: number;
  amountPaid: number;
  recievedJPY: number;
  currency: string;
  invoiceLink?: string;
  balance: number;
  status: 'pending' | 'partially_paid' | 'paid';
  date: Date;
  foreignBankCharge: number;
  localBankCharge: number;
  createdAt: Date;
}

export interface Currency {
  id: string;
  code: string;
  name: string;
  totalAmount: number;
  amountDue: number;
  amountPaid: number;
  amountInJPY: number;
  foreignBankCharge: number;
  localBankCharge: number;
}

export interface Payment {
  id: string;
  paymentNo: string;
  date: Date;
  paymentDate?: Date;
  customerId: string;
  customerName: string;
  currency: string;
  amount: number;
  exchangeRate: number;
  allocatedAmount: number;
  amountInJPY: number;
  foreignBankCharge: number;
  localBankCharge: number;
  createdAt: Date;
}

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  invoiceId: string;
  invoiceNo: string;
  allocatedAmount: number;
  foreignBankCharge: number;
  localBankCharge: number;
  exchangeRate: number;
  recievedJPY: number;
  createdAt: Date;
}

export interface SelectedInvoice {
  invoiceId: string;
  allocatedAmount: number;
  balance: number;
  foreignBankCharge: number;
  localBankCharge: number;
  recievedJPY: number;
}
