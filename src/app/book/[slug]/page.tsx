import { PoweredByCut } from "@/components/shared/powered-by-cut";
import { resolveSlugAlias } from "@/lib/shop-slug";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  getPublicShop,
  getDepositConfirmation,
} from "@/actions/public-booking";
import { BookingWizard } from "@/components/booking/booking-wizard";
import { Scissors, MapPin, Phone, Check } from "lucide-react";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ deposit?: string; appointment?: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const shop = await getPublicShop(slug);
  if (!shop) return { title: "Book an appointment" };
  return {
    title: `Book at ${shop.name}`,
    description: `Book your next appointment at ${shop.name} online in seconds.`,
    openGraph: {
      title: `Book at ${shop.name}`,
      description: `Book your next appointment at ${shop.name} online in seconds.`,
    },
  };
}

export default async function PublicBookingPage({
  params,
  searchParams,
}: Props) {
  const { slug } = await params;
  const { deposit, appointment: appointmentId } = await searchParams;
  const shop = await getPublicShop(slug);

  if (!shop) {
    // The shop may have been renamed since this link was shared — on a QR
    // sticker, in an Instagram bio, or in a confirmation text already sent.
    // Retired slugs redirect rather than 404.
    const current = await resolveSlugAlias(slug);
    if (current) redirect(`/book/${current}`);
    notFound();
  }

  // Returning from Stripe Checkout after paying a deposit.
  const paid =
    deposit === "success" && appointmentId
      ? await getDepositConfirmation(appointmentId, shop.id)
      : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto max-w-2xl px-4 py-8">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 shrink-0 rounded-xl bg-primary flex items-center justify-center">
              <Scissors className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight truncate">
                {shop.name}
              </h1>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {shop.address && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {shop.address}
                  </span>
                )}
                {shop.phone && (
                  <a
                    href={`tel:${shop.phone}`}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {shop.phone}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-8">
        {paid ? (
          <div className="rounded-2xl border bg-card p-8 text-center shadow-card">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Check className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {paid.paid ? "You're booked!" : "Payment received"}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {paid.paid
                ? "Your deposit is paid and your appointment is confirmed."
                : "We're finalizing your booking — you'll get a text shortly."}
            </p>
            <div className="mt-6 space-y-2 rounded-xl border bg-background p-4 text-left text-sm">
              <Row label="Service" value={paid.serviceName} />
              <Row label="Barber" value={paid.barberName} />
              <Row label="When" value={paid.when} />
              <Row label="Name" value={paid.clientName} />
            </div>
            <a
              href={`/book/${shop.slug}`}
              className="mt-6 inline-block text-sm underline underline-offset-4"
            >
              Book another appointment
            </a>
          </div>
        ) : (
          <>
            {deposit === "canceled" && (
              <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
                Payment was cancelled, so that time wasn&apos;t held. You can
                pick a time and try again.
              </div>
            )}
            <BookingWizard shop={shop} />
          </>
        )}
      </main>

      <footer className="container mx-auto max-w-2xl space-y-3 px-4 pb-10 text-center">
        {/* A2P 10DLC disclosure, repeated here on purpose.
            The opt-in checkbox lives next to the phone field, but that is step
            4 of the wizard. A carrier reviewer opening this link sees only step
            1, finds no consent language, and rejects the campaign for an
            unverifiable call to action — which is exactly what happened. This
            copy is visible on every step, including the first thing they see.
            It describes the programme; the tick is what consents. */}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Tick the box when you book or join the waitlist and {shop.name} will
          send appointment text messages to the number you provide. Opting in is
          not required to book. Message frequency varies. Message and data rates
          may apply. Reply STOP to opt out or HELP for help.
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
