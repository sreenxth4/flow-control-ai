import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type PortalRole = "admin" | "user";

interface PortalContextType {
  role: PortalRole;
  setRole: (role: PortalRole) => void;
  isAdmin: boolean;
}

const PortalContext = createContext<PortalContextType | undefined>(undefined);

export function PortalProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<PortalRole>(() => {
    const saved = localStorage.getItem("portal-role");
    return (saved === "admin" || saved === "user") ? saved : "user";
  });

  const setRole = useCallback((newRole: PortalRole) => {
    setRoleState(newRole);
    localStorage.setItem("portal-role", newRole);
  }, []);

  return (
    <PortalContext.Provider value={{ role, setRole, isAdmin: role === "admin" }}>
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("usePortal must be used within PortalProvider");
  return ctx;
}
