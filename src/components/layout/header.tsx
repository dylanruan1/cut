"use client";

import Link from "next/link";
import { Menu, Moon, Sun, Bell, LogOut, Scissors, ChevronsUpDown, Check } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { navItems } from "@/components/layout/sidebar";
import { usePathname, useRouter } from "next/navigation";
import { cn, getInitials } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { setActiveShop } from "@/actions/auth";
import { useTransition } from "react";

type MembershipOption = {
  id: string;
  role: string;
  barbershop: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
  };
};

interface HeaderProps {
  userName?: string | null;
  userEmail?: string;
  avatarUrl?: string | null;
  shopName?: string;
  memberships?: MembershipOption[];
  activeShopId?: string | null;
}

export function Header({
  userName,
  userEmail,
  avatarUrl,
  shopName,
  memberships = [],
  activeShopId,
}: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function handleSwitchShop(barbershopId: string) {
    if (barbershopId === activeShopId) return;
    startTransition(async () => {
      await setActiveShop(barbershopId);
      router.refresh();
    });
  }

  const showSwitcher = memberships.length > 1;

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-background/80 backdrop-blur-glass px-4 lg:px-6">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-4">
          <div className="flex items-center gap-2 mb-6">
            <div className="h-8 w-8 rounded-xl bg-primary flex items-center justify-center">
              <Scissors className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold">Cut.</span>
          </div>
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>

      <div className="flex-1 min-w-0">
        {showSwitcher ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-9 px-2 gap-2 max-w-full"
                disabled={pending}
                aria-label="Switch barbershop"
              >
                <span className="truncate text-sm font-medium">{shopName}</span>
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Your shops</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {memberships.map((m) => (
                <DropdownMenuItem
                  key={m.barbershop.id}
                  onClick={() => handleSwitchShop(m.barbershop.id)}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate">{m.barbershop.name}</span>
                  {m.barbershop.id === activeShopId && (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          shopName && (
            <p className="text-sm text-muted-foreground hidden sm:block truncate">{shopName}</p>
          )
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        aria-label="Toggle theme"
      >
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </Button>

      <Button variant="ghost" size="icon" aria-label="Notifications">
        <Bell className="h-4 w-4" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-9 w-9 rounded-full" aria-label="User menu">
            <Avatar className="h-9 w-9">
              <AvatarImage src={avatarUrl ?? undefined} alt={userName ?? "User"} />
              <AvatarFallback>{getInitials(userName ?? userEmail ?? "U")}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="px-2 py-1.5">
            <p className="text-sm font-medium">{userName}</p>
            <p className="text-xs text-muted-foreground">{userEmail}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings">Settings</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
