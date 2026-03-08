import { Shield, User } from "lucide-react";
import { usePortal, PortalRole } from "@/contexts/PortalContext";
import { cn } from "@/lib/utils";

export function PortalSwitcher() {
  const { role, setRole } = usePortal();

  const options: { value: PortalRole; label: string; icon: typeof Shield }[] = [
    { value: "user", label: "User", icon: User },
    { value: "admin", label: "Admin", icon: Shield },
  ];

  return (
    <div className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setRole(opt.value)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            role === opt.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <opt.icon className="h-3.5 w-3.5" />
          {opt.label}
        </button>
      ))}
    </div>
  );
}
