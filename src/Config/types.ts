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
  totalCost?: number;
  totalJPY?: number;
  totalProfitJPY?: number;
  totalAmount: number;
  amountPaid: number;
  recievedJPY: number;
  currency: string;
  invoiceLink?: string;
  balance: number;
  status: 'draft' | 'pending' | 'partially_paid' | 'paid';
  date: Date;
  foreignBankCharge: number;
  localBankCharge: number;
  exchangeRate?: number;
  markupMode?: 'percent' | 'fixed';
  markupValue?: number;
  itemsPerPage?: number;
  remarks?: string;
  bankAccountId?: string;
  bankAccount?: BankAccountDetails;
  itemGroups?: InvoiceItemGroup[];
  templateVersion?: string;
  documentSource?: 'legacy' | 'system';
  createdAt: Date;
}

export interface InvoiceItem {
  lineNo?: number;
  itemsCatalogId?: string | null;
  itemName: string;
  description?: string;
  partNo?: string;
  itemCode?: string;
  cost?: number;
  unitPriceJPY: number;
  markupMode?: 'percent' | 'fixed';
  markupValue?: number;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
}

export interface InvoiceItemGroup {
  id: string;
  name: string;
  isShow: boolean;
  items: InvoiceItem[];
}

export interface InvoiceItemCatalog {
  id: string;
  itemName: string;
  description?: string;
  partNo?: string;
  itemCode?: string;
  defaultUnitPriceJPY: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface InvoiceMetadataSettings {
  id: string;
  companyName: string;
  companyAddress: string;
  phone?: string;
  fax?: string;
  logoUrl?: string;
  bankAccounts?: BankAccountDetails[];
  bankName?: string;
  branch?: string;
  swiftCode?: string;
  bankAddress?: string;
  accountName?: string;
  accountType?: string;
  accountNumber?: string;
  bankNotes?: string;
  signatoryName?: string;
  signatoryTitle?: string;
  footerNotes?: string;
  updatedAt: Date;
}

export interface BankAccountDetails {
  id: string;
  label?: string;
  bankName?: string;
  branch?: string;
  swiftCode?: string;
  bankAddress?: string;
  accountName?: string;
  accountType?: string;
  accountNumber?: string;
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
