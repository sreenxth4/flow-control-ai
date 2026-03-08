import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import MapPage from "./pages/MapPage";
import DetectionPage from "./pages/DetectionPage";
import DashboardPage from "./pages/DashboardPage";
import RoutePage from "./pages/RoutePage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <div className="flex h-screen flex-col">
          <AppHeader />
          <main className="flex-1 overflow-hidden">
            <Routes>
              <Route path="/" element={<MapPage />} />
              <Route path="/detection" element={<DetectionPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/routes" element={<RoutePage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
