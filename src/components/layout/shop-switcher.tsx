"use client";

import { Check, ChevronsUpDown, Store, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setActiveShop } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export type ShopMembershipOption = {
  id: string;
  role: string;
  barbershop: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
  };
};

interface ShopSwitcherProps {
  shopName?: string;
  memberships?: ShopMembershipOption[];
  activeShopId?: string | null;
  variant?: "header" | "sidebar";
  className?: string;
}

export function ShopSwitcher({
  shopName,
  memberships = [],
  activeShopId,
  variant = "header",
  className,
}: ShopSwitcherProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const showSwitcher = memberships.length > 1;

  function handleSwitchShop(barbershopId: string, name: string) {
    if (barbershopId === activeShopId) return;
    startTransition(async () => {
      const result = await setActiveShop(barbershopId);
      if (result && "error" in result && result.error) {
        toast({
          title: "Could not switch shops",
          description: result.error,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Shop switched", description: `Now viewing ${name}` });
      router.refresh();
    });
  }

  if (!shopName) return null;

  if (!showSwitcher) {
    if (variant === "sidebar") {
      return (
        <div className={cn("px-3 py-2 rounded-xl bg-muted/50", className)}>
          <p className="text-xs text-muted-foreground mb-0.5">Active shop</p>
          <p className="text-sm font-medium truncate">{shopName}</p>
        </div>
      );
    }
    return (
      <p className={cn("text-sm font-medium truncate", className)}>{shopName}</p>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant === "sidebar" ? "outline" : "ghost"}
          className={cn(
            variant === "sidebar"
              ? "w-full h-auto py-2.5 px-3 justify-between gap-2"
              : "h-9 px-2 gap-2 max-w-full",
            className
          )}
          disabled={pending}
          aria-label="Switch barbershop"
        >
          <span className="flex items-center gap-2 min-w-0">
            {variant === "sidebar" && (
              <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 text-left">
              {variant === "sidebar" && (
                <span className="block text-xs text-muted-foreground">Active shop</span>
              )}
              <span className="block truncate text-sm font-medium">{shopName}</span>
            </span>
          </span>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Your shops</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.barbershop.id}
            onClick={() => handleSwitchShop(m.barbershop.id, m.barbershop.name)}
            className="flex items-center justify-between gap-2"
            disabled={pending}
          >
            <span className="truncate">{m.barbershop.name}</span>
            {m.barbershop.id === activeShopId && (
              <Check className="h-4 w-4 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
