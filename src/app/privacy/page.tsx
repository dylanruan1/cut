import Link from "next/link";
import type { Metadata } from "next";
import { Scissors } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy — Cut",
  description:
    "How Cut collects, uses, and protects personal information, including SMS messaging consent.",
};

const UPDATED = "August 7, 2026";

export default function PrivacyPage() {
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
        <h1 className="text-4xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: {UPDATED}
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-foreground/90">
          <Section title="Who we are">
            <p>
              Cut (&quot;Cut,&quot; &quot;we,&quot; &quot;us&quot;) provides
              appointment scheduling software for barbershops. This policy
              explains what information we collect, how we use it, and the
              choices available to you.
            </p>
            <p>
              We serve two groups: <strong>barbershops</strong> that use Cut to
              run their business, and <strong>customers</strong> of those
              barbershops who book appointments.
            </p>
          </Section>

          <Section title="Information we collect">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Booking information.</strong> When you book an
                appointment — online, by phone, or through shop staff — we
                collect your name, mobile phone number, optional email address,
                the service requested, and any notes you provide.
              </li>
              <li>
                <strong>Account information.</strong> For barbershop owners and
                staff: name, email address, and business details such as shop
                name, address, hours, and services.
              </li>
              <li>
                <strong>Call information.</strong> When you call a shop that
                uses our AI receptionist, we process the transcript of the call
                to understand your request and complete your booking.
              </li>
              <li>
                <strong>Technical information.</strong> Standard log data such
                as IP address and browser type, used for security and to prevent
                abuse.
              </li>
            </ul>
          </Section>

          <Section title="SMS messaging">
            <p>
              We send text messages related to appointments — booking
              confirmations, reminders before your appointment, and notices if
              an appointment is changed or cancelled.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Consent.</strong> You provide your mobile number when
                booking an appointment and are informed you will receive
                appointment-related messages. Consent is collected per booking.
              </li>
              <li>
                <strong>Opting out.</strong> Reply <strong>STOP</strong> to any
                message to stop receiving texts. Reply <strong>HELP</strong> for
                help.
              </li>
              <li>
                <strong>Frequency and cost.</strong> Message frequency varies
                based on your appointments. Message and data rates may apply.
              </li>
              <li>
                <strong>Sharing.</strong> No mobile information will be shared
                with third parties or affiliates for marketing or promotional
                purposes. Information sharing to subcontractors in support
                services, such as customer service, is permitted. All other use
                case categories exclude text messaging originator opt-in data
                and consent; this information will not be shared with any third
                parties.
              </li>
            </ul>
            {/* Carrier reviewers look for this statement close to verbatim.
                A paraphrase — even a stricter one — reads as missing and gets
                the A2P campaign rejected, which silently kills every text the
                product sends. Do not "tidy" this wording. */}
            <p className="rounded-xl border bg-muted/40 p-4">
              <strong>Mobile information sharing:</strong> No mobile information
              will be shared with third parties or affiliates for marketing or
              promotional purposes. Text messaging originator opt-in data and
              consent will not be shared with any third parties.
            </p>
          </Section>

          <Section title="How we use information">
            <ul className="list-disc space-y-2 pl-5">
              <li>To schedule, confirm, change, and remind you of appointments</li>
              <li>To let barbershops manage their calendar, clients, and staff</li>
              <li>To operate, secure, and improve the service</li>
              <li>To comply with legal obligations</li>
            </ul>
            <p>
              We do not sell personal information, and we do not use customer
              booking data for advertising.
            </p>
          </Section>

          <Section title="Who we share information with">
            <p>
              We share information only as needed to run the service:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>The barbershop you booked with</strong>, so they can
                serve you.
              </li>
              <li>
                <strong>Service providers</strong> who operate parts of our
                infrastructure — including hosting, database, telephony and
                messaging, payment processing, and error monitoring — under
                agreements that restrict their use of the data.
              </li>
              <li>
                <strong>Legal authorities</strong> where required by law.
              </li>
            </ul>
          </Section>

          <Section title="Data retention">
            <p>
              We keep appointment records for as long as the barbershop
              maintains an active account, so shops retain their business
              history. Call session data used by the AI receptionist is
              short-lived and expires automatically.
            </p>
          </Section>

          <Section title="Your choices">
            <ul className="list-disc space-y-2 pl-5">
              <li>Opt out of texts at any time by replying STOP</li>
              <li>
                Request access to, correction of, or deletion of your personal
                information by contacting us
              </li>
              <li>
                Contact the barbershop directly to cancel or change an
                appointment
              </li>
            </ul>
          </Section>

          <Section title="Security">
            <p>
              We use industry-standard measures including encrypted connections
              and access controls. No system is perfectly secure, but we work to
              protect your information and to limit access to it.
            </p>
          </Section>

          <Section title="Children">
            <p>
              Cut is intended for use by businesses and adult customers. We do
              not knowingly collect personal information directly from children
              under 13. A parent or guardian may book on a minor&apos;s behalf.
            </p>
          </Section>

          <Section title="Changes to this policy">
            <p>
              We may update this policy from time to time. Material changes will
              be reflected by the &quot;last updated&quot; date above.
            </p>
          </Section>

          <Section title="Contact us">
            <p>
              Questions about this policy or your information? Email{" "}
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
          <Link href="/terms" className="underline underline-offset-4">
            Terms of Service
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
