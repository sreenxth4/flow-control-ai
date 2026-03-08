import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { PortalProvider, usePortal } from "@/contexts/PortalContext";
import NotFound from "./pages/NotFound";

// Admin pages
import AdminMapPage from "./pages/admin/AdminMapPage";
import AdminDetectionPage from "./pages/admin/AdminDetectionPage";
import AdminOptimizePage from "./pages/admin/AdminOptimizePage";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";

// User pages
import UserMapPage from "./pages/user/UserMapPage";
import UserRoutePage from "./pages/user/UserRoutePage";
import UserConditionsPage from "./pages/user/UserConditionsPage";

const queryClient = new QueryClient();

function AppRoutes() {
  const { isAdmin } = usePortal();

  return (
    <Routes>
      {/* User routes */}
      <Route path="/" element={isAdmin ? <Navigate to="/admin" replace /> : <UserMapPage />} />
      <Route path="/routes" element={isAdmin ? <Navigate to="/admin" replace /> : <UserRoutePage />} />
      <Route path="/conditions" element={isAdmin ? <Navigate to="/admin" replace /> : <UserConditionsPage />} />

      {/* Admin routes */}
      <Route path="/admin" element={!isAdmin ? <Navigate to="/" replace /> : <AdminMapPage />} />
      <Route path="/admin/detection" element={!isAdmin ? <Navigate to="/" replace /> : <AdminDetectionPage />} />
      <Route path="/admin/optimize" element={!isAdmin ? <Navigate to="/" replace /> : <AdminOptimizePage />} />
      <Route path="/admin/dashboard" element={!isAdmin ? <Navigate to="/" replace /> : <AdminDashboardPage />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <PortalProvider>
          <div className="flex h-screen flex-col">
            <AppHeader />
            <main className="flex-1 overflow-hidden">
              <AppRoutes />
            </main>
          </div>
        </PortalProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
