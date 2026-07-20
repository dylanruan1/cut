"use client";

import { cn } from "@/lib/utils";
import { Calendar, Users, Settings, LayoutDashboard, Search, Scissors, BarChart3 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/clients", label: "Clients", icon: Search },
  { href: "/services", label: "Services", icon: Scissors },
  { href: "/team", label: "Team", icon: Users },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col w-64 border-r bg-card/50 backdrop-blur-glass p-4 gap-1",
        className
      )}
      aria-label="Main navigation"
    >
      <div className="px-3 py-4 mb-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-primary flex items-center justify-center">
            <Scissors className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
          </div>
          <span className="text-xl font-semibold tracking-tight">Cut.</span>
        </Link>
      </div>
      <nav className="flex flex-col gap-1" role="navigation">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                isActive
                  ? "bg-primary text-primary-foreground shadow-soft"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export { navItems };
