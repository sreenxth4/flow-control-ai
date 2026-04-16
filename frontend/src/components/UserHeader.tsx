import { Map, Navigation, Activity, Sun, Moon } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Link } from "react-router-dom";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/user", label: "Map", icon: Map },
  { to: "/user/routes", label: "Routes", icon: Navigation },
  { to: "/user/conditions", label: "Conditions", icon: Activity },
];

export function UserHeader() {
  const { dark, toggle } = useTheme();

  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-card px-2 sm:px-4">
      <div className="flex items-center gap-3 sm:gap-6 min-w-0">
        <Link to="/" className="flex items-center gap-1.5 hover:opacity-80 transition-opacity flex-shrink-0">
          <img src="/logo.png" alt="Logo" className="h-6 sm:h-7 w-auto rounded-md" />
          <span className="text-xs sm:text-sm font-bold tracking-tight text-foreground">
            AI Traffic
          </span>
        </Link>
        <nav className="flex items-center gap-0.5 sm:gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/user"}
              className="flex items-center gap-1 sm:gap-1.5 rounded-md px-1.5 sm:px-3 py-1.5 text-[11px] sm:text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
              activeClassName="bg-primary/10 text-primary font-medium"
            >
              <item.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Button variant="ghost" size="icon" onClick={toggle} className="flex-shrink-0 h-8 w-8">
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
    </header>
  );
}
