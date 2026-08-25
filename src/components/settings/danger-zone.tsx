"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Loader2 } from "lucide-react";
import { requestShopDeletion, deleteOwnStaffAccount } from "@/actions/account";
import { DELETION_GRACE_DAYS } from "@/lib/account-deletion";
import { toast } from "@/hooks/use-toast";

/**
 * Delete-account controls.
 *
 * Everything here is written to be hard to do by accident and easy to
 * understand before you commit: the consequences are spelled out in full, and
 * an owner has to type the shop's name rather than click a red button.
 */
export function DangerZone({
  isOwner,
  shopName,
}: {
  isOwner: boolean;
  shopName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmOwnerDeletion() {
    setError(null);
    startTransition(async () => {
      const res = await requestShopDeletion(typed);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setTyped("");
      toast({
        title: "Account scheduled for deletion",
        description: `Everything is erased in ${res.purgeInDays} days. You can undo it until then.`,
      });
      router.refresh();
    });
  }

  function confirmStaffDeletion() {
    setError(null);
    startTransition(async () => {
      const res = await deleteOwnStaffAccount();
      if ("error" in res) {
        setError(res.error);
        return;
      }
      // The session is already gone server-side.
      window.location.href = "/login";
    });
  }

  return (
    <>
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Delete account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isOwner ? (
            <>
              <p className="text-sm text-muted-foreground">
                Deletes <span className="font-medium text-foreground">{shopName}</span>{" "}
                and everything in it — your barbers, clients, appointment
                history, and walk-in records. Your subscription is cancelled
                straight away.
              </p>
              <p className="text-sm text-muted-foreground">
                Nothing is erased for {DELETION_GRACE_DAYS} days, so you can
                change your mind. After that it&apos;s permanent and we
                can&apos;t recover it.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Deletes your login. The shop and its appointment history stay with
              the owner. This happens immediately and can&apos;t be undone.
            </p>
          )}

          <Button
            variant="destructive"
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
          >
            {isOwner ? "Delete this shop account" : "Delete my account"}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isOwner ? `Delete ${shopName}?` : "Delete your account?"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {isOwner ? (
              <>
                <p className="text-sm text-muted-foreground">
                  This schedules permanent deletion of every client, appointment
                  and record belonging to this shop.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="confirm-shop-name">
                    Type <span className="font-medium text-foreground">{shopName}</span>{" "}
                    to confirm
                  </Label>
                  <Input
                    id="confirm-shop-name"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                    placeholder={shopName}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                You&apos;ll be signed out and won&apos;t be able to sign back
                in. The owner would need to invite you again.
              </p>
            )}

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="destructive"
                className="flex-1"
                disabled={pending}
                onClick={isOwner ? confirmOwnerDeletion : confirmStaffDeletion}
              >
                {pending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting…
                  </>
                ) : isOwner ? (
                  "Schedule deletion"
                ) : (
                  "Delete my account"
                )}
              </Button>
              <Button
                variant="ghost"
                className="flex-1"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Keep my account
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
