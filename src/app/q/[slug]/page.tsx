import { PoweredByCut } from "@/components/shared/powered-by-cut";
import { resolveSlugAlias } from "@/lib/shop-slug";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getQueueShop } from "@/actions/queue";
import { JoinQueueForm } from "@/components/queue/join-queue-form";
import { Scissors, Users, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const shop = await getQueueShop(slug);
  return {
    title: shop ? `Join the line at ${shop.name}` : "Join the line",
    robots: { index: false, follow: false },
  };
}

export default async function QueuePage({ params }: Props) {
  const { slug } = await params;
  const shop = await getQueueShop(slug);

  if (!shop) {
    // Printed QR codes outlive shop names — a retired slug redirects rather
    // than 404s. See src/lib/shop-slug.ts.
    const current = await resolveSlugAlias(slug);
    if (current) redirect(`/q/${current}`);
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto max-w-lg px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary">
              <Scissors className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight">
                {shop.name}
              </h1>
              <p className="text-sm text-muted-foreground">Walk-in line</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-lg px-4 py-8">
        <div className="mb-6 grid grid-cols-2 gap-3">
          <Stat
            icon={<Clock className="h-4 w-4" />}
            label="Current wait"
            value={shop.currentWaitLabel.replace(/^About /, "")}
          />
          <Stat
            icon={<Users className="h-4 w-4" />}
            label="In line"
            value={
              shop.peopleWaiting === 0
                ? "Nobody"
                : `${shop.peopleWaiting} ${shop.peopleWaiting === 1 ? "person" : "people"}`
            }
          />
        </div>

        {!shop.open && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
            The shop looks closed today. You can still join, but you may want to
            call first.
          </div>
        )}

        <JoinQueueForm shop={shop} />
      </main>

      <footer className="container mx-auto max-w-lg space-y-3 px-4 pb-10 text-center">
        {/* A2P 10DLC disclosure — see the twin in /book/[slug]/page.tsx. */}
        <p className="text-xs leading-relaxed text-muted-foreground">
          By joining the line you agree to receive text messages about your
          place in the queue from {shop.name} at the number you provide.
          Message frequency varies. Message and data rates may apply. Reply
          STOP to opt out or HELP for help.
        </p>
        <p className="text-xs text-muted-foreground">
          <a href="/privacy" className="underline underline-offset-2">
            Privacy Policy
          </a>
          {" · "}
          <a href="/terms" className="underline underline-offset-2">
            Terms
          </a>
          {" · "}
          <a href="/support" className="underline underline-offset-2">
            Help
          </a>
        </p>
        <PoweredByCut />
      </footer>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
