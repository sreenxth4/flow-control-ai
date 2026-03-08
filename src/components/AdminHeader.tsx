import { Video, BarChart3, Sun, Moon, LogOut } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useTheme } from "@/hooks/use-theme";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/admin", label: "Upload & Analyze", icon: Video },
  { to: "/admin/dashboard", label: "Dashboard", icon: BarChart3 },
];

export function AdminHeader() {
  const { dark, toggle } = useTheme();
  const { logout } = useAdminAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <header className="flex h-12 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4">
      <div className="flex items-center gap-6">
        <span className="text-sm font-bold tracking-tight text-foreground">
          🚦 AI Traffic <span className="ml-1 rounded bg-accent/15 px-1.5 py-0.5 text-xs font-semibold text-accent">Admin</span>
        </span>
        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/admin"}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
              activeClassName="bg-primary/10 text-primary font-medium"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={toggle}>
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground">
          <LogOut className="mr-1.5 h-4 w-4" /> Logout
        </Button>
      </div>
    </header>
  );
}
