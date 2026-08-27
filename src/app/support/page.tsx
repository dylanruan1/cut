import type { Metadata } from "next";
import Link from "next/link";
import { Scissors } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { SupportForm } from "@/components/support/support-form";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with Cut — booking, payments, or anything else.",
};

export const dynamic = "force-dynamic";

/**
 * Public support page.
 *
 * Reachable without an account, because the people most likely to be stuck are
 * the ones who cannot get in. When someone IS signed in their details are
 * prefilled and their shop is attached to the message automatically.
 */
export default async function SupportPage() {
  const user = await getCurrentUser().catch(() => null);

  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-12">
      <Link href="/" className="mb-10 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
          <Scissors className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
        </span>
        <span className="text-xl font-semibold tracking-tight">Cut.</span>
      </Link>

      <div className="w-full max-w-lg">
        <h1 className="text-balance text-3xl font-semibold tracking-tight">
          How can we help?
        </h1>
        <p className="mt-2 text-balance text-muted-foreground">
          Send us a message and we&apos;ll reply by email. Include as much
          detail as you can — what you were doing, and what happened instead.
        </p>

        <div className="mt-8">
          <SupportForm
            defaultName={user?.name ?? ""}
            defaultEmail={user?.email ?? ""}
            shopName={user?.barbershop?.name ?? null}
          />
        </div>
      </div>
    </main>
  );
}
