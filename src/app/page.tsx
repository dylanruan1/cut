import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Scissors, ArrowRight } from "lucide-react";
import { PLAN_DISPLAY } from "@/lib/subscription";

export const metadata: Metadata = {
  title: "Cut. — the phone answers itself",
  description:
    "Booking, walk-in queue, deposits, and an AI that answers your shop phone and books the appointment. Built for barbershops.",
};

/**
 * Marketing home page.
 *
 * Written against the specific failure of the previous version, which read as
 * generated: three equal call-to-action buttons in the hero, four identical
 * feature cards in a grid, everything centre-aligned, and copy that described
 * the implementation ("Twilio Voice integration") rather than what a barber
 * gets. It also ended after the features — no price, no second ask.
 *
 * The rules here: one primary action, left-aligned type, benefits in the
 * shop's own language, and a real number on the page. No invented statistics
 * and no fake testimonials — there are no customers yet, and claiming
 * otherwise is both dishonest and the fastest way to lose a barber's trust.
 */
export default function HomePage() {
  const ai = PLAN_DISPLAY.AI_RECEPTIONIST;
  const starter = PLAN_DISPLAY.STARTER;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-glass">
        <div className="container mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary">
              <Scissors className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
            </span>
            <span className="text-xl font-semibold tracking-tight">Cut.</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/pricing">Pricing</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/signup">Start free</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* Hero. Left-aligned and asymmetric on purpose — a centred stack of
            three buttons is the single clearest sign nobody decided what the
            page is for. */}
        <section className="container mx-auto max-w-5xl px-4 pb-16 pt-20 md:pt-28">
          <div className="grid gap-12 lg:grid-cols-[1.15fr_1fr] lg:items-center">
            <div>
              <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                For barbershops
              </p>
              <h1 className="mt-4 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
                Your hands are busy.
                <br />
                Let the phone answer itself.
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
                You&apos;re mid-fade when the shop phone rings. You can&apos;t
                stop. They don&apos;t leave a message — they call the shop down
                the street. Cut picks up, books them in, and texts them the
                details.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-4">
                <Button size="lg" asChild>
                  <Link href="/signup">
                    Set up your shop
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Link
                  href="/pricing"
                  className="text-sm font-medium underline underline-offset-4 hover:text-muted-foreground"
                >
                  See pricing
                </Link>
              </div>

              <p className="mt-4 text-sm text-muted-foreground">
                Free while you set up. From ${starter.monthlyPrice}/month after.
              </p>
            </div>

            {/* A concrete artefact beats an illustration: this is what the AI
                actually does, in the shop's own words. */}
            <div className="rounded-2xl border bg-card p-6 shadow-card">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Tuesday, 2:14pm
              </p>
              <dl className="mt-4 space-y-4 text-sm leading-relaxed">
                <div>
                  <dt className="text-muted-foreground">Caller</dt>
                  <dd>&ldquo;Do you have anything Saturday afternoon?&rdquo;</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Cut</dt>
                  <dd>
                    &ldquo;I&apos;ve got 3:00 or 4:30 with Mike. Which works?&rdquo;
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Caller</dt>
                  <dd>&ldquo;3 o&apos;clock.&rdquo;</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Cut</dt>
                  <dd>
                    &ldquo;Booked. You&apos;ll get a text to confirm.&rdquo;
                  </dd>
                </div>
              </dl>
              <p className="mt-5 border-t pt-4 text-xs text-muted-foreground">
                You were cutting hair the whole time.
              </p>
            </div>
          </div>
        </section>

        {/* Benefits, not features. Asymmetric two-column rather than four
            identical cards, and written as what happens in the shop. */}
        <section className="border-t bg-muted/20">
          <div className="container mx-auto max-w-5xl px-4 py-20">
            <h2 className="max-w-xl text-balance text-3xl font-semibold tracking-tight">
              Everything that happens when you&apos;re not at the desk
            </h2>

            <div className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2">
              <Benefit title="The phone gets answered">
                Day, night, Sunday, mid-haircut. It books, reschedules and
                cancels by voice, in English or Spanish, on the number your
                customers already have.
              </Benefit>
              <Benefit title="Walk-ins stop crowding the door">
                They scan a code on the window, join the line from the
                pavement, and get a text when they&apos;re nearly up.
              </Benefit>
              <Benefit title="No-shows cost them, not you">
                Take a deposit on booking. It goes straight to your bank, not
                ours. Cancel late and they forfeit it.
              </Benefit>
              <Benefit title="Cancellations get refilled">
                When someone drops out, everyone waiting on that day gets a
                text. The chair fills instead of sitting empty.
              </Benefit>
              <Benefit title="Your barbers keep their own books">
                Each one has their own calendar, hours and clients. You see the
                whole shop.
              </Benefit>
              <Benefit title="You keep your card payments">
                We don&apos;t take a cut of what your customers pay. You pay
                Stripe&apos;s rate and nothing on top.
              </Benefit>
            </div>
          </div>
        </section>

        {/* Price on the page. Making someone start a checkout to discover the
            cost reads as something to hide. */}
        <section className="container mx-auto max-w-5xl px-4 py-20">
          <div className="rounded-2xl border bg-card p-8 shadow-card sm:p-12">
            <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
              <div>
                <h2 className="text-balance text-3xl font-semibold tracking-tight">
                  A missed call is a lost haircut
                </h2>
                <p className="mt-4 max-w-lg text-muted-foreground">
                  At a $40 cut, the AI receptionist pays for itself at about six
                  recovered calls a month. Most shops miss more than that in a
                  week.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <Button size="lg" asChild>
                    <Link href="/signup">
                      Set up your shop
                      <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                  <Link
                    href="/pricing"
                    className="text-sm font-medium underline underline-offset-4"
                  >
                    Compare plans
                  </Link>
                </div>
              </div>

              <div className="rounded-xl border bg-background p-6">
                <p className="text-sm text-muted-foreground">{ai.name}</p>
                <p className="nums mt-1 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight">
                    ${ai.monthlyPrice}
                  </span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  Booking, walk-in queue and deposits start at $
                  {starter.monthlyPrice}/month.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="container mx-auto flex max-w-5xl flex-col gap-4 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Cut.</p>
          <nav className="flex flex-wrap items-center gap-5">
            <Link href="/pricing" className="hover:text-foreground">
              Pricing
            </Link>
            <Link href="/support" className="hover:text-foreground">
              Support
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Benefit({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {/* Sentence case, no icon. A row of identical icon-in-rounded-square
          tiles is the most recognisable generated-UI pattern there is. */}
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </p>
    </div>
  );
}
