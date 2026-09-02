import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Scissors, MapPin, Phone } from "lucide-react";
import { getPublicShop } from "@/actions/public-booking";
import { resolveSlugAlias } from "@/lib/shop-slug";
import { BookingWizard } from "@/components/booking/booking-wizard";
import { PoweredByCut } from "@/components/shared/powered-by-cut";

/**
 * A barber's personal booking link: /book/{shop}/{barber}.
 *
 * Same booking flow as the shop page, but locked to one barber — their clients
 * came for them, so the barber picker would only be noise. The point is
 * distribution: a barber will promote their own link in their own bio, which
 * the shop's link never gets them to do.
 */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; barber: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, barber } = await params;
  const shop = await getPublicShop(slug);
  const found = shop?.barbers.find((b) => b.slug === barber);
  if (!shop || !found) return { title: "Book an appointment" };

  return {
    title: `Book with ${found.name} at ${shop.name}`,
    description: `Book your next appointment with ${found.name} at ${shop.name}.`,
    openGraph: {
      title: `Book with ${found.name}`,
      description: `Book your next appointment with ${found.name} at ${shop.name}.`,
    },
  };
}

export default async function BarberBookingPage({ params }: Props) {
  const { slug, barber: barberSlug } = await params;
  const shop = await getPublicShop(slug);

  if (!shop) {
    const current = await resolveSlugAlias(slug);
    if (current) redirect(`/book/${current}/${barberSlug}`);
    notFound();
  }

  const barber = shop.barbers.find((b) => b.slug === barberSlug);
  // A barber who left, was deactivated, or never got a handle: fall back to
  // the shop's own page rather than a dead end. Their old link still converts.
  if (!barber) redirect(`/book/${shop.slug}`);

  // Hand the wizard a shop containing only this barber. Availability, service
  // eligibility and the booking action all key off the barber list, so
  // narrowing it here is enough — no special-casing further down.
  const lockedShop = { ...shop, barbers: [barber] };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto max-w-2xl px-4 py-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-primary">
              <Scissors className="h-6 w-6 text-primary-foreground" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                {barber.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                at{" "}
                <Link
                  href={`/book/${shop.slug}`}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  {shop.name}
                </Link>
              </p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {shop.address && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    {shop.address}
                  </span>
                )}
                {shop.phone && (
                  <a
                    href={`tel:${shop.phone}`}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    {shop.phone}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main id="main" className="container mx-auto max-w-2xl px-4 py-8">
        <BookingWizard shop={lockedShop} />
      </main>

      <footer className="container mx-auto max-w-2xl space-y-3 px-4 pb-10 text-center">
        {/* A2P 10DLC disclosure — same requirement as the shop page. */}
        <p className="text-xs leading-relaxed text-muted-foreground">
          By booking or joining the waitlist you agree to receive appointment
          text messages from {shop.name} at the number you provide. Message
          frequency varies. Message and data rates may apply. Reply STOP to opt
          out or HELP for help.
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
