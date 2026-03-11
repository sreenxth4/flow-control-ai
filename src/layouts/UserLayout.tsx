import { Outlet } from "react-router-dom";
import { UserHeader } from "@/components/UserHeader";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export function UserLayout() {
  return (
    <div className="flex h-screen flex-col">
      <UserHeader />
      <main className="flex-1 overflow-hidden">
        <ErrorBoundary fallbackTitle="Page error">
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
