import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicShop } from "@/actions/public-booking";
import { BookingWizard } from "@/components/booking/booking-wizard";
import { Scissors, MapPin, Phone } from "lucide-react";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
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

export default async function PublicBookingPage({ params }: Props) {
  const { slug } = await params;
  const shop = await getPublicShop(slug);
  if (!shop) notFound();

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
        <BookingWizard shop={shop} />
      </main>

      <footer className="container mx-auto max-w-2xl px-4 pb-10 text-center">
        <p className="text-xs text-muted-foreground">
          Powered by <span className="font-medium">Cut.</span>
        </p>
      </footer>
    </div>
  );
}
