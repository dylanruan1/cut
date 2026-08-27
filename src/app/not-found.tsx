import Link from "next/link";
import { Scissors } from "lucide-react";

/**
 * Custom 404.
 *
 * Matters more than usual here because the most-shared URL in the product is a
 * shop's booking link. A mistyped or retired slug used to land on Next's raw
 * error page — a dead end on the one path that makes money.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      <Link
        href="/"
        className="mb-10 inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary">
          <Scissors className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
        </span>
        <span className="text-lg font-semibold tracking-tight">Cut.</span>
      </Link>

      <p className="nums text-sm font-medium uppercase tracking-widest text-muted-foreground">
        404
      </p>
      <h1 className="mt-3 max-w-md text-balance text-3xl font-semibold tracking-tight md:text-4xl">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-4 max-w-md text-balance text-muted-foreground">
        The link may be mistyped, or the shop may have changed its booking
        address. If someone sent you this link, ask them for a fresh one.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-transform hover:opacity-90 active:scale-[0.98]"
        >
          Go to homepage
        </Link>
        <Link
          href="/login"
          className="rounded-xl border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Shop owner sign in
        </Link>
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        Still stuck?{" "}
        <Link href="/support" className="font-medium underline underline-offset-4">
          Get help
        </Link>
      </p>
    </main>
  );
}
