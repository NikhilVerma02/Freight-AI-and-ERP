import React from "react";
import {
  Navigate,
  Route,
  BrowserRouter,
  Routes,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth, type Role } from "./lib/auth";
import { ToastProvider } from "./lib/toast";
import { ThemeProvider } from "./lib/theme";
import { AlertsProvider } from "./lib/alerts";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import Claims from "./pages/Claims";
import Alerts from "./pages/Alerts";
import Users from "./pages/Users";
import AuditLogs from "./pages/AuditLogs";
import VendorInventory from "./pages/VendorInventory";
import CustomerInventory from "./pages/CustomerInventory";
import SlaUpload from "./pages/SlaUpload";
import SlaView from "./pages/SlaView";
import MyCustomers from "./pages/MyCustomers";
import MyVendors from "./pages/MyVendors";
import RagEvaluation from "./pages/RagEvaluation";
import Chatbot from "./pages/Chatbot";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const location = useLocation();
  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

function RequireRole({
  roles,
  children,
}: {
  roles: Role[];
  children: React.ReactNode;
}) {
  const { hasRole } = useAuth();
  if (!hasRole(...roles)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AlertsProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <RequireAuth>
                    <Layout />
                  </RequireAuth>
                }
              >
                <Route index element={<Dashboard />} />

                {/* Shared (admin + vendor + customer) */}
                <Route path="orders" element={<Orders />} />
                <Route path="claims" element={<Claims />} />
                <Route path="alerts" element={<Alerts />} />
                <Route path="rag-evaluation" element={<RagEvaluation />} />
                <Route path="chatbot" element={<Chatbot />} />

                {/* Inventory */}
                <Route
                  path="vendor-inventory"
                  element={
                    <RequireRole roles={["admin", "vendor"]}>
                      <VendorInventory />
                    </RequireRole>
                  }
                />
                <Route
                  path="customer-inventory"
                  element={
                    <RequireRole roles={["admin", "customer"]}>
                      <CustomerInventory />
                    </RequireRole>
                  }
                />

                {/* SLA */}
                <Route
                  path="sla-upload"
                  element={
                    <RequireRole roles={["vendor"]}>
                      <SlaUpload />
                    </RequireRole>
                  }
                />
                <Route
                  path="sla"
                  element={
                    <RequireRole roles={["admin", "customer"]}>
                      <SlaView />
                    </RequireRole>
                  }
                />

                {/* Vendor only */}
                <Route
                  path="my-customers"
                  element={
                    <RequireRole roles={["vendor"]}>
                      <MyCustomers />
                    </RequireRole>
                  }
                />

                {/* Customer only */}
                <Route
                  path="my-vendors"
                  element={
                    <RequireRole roles={["customer"]}>
                      <MyVendors />
                    </RequireRole>
                  }
                />

                {/* Admin only */}
                <Route
                  path="users"
                  element={
                    <RequireRole roles={["admin"]}>
                      <Users />
                    </RequireRole>
                  }
                />
                <Route
                  path="vendors"
                  element={
                    <RequireRole roles={["admin"]}>
                      <Users filterRole="vendor" title="Vendors" />
                    </RequireRole>
                  }
                />
                <Route
                  path="customers"
                  element={
                    <RequireRole roles={["admin"]}>
                      <Users filterRole="customer" title="Customers" />
                    </RequireRole>
                  }
                />
                <Route
                  path="audit-logs"
                  element={
                    <RequireRole roles={["admin"]}>
                      <AuditLogs />
                    </RequireRole>
                  }
                />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
        </AlertsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
