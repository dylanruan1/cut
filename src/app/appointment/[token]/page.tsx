import { PoweredByCut } from "@/components/shared/powered-by-cut";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getManagedAppointment } from "@/actions/manage-booking";
import { ManageBooking } from "@/components/booking/manage-booking";
import { Scissors, Phone } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your appointment",
  robots: { index: false, follow: false },
};

export default async function ManageAppointmentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const appointment = await getManagedAppointment(token);
  if (!appointment) notFound();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto max-w-xl px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary">
              <Scissors className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight">
                {appointment.shopName}
              </h1>
              {appointment.shopPhone && (
                <a
                  href={`tel:${appointment.shopPhone}`}
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {appointment.shopPhone}
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-xl px-4 py-8">
        <ManageBooking appointment={appointment} />
      </main>

      <footer className="container mx-auto max-w-xl space-y-2 px-4 pb-10 text-center">
        <p className="text-xs text-muted-foreground">
          <a href="/support" className="underline underline-offset-2">
            Need help?
          </a>
        </p>
        <PoweredByCut />
      </footer>
    </div>
  );
}
