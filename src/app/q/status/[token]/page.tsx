import { PoweredByCut } from "@/components/shared/powered-by-cut";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getQueueStatus } from "@/actions/queue";
import { QueueStatusCard } from "@/components/queue/queue-status-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your spot in line",
  robots: { index: false, follow: false },
};

export default async function QueueStatusPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const status = await getQueueStatus(token);
  if (!status) notFound();

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-lg px-4 py-10">
        <QueueStatusCard status={status} />
      </main>
      <footer className="container mx-auto max-w-lg px-4 pb-10 text-center">
        <PoweredByCut />
      </footer>
    </div>
  );
}
