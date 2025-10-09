import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  getDoc,
  type DocumentData,
  limit,
  Timestamp,
} from 'firebase/firestore';
import type {
  Currency,
  Customer,
  Invoice,
  Payment,
  PaymentAllocation,
} from './types';
import { db } from './firebase';
import { getCountFromServer } from 'firebase/firestore';
import { toFixed2 } from '@/lib/utils';

// Customer operations
export const addCustomer = async (customer: Omit<Customer, 'id'>) => {
  const docRef = await addDoc(collection(db, 'customers'), customer);
  return docRef.id;
};

export const getCustomerCount = async (): Promise<number> => {
  const coll = collection(db, 'customers');
  const snapshot = await getCountFromServer(coll);
  return snapshot.data().count;
};

export const getCustomers = async (): Promise<Customer[]> => {
  const querySnapshot = await getDocs(
    query(collection(db, 'customers'), orderBy('createdAt', 'desc'))
  );
  return querySnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt.toDate(),
    } as Customer;
  });
};

export const updateCustomer = async (id: string, data: Partial<Customer>) => {
  await updateDoc(doc(db, 'customers', id), data);
};

export const deleteCustomer = async (id: string) => {
  await deleteDoc(doc(db, 'customers', id));
};

// Invoice operations
export const addInvoice = async (invoice: Omit<Invoice, 'id'>) => {
  const invoiceAmount = invoice.totalAmount;

  const currencyQuery = query(
    collection(db, 'currencies'),
    where('code', '==', invoice.currency)
  );
  const currencySnap = await getDocs(currencyQuery);
  if (!currencySnap.empty) {
    const currencyDoc = currencySnap.docs[0];
    const currentAmountDue = currencyDoc.data().amountDue || 0;
    const currentTotalAmount = currencyDoc.data().totalAmount || 0;
    await updateDoc(currencyDoc.ref, {
      amountDue: toFixed2(currentAmountDue + invoiceAmount),
      totalAmount: toFixed2(currentTotalAmount + invoiceAmount),
    });
  }

  const docRef = await addDoc(collection(db, 'invoices'), invoice);

  return docRef.id;
};

export const getInvoiceCount = async (): Promise<number> => {
  const coll = collection(db, 'invoices');
  const snapshot = await getCountFromServer(coll);
  return snapshot.data().count;
};

export const getInvoices = async (): Promise<Invoice[]> => {
  const querySnapshot = await getDocs(
    query(
      collection(db, 'invoices'),
      orderBy('date', 'desc'),
      orderBy('createdAt', 'desc')
    )
  );
  return querySnapshot.docs.map((doc) => {
    const data = doc.data();

    return {
      id: doc.id,
      ...data,
      date: toJapanDate(data.date.toDate()),
      createdAt: data.createdAt.toDate(),
    } as Invoice;
  });
};

export const getInvoiceById = async (invoiceId: string): Promise<Invoice> => {
  const invoiceRef = doc(db, 'invoices', invoiceId);
  const invoiceSnap = await getDoc(invoiceRef);

  if (!invoiceSnap.exists()) {
    throw new Error('Invoice not found');
  }

  const data = invoiceSnap.data();

  return {
    id: invoiceSnap.id,
    ...data,
    date: toJapanDate(data.date.toDate()),
    createdAt: data.createdAt.toDate(),
  } as Invoice;
};

export const getCustomerInvoices = async (
  customerId: string,
  currency: string
): Promise<Invoice[]> => {
  const invoicesRef = collection(db, 'invoices');

  const q = query(
    invoicesRef,
    where('customerId', '==', customerId),
    where('currency', '==', currency),
    where('balance', '>', 0),
    orderBy('date', 'asc'),
    orderBy('createdAt', 'asc')
  );

  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      date: toJapanDate(data.date.toDate()),
      createdAt: data.createdAt.toDate(),
    } as Invoice;
  });
};

export const updateInvoice = async (id: string, data: Partial<Invoice>) => {
  const invoiceRef = doc(db, 'invoices', id);
  const invoiceSnap = await getDoc(invoiceRef);

  if (!invoiceSnap.exists()) {
    throw new Error('Invoice not found');
  }

  const oldInvoice = invoiceSnap.data() as Invoice;
  const oldAmount = toFixed2(oldInvoice.totalAmount);
  const newAmount = data.totalAmount;
  const oldCurrency = oldInvoice.currency;
  const newCurrency = data.currency;

  // 1. Subtract oldAmount from old currency
  const oldCurrencyQuery = query(
    collection(db, 'currencies'),
    where('code', '==', oldCurrency)
  );
  const oldCurrencySnap = await getDocs(oldCurrencyQuery);
  if (!oldCurrencySnap.empty) {
    const oldCurrencyDoc = oldCurrencySnap.docs[0];
    const currentDue = oldCurrencyDoc.data().amountDue || 0;
    await updateDoc(oldCurrencyDoc.ref, {
      amountDue: toFixed2(currentDue - oldAmount),
    });
  }

  // 2. Add newAmount to new currency
  const newCurrencyQuery = query(
    collection(db, 'currencies'),
    where('code', '==', newCurrency)
  );
  const newCurrencySnap = await getDocs(newCurrencyQuery);
  if (!newCurrencySnap.empty) {
    const newCurrencyDoc = newCurrencySnap.docs[0];
    const currentDue = newCurrencyDoc.data().amountDue || 0;
    await updateDoc(newCurrencyDoc.ref, {
      amountDue: toFixed2(currentDue + newAmount),
    });
  }

  // 3. Update the invoice
  await updateDoc(invoiceRef, data);
};

export const deleteInvoice = async (id: string) => {
  const invoiceRef = doc(db, 'invoices', id);
  const invoiceSnap = await getDoc(invoiceRef);

  if (!invoiceSnap.exists()) {
    throw new Error('Invoice not found');
  }

  const invoice = invoiceSnap.data() as Invoice;
  const { currency, totalAmount } = invoice;

  // 1. Update currency's amountDue
  const currencyQuery = query(
    collection(db, 'currencies'),
    where('code', '==', currency)
  );
  const currencySnap = await getDocs(currencyQuery);

  if (!currencySnap.empty) {
    const currencyDoc = currencySnap.docs[0];
    const currentDue = currencyDoc.data().amountDue || 0;
    await updateDoc(currencyDoc.ref, {
      amountDue: Math.max(0, toFixed2(currentDue - totalAmount)),
    });
  }

  // 2. Delete invoice
  await deleteDoc(invoiceRef);
};

// Payment operations
export const addPayment = async (payment: Omit<Payment, 'id'>) => {
  const docRef = await addDoc(collection(db, 'payments'), payment);
  return docRef.id;
};

export const getPaymentCount = async (): Promise<number> => {
  const coll = collection(db, 'payments');
  const snapshot = await getCountFromServer(coll);
  return snapshot.data().count;
};

export const toJapanDate = (date: Date) => {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000);
};

export const getPayments = async (): Promise<Payment[]> => {
  const querySnapshot = await getDocs(
    query(
      collection(db, 'payments'),
      orderBy('date', 'desc'),
      orderBy('createdAt', 'desc')
    )
  );
  return querySnapshot.docs.map((doc) => {
    const data = doc.data();
    const storedDate = data.date.toDate();

    return {
      id: doc.id,
      ...data,
      date: toJapanDate(storedDate),
      createdAt: data.createdAt.toDate(),
    } as Payment;
  });
};

export const getPaymentById = async (paymentId: string): Promise<Payment> => {
  const paymentRef = doc(db, 'payments', paymentId);
  const paymentSnap = await getDoc(paymentRef);

  if (!paymentSnap.exists()) {
    throw new Error('Payment not found');
  }

  const data = paymentSnap.data();
  const storedDate = data.date.toDate();

  return {
    id: paymentSnap.id,
    ...data,
    date: toJapanDate(storedDate),
    createdAt: data.createdAt.toDate(),
  } as Payment;
};

export const getPaymentAllocations = async (
  paymentId: string
): Promise<PaymentAllocation[]> => {
  const allocationsRef = collection(db, 'paymentAllocations');

  const q = query(allocationsRef, where('paymentId', '==', paymentId));

  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt.toDate(),
    } as PaymentAllocation;
  });
};

export const getPaymentAllocationsByInvoiceId = async (
  invoiceId: string
): Promise<PaymentAllocation[]> => {
  const allocationsRef = collection(db, 'paymentAllocations');

  const q = query(allocationsRef, where('invoiceId', '==', invoiceId));

  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt.toDate(),
    } as PaymentAllocation;
  });
};

export const getCurrencies = async (): Promise<Currency[]> => {
  const querySnapshot = await getDocs(query(collection(db, 'currencies')));
  return querySnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
    } as Currency;
  });
};

export const getLastPaymentByCustomerId = async (
  customerId: string
): Promise<Payment | null> => {
  const paymentsQuery = query(
    collection(db, 'payments'),
    where('customerId', '==', customerId),
    orderBy('createdAt', 'desc'),
    limit(1)
  );

  const paymentsSnap = await getDocs(paymentsQuery);
  if (paymentsSnap.empty) return null;

  const docSnap = paymentsSnap.docs[0];
  const data = docSnap.data();

  return {
    id: docSnap.id,
    ...data,
    date: toJapanDate(data.date.toDate()),
    createdAt: data.createdAt.toDate(),
  } as Payment;
};

// export const migratePaymentDates = async () => {
//   const snapshot = await getDocs(collection(db, 'payments'));

//   const updates = snapshot.docs.map(async (d) => {
//     const data = d.data() as DocumentData;

//     // ✅ Skip if already a Timestamp
//     if (data.date instanceof Timestamp) {
//       return;
//     }

//     // Only process if it's a string
//     if (typeof data.date === 'string') {
//       try {
//         // Parse string into JS Date (works for "YYYY/MM/DD")
//         const parsedDate = new Date(data.date);

//         if (isNaN(parsedDate.getTime())) {
//           console.warn(`Skipping invalid date for doc ${d.id}:`, data.date);
//           return;
//         }

//         // Convert to Firestore Timestamp
//         const ts = Timestamp.fromDate(parsedDate);

//         await updateDoc(doc(db, 'payments', d.id), { date: ts });
//         console.log(`✅ Updated ${d.id}: ${data.date} → ${ts.toDate()}`);
//       } catch (err) {
//         console.error(`❌ Failed to update ${d.id}:`, err);
//       }
//     }
//   });

//   await Promise.all(updates);
//   console.log('🎉 Migration complete (idempotent)');
// };

export const migratePaymentDates = async () => {
  const snapshot = await getDocs(collection(db, 'invoices'));

  const updates = snapshot.docs.map(async (d) => {
    const data = d.data() as DocumentData;

    let date: Date | null = null;

    if (data.date instanceof Timestamp) {
      // Already a Timestamp → normalize it
      date = data.date.toDate();
    } else if (typeof data.date === 'string') {
      // Parse string date
      const parsed = new Date(data.date);
      if (isNaN(parsed.getTime())) {
        console.warn(`Skipping invalid date for doc ${d.id}:`, data.date);
        return;
      }
      date = parsed;
    } else {
      console.warn(`Skipping unknown date format for doc ${d.id}:`, data.date);
      return;
    }

    // Normalize to UTC midnight
    const utcMidnight = toJapanMidnight(date);

    // Only update if different
    const newTs = Timestamp.fromDate(utcMidnight);
    if (!(data.date instanceof Timestamp && data.date.isEqual(newTs))) {
      await updateDoc(doc(db, 'invoices', d.id), { date: newTs });
      console.log(
        `✅ Updated ${
          d.id
        }: ${date.toISOString()} → ${utcMidnight.toISOString()}`
      );
    }
  });

  await Promise.all(updates);
  console.log('🎉 Migration complete (idempotent, UTC midnight enforced)');
};

export const toJapanMidnight = (date: Date) => {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0) -
      9 * 60 * 60 * 1000
  );
};
