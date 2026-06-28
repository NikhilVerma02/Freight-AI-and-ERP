import React from "react";
import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { AuthProvider, Role, useAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import Login from "./pages/Login";
import NoAccess from "./pages/NoAccess";
import CaseIntake from "./pages/CaseIntake";
import CaseDetail from "./pages/CaseDetail";
import CaseHistory from "./pages/CaseHistory";
import ClaimRequests from "./pages/ClaimRequests";
import OrderRequests from "./pages/OrderRequests";
import KpiDashboard from "./pages/KpiDashboard";
import LogsExceptions from "./pages/LogsExceptions";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Claims intake (video upload), history, and the Claim/Order Request tabs
// are open to all three roles — customers are the ones filing damage
// claims, so they need the same access as vendor/admin staff. KPI/logs
// stay operator-internal (admin-only).
function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { hasRole } = useAuth();
  if (!hasRole(...roles)) return <Navigate to="/no-access" replace />;
  return <>{children}</>;
}

function homePathForRole(role: Role | undefined): string {
  if (role === "admin" || role === "vendor" || role === "customer") return "/intake";
  return "/no-access";
}

function AppRoutes() {
  const { token, user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to={homePathForRole(user?.role)} replace /> : <Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/no-access" element={<NoAccess />} />
        <Route
          path="/intake"
          element={
            <RequireRole roles={["admin", "vendor", "customer"]}>
              <CaseIntake />
            </RequireRole>
          }
        />
        <Route
          path="/history"
          element={
            <RequireRole roles={["admin", "vendor", "customer"]}>
              <CaseHistory />
            </RequireRole>
          }
        />
        <Route
          path="/cases/:runId"
          element={
            <RequireRole roles={["admin", "vendor", "customer"]}>
              <CaseDetail />
            </RequireRole>
          }
        />
        <Route
          path="/claims"
          element={
            <RequireRole roles={["admin", "vendor", "customer"]}>
              <ClaimRequests />
            </RequireRole>
          }
        />
        <Route
          path="/orders"
          element={
            <RequireRole roles={["admin", "vendor", "customer"]}>
              <OrderRequests />
            </RequireRole>
          }
        />
        <Route
          path="/kpi"
          element={
            <RequireRole roles={["admin", "vendor", "customer"]}>
              <KpiDashboard />
            </RequireRole>
          }
        />
        <Route
          path="/logs"
          element={
            <RequireRole roles={["admin"]}>
              <LogsExceptions />
            </RequireRole>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to={token ? homePathForRole(user?.role) : "/login"} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
