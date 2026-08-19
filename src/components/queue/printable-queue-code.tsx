"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Printer, Copy, Check, ExternalLink } from "lucide-react";

/**
 * The printable walk-in sign. Everything inside `#queue-sign` is what lands on
 * paper; the surrounding controls are hidden when printing.
 */
export function PrintableQueueCode({
  shopName,
  url,
  qrSvg,
}: {
  shopName: string;
  url: string;
  qrSvg: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: "Link copied" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #queue-sign, #queue-sign * { visibility: visible; }
          #queue-sign {
            position: absolute;
            inset: 0;
            margin: 0;
            border: none;
            box-shadow: none;
            width: 100%;
          }
          @page { margin: 1.5cm; }
        }
      `}</style>

      <div className="no-print">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Walk-in QR code
        </h1>
        <p className="mt-1 text-muted-foreground">
          Print this and put it on the door or counter. Customers scan it to
          join the line without waiting around.
        </p>
      </div>

      <div className="no-print flex flex-wrap gap-2">
        <Button onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print sign
        </Button>
        <Button variant="outline" onClick={copy}>
          {copied ? (
            <Check className="mr-2 h-4 w-4" />
          ) : (
            <Copy className="mr-2 h-4 w-4" />
          )}
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button variant="ghost" asChild>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Preview
          </a>
        </Button>
      </div>

      <div className="no-print">
        <Input readOnly value={url} className="font-mono text-sm" />
      </div>

      {/* The sign itself */}
      <div
        id="queue-sign"
        className="mx-auto max-w-md rounded-2xl border bg-white p-10 text-center text-black shadow-card"
      >
        <p className="text-sm font-medium uppercase tracking-widest text-neutral-500">
          {shopName}
        </p>
        <h2 className="mt-3 text-4xl font-bold leading-tight tracking-tight">
          Skip the wait
        </h2>
        <p className="mt-3 text-lg text-neutral-600">
          Scan to join the line. We&apos;ll text you when you&apos;re up.
        </p>

        <div
          className="mx-auto mt-8 w-full max-w-[300px] [&>svg]:h-auto [&>svg]:w-full"
          // Server-rendered QR SVG — safe, generated from our own URL.
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />

        <p className="mt-6 break-all font-mono text-xs text-neutral-500">
          {url.replace(/^https?:\/\//, "")}
        </p>
        <p className="mt-6 text-xs text-neutral-400">Powered by Cut.</p>
      </div>
    </div>
  );
}
