# A2P 10DLC — resubmission answers

The campaign was rejected three times, all for website reasons rather than
Twilio configuration:

1. Terms and Conditions issues
2. Call to Action (CTA) could not be verified
3. Compliant privacy policy could not be verified

## What was fixed in code

- **CTA is now visible at every point a number is collected**: the booking form
  (`booking-wizard.tsx`), the walk-in queue join form (`join-queue-form.tsx`),
  and the cancellation waitlist (`waitlist-prompt.tsx`). Previously there was
  no consent language anywhere, so reviewers had nothing to verify. This was
  the main cause of rejection #2.
- **Privacy policy** now carries the carrier-standard sharing statement close
  to verbatim. The old wording was a stricter paraphrase, which reviewers
  pattern-match as missing.

Both policy pages are served from `cutchair.com` itself. Linking to a
third-party-hosted policy is a common rejection reason.

---

## Copy these into the resubmission form

### Campaign description

> Cut is appointment scheduling software for barbershops. Messages are sent to
> customers of a barbershop who provide their mobile number when booking an
> appointment online, joining the shop's walk-in queue, or asking to be
> notified if a cancelled slot opens. Messages are transactional: booking
> confirmations, appointment reminders, notice of a cancellation or
> reschedule, walk-in queue position updates, and deposit payment links. No
> marketing or promotional messages are sent.

### Sample messages

1. `Hi Marcus! Your Haircut at Fades Barbershop is tomorrow at 10:30 AM. See you soon! Need to cancel? https://cutchair.com/appointment/ab12cd34`
2. `Hi Marcus! Reminder: Your Beard Trim at Fades Barbershop is today at 3:00 PM. See you soon! Need to cancel? https://cutchair.com/appointment/ab12cd34`
3. `Hi Marcus, your Haircut appointment at Fades Barbershop on Saturday at 3:00 PM has been cancelled. Call us to rebook.`
4. `Hi Marcus, you're next in line at Fades Barbershop. Head back now. https://cutchair.com/q/status/ab12cd34`
5. `Hi Marcus, a spot just opened at Fades Barbershop - Saturday at 3:00 PM. First to book gets it: https://cutchair.com/book/fades`

### Message content flags

- Embedded links: **Yes** (appointment management and booking links)
- Phone numbers: **No**
- Direct lending: **No**
- Age-gated content: **No**

### URLs

- Privacy policy: `https://cutchair.com/privacy`
- Terms of service: `https://cutchair.com/terms`

### How end users consent

> End users provide their mobile number directly on the barbershop's public
> booking page at https://cutchair.com/book/{shop}, on the walk-in queue page
> at https://cutchair.com/q/{shop}, or when asking to be notified about a
> cancellation. Immediately beneath the mobile number field, the form states:
> "By booking, you agree to receive appointment text messages from {shop name}
> at this number - confirmations, reminders, and changes. Message frequency
> varies. Message and data rates may apply. Reply STOP to opt out or HELP for
> help," with links to the Privacy Policy and Terms. Consent is collected per
> booking and is not a condition of purchase. No numbers are purchased,
> rented, or shared from third parties.

### Opt-in keywords

Leave blank — consent is collected on the web form, not by texting a keyword.
Inventing keywords here that don't exist in the product is itself a rejection
reason.

### Opt-in message

> Thanks for booking with {shop name}. You'll receive appointment
> confirmations and reminders at this number. Msg frequency varies. Msg & data
> rates may apply. Reply STOP to opt out, HELP for help.

### Opt-out keywords

`STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT`

### Opt-out message

> You have been unsubscribed from {shop name} appointment messages. You will
> not receive further texts. Reply START to resubscribe.

### Help keywords

`HELP, INFO`

### Help message

> {shop name} appointment notifications. For help visit
> https://cutchair.com/support or reply STOP to unsubscribe. Msg & data rates
> may apply.

---

## Before resubmitting

1. Deploy, then open `https://cutchair.com/privacy` and `https://cutchair.com/terms`
   in a private window and confirm both load without a login.
2. Open a booking page and confirm the consent paragraph is visible under the
   mobile number field. Reviewers look at this page.
3. Check the business profile address and website match what's registered.

## Known gap

`STOP` and `HELP` replies are currently handled by Twilio's built-in Advanced
Opt-Out, not by application code — Cut has no inbound SMS webhook. That is
compliant, but it means an opt-out is invisible to the app: Cut will keep
attempting sends that Twilio silently blocks. Worth adding an inbound handler
and an `smsOptedOut` flag on Client so the product stops trying.
