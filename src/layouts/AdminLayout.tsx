import { Navigate, Outlet } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { AdminHeader } from "@/components/AdminHeader";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export function AdminLayout() {
  const { isAuthenticated } = useAdminAuth();

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100 dark">
      <AdminHeader />
      <main className="flex-1 overflow-hidden">
        <ErrorBoundary fallbackTitle="Admin page error">
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
