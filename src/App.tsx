import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import LoginPage from './Pages/LoginPage';
import Dashboard from './Pages/Dashboard';
import Customers from './Pages/Customer';
import Invoices from './Pages/Invoices';
import Payments from './Pages/Payments';
import './App.css';
import { ProtectedRoute } from './Config/ProtectedRoutes';
import PaymentDetails from './Pages/PaymentDetails';
import CustomerDetail from './Pages/CustomerDetail';
import InvoiceDetails from './Pages/InvoiceDetail';
import ItemsCatalog from './Pages/ItemsCatalog';
import SettingsPage from './Pages/Settings';
import InvoiceMetadataPage from './Pages/InvoiceMetadata';

function App() {
  return (
    <Router>
      <Routes>
        {/* Public route without layout */}
        <Route path="/login" element={<LoginPage />} />

        {/* Routes that share the Layout */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/invoices/:id" element={<InvoiceDetails />} />
            <Route path="/items-catalog" element={<ItemsCatalog />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/payments/:id" element={<PaymentDetails />} />
            <Route path="/settings" element={<SettingsPage />}>
              <Route
                index
                element={<Navigate to="/settings/invoice-metadata" replace />}
              />
              <Route
                path="invoice-metadata"
                element={<InvoiceMetadataPage />}
              />
            </Route>
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
