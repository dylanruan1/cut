import Link from "next/link";
import type { Metadata } from "next";
import { PLAN_DISPLAY } from "@/lib/subscription";

export const metadata: Metadata = {
  title: "Cut. — the phone answers itself",
  description:
    "Booking, walk-in queue, deposits, and an AI that answers your shop phone and books the appointment. Built for barbershops.",
};

/**
 * Marketing home page.
 *
 * Hard rules, square corners, oversized type — closer to a barbershop's own
 * signage than a SaaS template. Built on the design tokens rather than literal
 * black and white so the page inverts correctly in dark mode; the tokens
 * themselves are monochrome (see globals.css).
 */
export default function HomePage() {
  const ai = PLAN_DISPLAY.AI_RECEPTIONIST;
  const starter = PLAN_DISPLAY.STARTER;

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-foreground selection:text-background">
      <header className="sticky top-0 z-50 border-b-2 border-foreground bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link
            href="/"
            className="text-2xl font-black uppercase tracking-tighter"
          >
            Cut.
          </Link>
          <nav className="flex items-center gap-6 text-sm font-bold uppercase tracking-wide">
            <Link href="/pricing" className="hover:underline">
              Pricing
            </Link>
            <Link href="/login" className="hover:underline">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="bg-foreground px-4 py-2 text-background hover:opacity-80"
            >
              Start
            </Link>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* Hero. Type does the work — no card, no gradient, no illustration. */}
        <section className="border-b-2 border-foreground">
          <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
            <p className="text-xs font-bold uppercase tracking-[0.2em]">
              For barbershops
            </p>
            <h1 className="mt-6 text-[13vw] font-black uppercase leading-[0.85] tracking-tighter sm:text-[11vw] lg:text-[8.5rem]">
              The phone
              <br />
              answers
              <br />
              itself.
            </h1>
            <p className="mt-10 max-w-xl text-lg font-medium leading-snug">
              You&apos;re mid-fade when the shop phone rings. You can&apos;t
              stop. They don&apos;t leave a message — they call the shop down
              the street.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-6">
              <Link
                href="/signup"
                className="bg-foreground px-8 py-4 text-base font-bold uppercase tracking-wide text-background hover:opacity-80"
              >
                Set up your shop
              </Link>
              <Link
                href="/pricing"
                className="text-base font-bold uppercase tracking-wide underline underline-offset-4"
              >
                Pricing
              </Link>
            </div>
          </div>
        </section>

        {/* The call, as a transcript. Square, ruled, monospaced — reads like a
            printed record rather than a chat bubble mockup. */}
        <section className="border-b-2 border-foreground">
          <div className="mx-auto grid max-w-6xl grid-cols-1 lg:grid-cols-2">
            <div className="border-foreground px-5 py-16 lg:border-r-2 lg:py-20">
              <h2 className="text-4xl font-black uppercase leading-none tracking-tighter sm:text-5xl">
                Tuesday
                <br />
                2:14 pm
              </h2>
              <p className="mt-6 max-w-sm text-base font-medium leading-snug">
                A real call, handled while both your hands were busy.
              </p>
            </div>
            <div className="px-5 py-16 font-mono text-sm lg:py-20">
              <dl className="space-y-6">
                <Line who="Caller">
                  Do you have anything Saturday afternoon?
                </Line>
                <Line who="Cut">
                  I&apos;ve got 3:00 or 4:30 with Mike. Which works?
                </Line>
                <Line who="Caller">3 o&apos;clock.</Line>
                <Line who="Cut">
                  Booked. You&apos;ll get a text to confirm.
                </Line>
              </dl>
              <p className="mt-10 border-t-2 border-foreground pt-4 text-xs font-bold uppercase tracking-wide">
                You were cutting hair the whole time
              </p>
            </div>
          </div>
        </section>

        {/* Benefits as a numbered ledger, not a card grid. */}
        <section className="border-b-2 border-foreground">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="max-w-2xl text-4xl font-black uppercase leading-[0.9] tracking-tighter sm:text-6xl">
              What happens
              <br />
              while you work
            </h2>

            <div className="mt-16 border-t-2 border-foreground">
              <Item n="01" title="The phone gets answered">
                Day, night, Sunday, mid-haircut. Books, reschedules and cancels
                by voice, in English or Spanish, on your existing number.
              </Item>
              <Item n="02" title="Walk-ins stop crowding the door">
                They scan a code in the window, join the line from the
                pavement, and get a text when they&apos;re nearly up.
              </Item>
              <Item n="03" title="No-shows cost them, not you">
                Take a deposit on booking. Straight to your bank, not ours.
                Cancel late and they forfeit it.
              </Item>
              <Item n="04" title="Cancellations get refilled">
                When someone drops out, everyone waiting on that day gets a
                text. The chair fills instead of sitting empty.
              </Item>
              <Item n="05" title="Every barber keeps their own book">
                Own calendar, own hours, own clients. You see the whole shop.
              </Item>
              <Item n="06" title="You keep your card payments">
                We take nothing from what your customers pay. You pay
                Stripe&apos;s rate and nothing on top.
              </Item>
            </div>
          </div>
        </section>

        {/* Price. Big, plain, unavoidable. */}
        <section className="bg-foreground text-background">
          <div className="mx-auto grid max-w-6xl grid-cols-1 lg:grid-cols-2">
            <div className="border-background px-5 py-20 lg:border-r-2">
              <h2 className="text-4xl font-black uppercase leading-[0.9] tracking-tighter sm:text-5xl">
                A missed call
                <br />
                is a lost
                <br />
                haircut
              </h2>
              <p className="mt-8 max-w-md text-base font-medium leading-snug">
                At a $40 cut, the AI receptionist pays for itself at about six
                recovered calls a month. Most shops miss more than that in a
                week.
              </p>
              <Link
                href="/signup"
                className="mt-10 inline-block bg-background px-8 py-4 text-base font-bold uppercase tracking-wide text-foreground hover:opacity-85"
              >
                Set up your shop
              </Link>
            </div>

            <div className="px-5 py-20">
              <p className="text-xs font-bold uppercase tracking-[0.2em]">
                {ai.name}
              </p>
              <p className="nums mt-4 text-8xl font-black leading-none tracking-tighter">
                ${ai.monthlyPrice}
              </p>
              <p className="mt-2 text-sm font-bold uppercase tracking-wide">
                per month
              </p>
              <p className="mt-10 border-t-2 border-background pt-6 text-sm font-medium leading-snug">
                Booking, walk-in queue and deposits start at $
                {starter.monthlyPrice} a month.
              </p>
              <Link
                href="/pricing"
                className="mt-4 inline-block text-sm font-bold uppercase tracking-wide underline underline-offset-4"
              >
                Compare plans
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t-2 border-foreground">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 text-xs font-bold uppercase tracking-wide sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Cut.</p>
          <nav className="flex flex-wrap items-center gap-6">
            <Link href="/pricing" className="hover:underline">
              Pricing
            </Link>
            <Link href="/support" className="hover:underline">
              Support
            </Link>
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="hover:underline">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Line({ who, children }: { who: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {who}
      </dt>
      <dd className="mt-1 leading-snug">{children}</dd>
    </div>
  );
}

function Item({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[3rem_1fr] gap-x-5 border-b-2 border-foreground py-8 sm:grid-cols-[5rem_1fr] md:grid-cols-[6rem_18rem_1fr] md:gap-x-8">
      <p className="nums text-sm font-black tracking-tight">{n}</p>
      <h3 className="text-xl font-black uppercase leading-none tracking-tight sm:text-2xl">
        {title}
      </h3>
      <p className="col-start-2 mt-3 max-w-md text-sm font-medium leading-snug md:col-start-3 md:mt-0">
        {children}
      </p>
    </div>
  );
}
