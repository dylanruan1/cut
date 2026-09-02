"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

/**
 * Shows the shop's public links.
 *
 * Read-only: the slug is generated from the shop name and regenerated whenever
 * the name changes, so there is nothing here to edit. Old links keep working —
 * retired slugs are stored and redirected (see src/lib/shop-slug.ts), which is
 * what makes automatic renaming safe for QR stickers and Instagram bios.
 */
export function BookingLinkCard({ slug }: { slug: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  async function copy(url: string, key: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  }

  const links = [
    { key: "book", label: "Booking page", url: `${origin}/book/${slug}` },
    { key: "queue", label: "Walk-in queue", url: `${origin}/q/${slug}` },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Your links</CardTitle>
        <p className="text-sm text-muted-foreground">
          Share these with customers. They update automatically if you rename
          the shop, and old links keep working.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {links.map((link) => (
          <div key={link.key}>
            <p className="mb-1 text-sm font-medium">{link.label}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate border bg-muted/40 px-3 py-2 text-sm">
                {link.url}
              </code>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => copy(link.url, link.key)}
              >
                {copied === link.key ? (
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
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
