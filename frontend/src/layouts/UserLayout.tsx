import { Outlet } from "react-router-dom";
import { UserHeader } from "@/components/UserHeader";
import { useViewportCssVars } from "@/hooks/useViewportCssVars";

export function UserLayout() {
  useViewportCssVars();

  return (
    <div className="flex h-[var(--app-vh,100dvh)] min-h-[100svh] min-h-[100dvh] flex-col overflow-hidden">
      <UserHeader />
      <main className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
