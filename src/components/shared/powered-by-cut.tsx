import Link from "next/link";

/**
 * Footer mark on customer-facing pages.
 *
 * A link rather than plain text on purpose: the person looking at it is
 * usually a barbershop customer, and some of them cut hair for a living. It is
 * the only route from a shop's booking page back to Cut, and it costs nothing.
 *
 * Deliberately not a big logo — the page belongs to the barbershop, not to us,
 * and putting Cut's mark next to the shop's name would muddle whose business
 * the customer thinks they're dealing with.
 */
export function PoweredByCut({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-muted-foreground ${className}`}>
      Powered by{" "}
      <Link
        href="/"
        className="font-medium underline-offset-4 hover:underline"
      >
        Cut.
      </Link>
    </p>
  );
}
