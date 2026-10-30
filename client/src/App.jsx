import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { Splash } from './components/ui';

import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminLogin from './pages/AdminLogin';
import AdminSetup from './pages/AdminSetup';

import CustomerLayout from './pages/customer/CustomerLayout';
import Overview from './pages/customer/Overview';
import Trade from './pages/customer/Trade';
import Transfers from './pages/customer/Transfers';
import Transactions from './pages/customer/Transactions';
import Support from './pages/customer/Support';
import Settings from './pages/customer/Settings';

import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminCustomers from './pages/admin/AdminCustomers';
import AdminCustomerDetail from './pages/admin/AdminCustomerDetail';
import AdminPayments from './pages/admin/AdminPayments';
import AdminLedger from './pages/admin/AdminLedger';
import AdminSupport from './pages/admin/AdminSupport';
import AdminAudit from './pages/admin/AdminAudit';

function NotFound() {
  return (
    <div className="auth-shell">
      <div className="auth-main">
        <div className="auth-card">
          <p className="eyebrow">404</p>
          <h1>Page not found</h1>
          <p className="muted">That address does not exist in the NovaTradeX demo.</p>
          <Link className="btn btn-primary btn-block" to="/">
            Back to homepage
          </Link>
        </div>
      </div>
    </div>
  );
}

function CustomerGuard({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== 'customer') return <Navigate to="/admin" replace />;
  if (user.status !== 'active') {
    return (
      <div className="auth-shell">
        <div className="auth-main">
          <div className="auth-card">
            <p className="eyebrow">Account {user.status}</p>
            <h1>Trading access is not active</h1>
            <p className="muted">
              Your demo account is currently <strong>{user.status}</strong>. An administrator must approve the account
              before the trading dashboard opens.
            </p>
            <Link className="btn btn-outline btn-block" to="/">
              Return to homepage
            </Link>
          </div>
        </div>
      </div>
    );
  }
  return children;
}

function AdminGuard({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user || user.role !== 'admin') return <Navigate to="/admin/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/setup" element={<AdminSetup />} />

      <Route
        path="/app"
        element={
          <CustomerGuard>
            <CustomerLayout />
          </CustomerGuard>
        }
      >
        <Route index element={<Overview />} />
        <Route path="trade" element={<Trade />} />
        <Route path="transfers" element={<Transfers />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="support" element={<Support />} />
        <Route path="support/:ticketId" element={<Support />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route
        path="/admin"
        element={
          <AdminGuard>
            <AdminLayout />
          </AdminGuard>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="customers/:customerId" element={<AdminCustomerDetail />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="ledger" element={<AdminLedger />} />
        <Route path="support" element={<AdminSupport />} />
        <Route path="support/:ticketId" element={<AdminSupport />} />
        <Route path="audit" element={<AdminAudit />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
