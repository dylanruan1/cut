"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { setBarberPin, clearBarberPin } from "@/actions/appointments";
import { KeyRound, Check, Loader2, X } from "lucide-react";

/**
 * Sets a barber's cash-verification PIN.
 *
 * The barber memorises it and types it on a *customer's* phone to confirm a
 * cash payment — that's why it needs no device at the station. Stored hashed,
 * so it can be replaced but never read back.
 */
export function BarberPinControl({
  barberId,
  barberName,
  hasPin,
}: {
  barberId: string;
  barberName: string;
  hasPin: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    if (pin !== confirm) {
      setError("The two PINs don't match.");
      return;
    }
    startTransition(async () => {
      const res = await setBarberPin(barberId, pin);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast({
        title: "PIN set",
        description: `${barberName} can now confirm cash payments.`,
      });
      setPin("");
      setConfirm("");
      setEditing(false);
      router.refresh();
    });
  }

  function clear() {
    startTransition(async () => {
      const res = await clearBarberPin(barberId);
      if (res.error) {
        toast({ title: res.error, variant: "destructive" });
        return;
      }
      toast({ title: "PIN removed" });
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          {hasPin ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-primary" />
              Cash PIN set
            </span>
          ) : (
            <span className="text-muted-foreground">No cash PIN</span>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            disabled={pending}
          >
            {hasPin ? "Change" : "Set PIN"}
          </Button>
          {hasPin && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={clear}
              disabled={pending}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl border p-3">
      <p className="text-xs text-muted-foreground">
        {barberName} memorises this and types it on the customer&apos;s phone to
        confirm cash. Don&apos;t use anything obvious — the customer is watching.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="New PIN"
          inputMode="numeric"
          type="password"
          autoComplete="off"
          className="text-center tracking-[0.3em]"
        />
        <Input
          value={confirm}
          onChange={(e) =>
            setConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))
          }
          placeholder="Confirm"
          inputMode="numeric"
          type="password"
          autoComplete="off"
          className="text-center tracking-[0.3em]"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          onClick={save}
          disabled={pending || pin.length !== 4 || confirm.length !== 4}
        >
          {pending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
          Save PIN
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setPin("");
            setConfirm("");
            setError(null);
          }}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
