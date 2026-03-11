import { Outlet } from "react-router-dom";
import { UserHeader } from "@/components/UserHeader";

export function UserLayout() {
  return (
    <div className="flex h-screen flex-col">
      <UserHeader />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
