"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cancelShopDeletion } from "@/actions/account";
import { toast } from "@/hooks/use-toast";

/**
 * Shown on every page while a shop is inside the deletion grace window.
 *
 * Deliberately persistent and impossible to dismiss: the shop is days away
 * from losing everything, and a banner someone can close is a banner they will
 * close and then forget.
 */
export function DeletionBanner({
  daysLeft,
  canUndo,
}: {
  daysLeft: number;
  canUndo: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function undo() {
    startTransition(async () => {
      const res = await cancelShopDeletion();
      if ("error" in res) {
        toast({
          title: "Couldn't undo",
          description: res.error,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Deletion cancelled",
        description: "Your account and data are staying put.",
      });
      router.refresh();
    });
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
      <span className="flex-1">
        {daysLeft === 0 ? (
          <>This account is being deleted. Everything is erased shortly.</>
        ) : (
          <>
            This account is scheduled for deletion. Everything is permanently
            erased in{" "}
            <span className="font-medium">
              {daysLeft} {daysLeft === 1 ? "day" : "days"}
            </span>
            .
          </>
        )}
      </span>
      {canUndo && (
        <Button size="sm" variant="outline" disabled={pending} onClick={undo}>
          {pending ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Undoing…
            </>
          ) : (
            "Keep my account"
          )}
        </Button>
      )}
    </div>
  );
}
