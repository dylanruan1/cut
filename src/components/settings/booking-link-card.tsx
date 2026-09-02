"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, Copy, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateBookingSlug } from "@/actions/booking-link";
import { toast } from "@/hooks/use-toast";

/**
 * Editing the public booking link.
 *
 * Separate from the shop name field, and warns before saving, because every
 * existing link — QR stickers, Instagram bios, confirmation texts already sent
 * — stops working the moment this changes.
 */
export function BookingLinkCard({
  initialSlug,
  canManage,
}: {
  initialSlug: string;
  canManage: boolean;
}) {
  const [slug, setSlug] = useState(initialSlug);
  const [saved, setSaved] = useState(initialSlug);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const changed = slug.trim().toLowerCase() !== saved;

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateBookingSlug(slug);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setSaved(res.slug);
      setSlug(res.slug);
      toast({
        title: "Booking link updated",
        description: "Old links no longer work — update your QR code and bio.",
      });
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${origin}/book/${saved}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Your booking link</CardTitle>
        <p className="text-sm text-muted-foreground">
          This is what customers use to book. It doesn&apos;t change when you
          rename the shop, so links you&apos;ve already shared keep working.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate border bg-muted/40 px-3 py-2 text-sm">
            {origin}/book/{saved}
          </code>
          <Button variant="outline" size="sm" onClick={copy} className="shrink-0">
            {copied ? (
              <>
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copy
              </>
            )}
          </Button>
        </div>

        {canManage && (
          <>
            <div className="space-y-2">
              <Label htmlFor="slug">Change the link</Label>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-sm text-muted-foreground">
                  /book/
                </span>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="fades-barbershop"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers and hyphens.
              </p>
            </div>

            {changed && (
              <div className="flex gap-2 border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span>
                  Changing this breaks every link you&apos;ve already shared —
                  your printed QR code, your Instagram bio, and links in texts
                  customers already received.
                </span>
              </div>
            )}

            {error && (
              <div className="border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button disabled={pending || !changed} onClick={save}>
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Change booking link"
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
