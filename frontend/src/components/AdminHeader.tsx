import { Video, BarChart3, Sun, Moon, LogOut } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useTheme } from "@/hooks/use-theme";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/admin", label: "Upload & Analyze", shortLabel: "Upload", icon: Video },
  { to: "/admin/dashboard", label: "Dashboard", shortLabel: "Dashboard", icon: BarChart3 },
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
    <header className="relative z-50 flex h-12 items-center justify-between border-b border-border bg-background px-2 sm:px-4">
      <div className="flex items-center gap-2 sm:gap-6 min-w-0">
        <Link to="/" className="flex items-center gap-1.5 sm:gap-2 hover:opacity-80 transition-opacity flex-shrink-0">
          <img src="/logo.png" alt="Logo" className="h-6 sm:h-7 w-auto rounded-md" />
          <span className="text-xs sm:text-sm font-bold tracking-tight text-foreground">
            AI Traffic <span className="ml-1 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] sm:text-xs font-semibold text-accent hidden sm:inline">Admin</span>
          </span>
        </Link>
        <nav className="flex items-center gap-0.5 sm:gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/admin"}
              className="flex items-center gap-1 sm:gap-1.5 rounded-md px-2 sm:px-3 py-1.5 text-xs sm:text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
              activeClassName="bg-primary/10 text-primary font-medium"
            >
              <item.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">{item.label}</span>
              <span className="sm:hidden">{item.shortLabel}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
        <Button variant="ghost" size="icon" onClick={toggle} className="h-8 w-8">
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground px-2 sm:px-3">
          <LogOut className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>
    </header>
  );
}
