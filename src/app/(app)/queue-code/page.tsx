import { requireActiveSubscription } from "@/lib/subscription-guards";
import prisma from "@/lib/db";
import { PrintableQueueCode } from "@/components/queue/printable-queue-code";

export const dynamic = "force-dynamic";

/**
 * Printable QR sign for the shop door/counter.
 *
 * This is the walk-in queue's only real-world entry point — without something
 * a customer can physically scan, the whole feature is unreachable.
 *
 * The link and its QR are built in the browser, from the origin the owner is
 * actually on. See PrintableQueueCode for why that matters here more than
 * anywhere else in the product.
 */
export default async function QueueCodePage() {
  const { user } = await requireActiveSubscription();

  const shop = await prisma.barbershop.findUniqueOrThrow({
    where: { id: user.barbershopId },
    select: { name: true, slug: true },
  });

  return <PrintableQueueCode shopName={shop.name} slug={shop.slug} />;
}
