import { Map, Navigation, Activity, Sun, Moon } from "lucide-react";
import { NavLink } from "@/components/NavLink";
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
    <header className="flex h-12 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-6">
        <span className="text-sm font-bold tracking-tight text-foreground">
          🚦 AI Traffic
        </span>
        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/user"}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
              activeClassName="bg-primary/10 text-primary font-medium"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Button variant="ghost" size="icon" onClick={toggle}>
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
    </header>
  );
}
