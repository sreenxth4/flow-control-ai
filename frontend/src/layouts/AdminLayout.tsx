import { Navigate, Outlet } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { AdminHeader } from "@/components/AdminHeader";
import { useViewportCssVars } from "@/hooks/useViewportCssVars";

export function AdminLayout() {
  const { isAuthenticated } = useAdminAuth();
  useViewportCssVars();

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex h-[var(--app-vh,100dvh)] min-h-[100svh] min-h-[100dvh] flex-col overflow-hidden bg-background text-foreground tracking-tight">
      <AdminHeader />
      <main className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
