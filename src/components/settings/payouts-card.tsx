"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  startPayoutOnboarding,
  refreshPayoutStatus,
  getPayoutDashboardLink,
  setDepositsEnabled,
} from "@/actions/connect";
import {
  Banknote,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";

type ConnectStatus = "NOT_CONNECTED" | "PENDING" | "ACTIVE" | "RESTRICTED";

export function PayoutsCard({
  status,
  depositsEnabled,
  canManage,
  justReturnedFromStripe = false,
}: {
  status: ConnectStatus;
  depositsEnabled: boolean;
  canManage: boolean;
  /** Landed here from Stripe's return_url (/settings?payouts=...). */
  justReturnedFromStripe?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(depositsEnabled);
  const [checking, setChecking] = useState(justReturnedFromStripe && canManage);

  // Stripe sends the owner straight back, minutes before the account.updated
  // webhook lands. Until then the status on record is the PENDING we wrote when
  // setup started, so someone who just finished was told "Setup incomplete" —
  // and only found out otherwise by guessing at "Check status". Ask Stripe.
  useEffect(() => {
    if (!checking) return;
    let cancelled = false;
    refreshPayoutStatus()
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        setChecking(false);
        startTransition(() => router.refresh());
      });
    return () => {
      cancelled = true;
    };
    // Runs once on arrival; `checking` only ever goes true -> false.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onConnect() {
    setBusy("connect");
    const res = await startPayoutOnboarding();
    setBusy(null);
    if (res.error) {
      toast({ title: "Couldn't start setup", description: res.error, variant: "destructive" });
      return;
    }
    if (res.url) window.location.href = res.url;
  }

  async function onRefresh() {
    setBusy("refresh");
    const res = await refreshPayoutStatus();
    setBusy(null);
    if (res.error) {
      toast({ title: res.error, variant: "destructive" });
      return;
    }
    toast({ title: `Payout status: ${res.status.toLowerCase().replace("_", " ")}` });
    startTransition(() => router.refresh());
  }

  async function onDashboard() {
    setBusy("dashboard");
    const res = await getPayoutDashboardLink();
    setBusy(null);
    if (res.error) {
      toast({ title: res.error, variant: "destructive" });
      return;
    }
    if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function onToggle(next: boolean) {
    setEnabled(next);
    const res = await setDepositsEnabled(next);
    if (res.error) {
      setEnabled(!next); // revert
      toast({ title: res.error, variant: "destructive" });
      return;
    }
    toast({ title: next ? "Deposits enabled" : "Deposits disabled" });
    startTransition(() => router.refresh());
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Banknote className="h-5 w-5 text-primary" />
          <CardTitle>Deposits &amp; payouts</CardTitle>
        </div>
        <CardDescription>
          Require a deposit when customers book online, so no-shows cost them
          instead of you. Deposits go straight to your bank account.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {!checking && <StatusRow status={status} />}

        {checking ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking with Stripe…
          </p>
        ) : status !== "ACTIVE" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {status === "NOT_CONNECTED"
                ? "Connect a payout account to start collecting deposits. Stripe handles the bank details — takes a few minutes."
                : status === "PENDING"
                  ? "Stripe still needs a few details before you can accept payments."
                  : "Stripe needs more information before this account can accept payments."}
            </p>
            {canManage && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={onConnect} disabled={busy !== null}>
                  {busy === "connect" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {status === "NOT_CONNECTED" ? "Set up payouts" : "Continue setup"}
                </Button>
                <Button variant="outline" onClick={onRefresh} disabled={busy !== null}>
                  {busy === "refresh" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Check status
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="deposits">Require deposits online</Label>
                <p className="text-sm text-muted-foreground">
                  Applies to services where you&apos;ve set a deposit amount.
                </p>
              </div>
              <Switch
                id="deposits"
                checked={enabled}
                onCheckedChange={onToggle}
                disabled={!canManage || pending}
              />
            </div>

            {enabled && (
              <p className="text-sm text-muted-foreground">
                Set a deposit amount per service on the{" "}
                <a href="/services" className="underline underline-offset-4">
                  Services
                </a>{" "}
                page. Services without an amount stay free to book.
              </p>
            )}

            {canManage && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={onDashboard} disabled={busy !== null}>
                  {busy === "dashboard" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-2 h-4 w-4" />
                  )}
                  Stripe dashboard
                </Button>
                <Button variant="ghost" onClick={onRefresh} disabled={busy !== null}>
                  {busy === "refresh" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Refresh
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusRow({ status }: { status: ConnectStatus }) {
  const map: Record<
    ConnectStatus,
    { label: string; className: string; icon: React.ReactNode }
  > = {
    ACTIVE: {
      label: "Connected",
      className: "bg-primary/10 text-primary",
      icon: <ShieldCheck className="h-3.5 w-3.5" />,
    },
    PENDING: {
      label: "Setup incomplete",
      className: "bg-amber-500/10 text-amber-600",
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
    },
    RESTRICTED: {
      label: "Action needed",
      className: "bg-destructive/10 text-destructive",
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
    },
    NOT_CONNECTED: {
      label: "Not connected",
      className: "bg-muted text-muted-foreground",
      icon: <Banknote className="h-3.5 w-3.5" />,
    },
  };
  const s = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${s.className}`}
    >
      {s.icon}
      {s.label}
    </span>
  );
}
