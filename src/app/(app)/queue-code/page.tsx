import QRCode from "qrcode";
import { requireActiveSubscription } from "@/lib/subscription-guards";
import prisma from "@/lib/db";
import { PrintableQueueCode } from "@/components/queue/printable-queue-code";

export const dynamic = "force-dynamic";

/**
 * Printable QR sign for the shop door/counter.
 *
 * This is the walk-in queue's only real-world entry point — without something
 * a customer can physically scan, the whole feature is unreachable.
 */
export default async function QueueCodePage() {
  const { user } = await requireActiveSubscription();

  const shop = await prisma.barbershop.findUniqueOrThrow({
    where: { id: user.barbershopId },
    select: { name: true, slug: true },
  });

  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const url = `${base}/q/${shop.slug}`;

  // Rendered server-side as an SVG so it prints crisply at any size.
  const qrSvg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 512,
  });

  return (
    <PrintableQueueCode shopName={shop.name} url={url} qrSvg={qrSvg} />
  );
}
