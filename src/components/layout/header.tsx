"use client";

import Link from "next/link";
import { Menu, Moon, Sun, LogOut, Scissors } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { navItems } from "@/components/layout/sidebar";
import { usePathname, useRouter } from "next/navigation";
import { cn, getInitials } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  ShopSwitcher,
  type ShopMembershipOption,
} from "@/components/layout/shop-switcher";
import { DevTestShopButton } from "@/components/layout/dev-test-shop-button";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HeaderProps {
  userName?: string | null;
  userEmail?: string;
  avatarUrl?: string | null;
  shopName?: string;
  memberships?: ShopMembershipOption[];
  activeShopId?: string | null;
  showDevTools?: boolean;
  hasTestShop2?: boolean;
  showBilling?: boolean;
  /** Unread count, resolved on the server so the badge is right on first paint. */
  unreadNotifications?: number;
}

export function Header({
  userName,
  userEmail,
  avatarUrl,
  shopName,
  memberships = [],
  activeShopId,
  showDevTools = false,
  hasTestShop2 = false,
  showBilling = true,
  unreadNotifications = 0,
}: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const mobileNav = showBilling
    ? navItems
    : navItems.filter((item) => item.href !== "/settings/billing");

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-background/80 backdrop-blur-glass px-4 lg:px-6">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-xl bg-primary flex items-center justify-center">
              <Scissors className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold">Cut.</span>
          </div>
          <div className="mb-4">
            <ShopSwitcher
              shopName={shopName}
              memberships={memberships}
              activeShopId={activeShopId}
              variant="sidebar"
            />
          </div>
          <nav className="flex flex-col gap-1">
            {mobileNav.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/settings"
                  ? pathname === "/settings" ||
                    (pathname.startsWith("/settings/") &&
                      !pathname.startsWith("/settings/billing"))
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
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
          {showDevTools && (
            <div className="mt-6 pt-4 border-t space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1">
                Dev tools
              </p>
              <DevTestShopButton hasTestShop2={hasTestShop2} />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <div className="flex-1 min-w-0 lg:hidden">
        <ShopSwitcher
          shopName={shopName}
          memberships={memberships}
          activeShopId={activeShopId}
          variant="header"
        />
      </div>

      <div className="flex-1 min-w-0 hidden lg:block" aria-hidden="true" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Toggle theme</TooltipContent>
      </Tooltip>

      <NotificationsBell initialUnread={unreadNotifications} />

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
