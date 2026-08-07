import Link from "next/link";
import type { Metadata } from "next";
import { Scissors } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service — Cut",
  description:
    "The terms that govern use of Cut's barbershop scheduling software and messaging.",
};

const UPDATED = "August 7, 2026";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-16 max-w-3xl items-center px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary">
              <Scissors className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold">Cut.</span>
          </Link>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-4xl font-semibold tracking-tight">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: {UPDATED}
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-foreground/90">
          <Section title="Agreement">
            <p>
              These terms govern your use of Cut, appointment scheduling
              software for barbershops. By creating an account or booking an
              appointment through Cut, you agree to these terms.
            </p>
          </Section>

          <Section title="The service">
            <p>
              Cut provides scheduling tools for barbershops, including a
              calendar, client records, an online booking page, an AI phone
              receptionist, and appointment text notifications. Features vary by
              subscription plan.
            </p>
            <p>
              Cut is a software provider. We do not provide barbering services
              and are not responsible for the services performed by any
              barbershop.
            </p>
          </Section>

          <Section title="Accounts">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                You are responsible for keeping your login credentials secure
                and for activity under your account.
              </li>
              <li>
                You must provide accurate business information and keep it
                current.
              </li>
              <li>
                You are responsible for the conduct of staff you invite to your
                shop&apos;s account.
              </li>
            </ul>
          </Section>

          <Section title="Appointments and cancellations">
            <p>
              Appointments are between the customer and the barbershop.
              Cancellation, rescheduling, late, and no-show policies — including
              any deposits — are set by each barbershop. Contact the shop
              directly regarding a specific appointment.
            </p>
          </Section>

          <Section title="Text messages">
            <p>
              Cut sends appointment-related text messages such as confirmations
              and reminders. By providing your mobile number when booking, you
              consent to receive these messages. Message frequency varies and
              message and data rates may apply. Reply <strong>STOP</strong> to
              opt out or <strong>HELP</strong> for help. See our{" "}
              <Link href="/privacy" className="underline underline-offset-4">
                Privacy Policy
              </Link>{" "}
              for details.
            </p>
          </Section>

          <Section title="Subscriptions and billing">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Paid plans are billed in advance on a recurring monthly basis
                through our payment processor.
              </li>
              <li>
                Subscriptions renew automatically until cancelled. You can
                cancel at any time from your billing settings; access continues
                through the end of the paid period.
              </li>
              <li>
                Fees are non-refundable except where required by law. Prices may
                change with advance notice.
              </li>
              <li>
                If payment fails, access to paid features may be suspended.
              </li>
            </ul>
          </Section>

          <Section title="Acceptable use">
            <p>You agree not to:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Use Cut to send unsolicited marketing, spam, or any messages
                that violate telecommunications rules
              </li>
              <li>Upload unlawful content or infringe others&apos; rights</li>
              <li>
                Attempt to breach, disrupt, or reverse engineer the service
              </li>
              <li>Use the service to harass or harm others</li>
            </ul>
            <p>
              We may suspend accounts that violate these terms or create risk
              for the service or other users.
            </p>
          </Section>

          <Section title="Your data">
            <p>
              Barbershops retain ownership of their business and client data.
              You grant us the rights needed to host and process that data to
              operate the service. You are responsible for having a lawful basis
              to collect and text your customers.
            </p>
          </Section>

          <Section title="Availability and disclaimers">
            <p>
              We work to keep Cut reliable, but the service is provided
              &quot;as is&quot; without warranties of any kind. We do not
              guarantee uninterrupted or error-free operation, and phone,
              messaging, and payment features depend on third-party providers.
            </p>
          </Section>

          <Section title="Limitation of liability">
            <p>
              To the maximum extent permitted by law, Cut is not liable for
              indirect, incidental, or consequential damages, including lost
              profits or missed appointments. Our total liability for any claim
              is limited to the amount you paid us in the twelve months before
              the claim.
            </p>
          </Section>

          <Section title="Termination">
            <p>
              You may stop using Cut at any time. We may suspend or terminate
              accounts that violate these terms. On termination, your right to
              use the service ends; you may request an export of your data
              before your account is closed.
            </p>
          </Section>

          <Section title="Changes">
            <p>
              We may update these terms. Continued use after changes take effect
              constitutes acceptance. Material changes will be reflected by the
              &quot;last updated&quot; date above.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions about these terms? Email{" "}
              <a
                className="font-medium underline underline-offset-4"
                href="mailto:dylanruan5@gmail.com"
              >
                dylanruan5@gmail.com
              </a>
              .
            </p>
          </Section>
        </div>

        <div className="mt-12 border-t pt-6 text-sm">
          <Link href="/privacy" className="underline underline-offset-4">
            Privacy Policy
          </Link>
        </div>
      </main>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}
