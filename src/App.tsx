import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { AdminLayout } from "@/layouts/AdminLayout";
import { UserLayout } from "@/layouts/UserLayout";
import NotFound from "./pages/NotFound";
import LandingPage from "./pages/LandingPage";

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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AdminAuthProvider>
          <Routes>
            {/* Landing */}
            <Route path="/" element={<LandingPage />} />

            {/* Admin - protected */}
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDetectionPage />} />
              <Route path="dashboard" element={<AdminDashboardPage />} />
            </Route>

            {/* User - public */}
            <Route path="/user" element={<UserLayout />}>
              <Route index element={<UserMapPage />} />
              <Route path="routes" element={<UserRoutePage />} />
              <Route path="conditions" element={<UserConditionsPage />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AdminAuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
