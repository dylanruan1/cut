# A2P 10DLC — resubmission answers

The campaign has been rejected four times, all for website reasons rather than
Twilio configuration:

1. Terms and Conditions issues
2. Call to Action (CTA) could not be verified
3. Compliant privacy policy could not be verified
4. Call to Action (CTA) could not be verified — again
5. Error 30925 — opt-in was not affirmative: no dedicated, unchecked SMS
   consent checkbox. The reviewer cited `/book/dev` and `/q/dev` by URL, so
   the home-page link from fix #4 worked: they reached the forms this time.

## What was fixed in code

- **CTA is now visible at every point a number is collected**: the booking form
  (`booking-wizard.tsx`), the walk-in queue join form (`join-queue-form.tsx`),
  and the cancellation waitlist (`waitlist-prompt.tsx`). Previously there was
  no consent language anywhere, so reviewers had nothing to verify.
- **Privacy policy** now carries the carrier-standard sharing statement close
  to verbatim. The old wording was a stricter paraphrase, which reviewers
  pattern-match as missing.
- **The marketing home page now links to a live booking page** (hero and
  footer, `DEMO_SHOP_SLUG` in `src/lib/shop-constants.ts`). This is what caused
  rejection #4 and probably #2: the consent language was live, but every
  booking page sits behind a shop slug, nothing on `cutchair.com` linked to
  one, and the consent answer submitted to Twilio used a `{shop}` placeholder.
  A reviewer opening the registered website found only "Set up your shop" and
  "Sign in" — no page collecting a mobile number, therefore no verifiable CTA.

Both policy pages are served from `cutchair.com` itself. Linking to a
third-party-hosted policy is a common rejection reason.

- **Consent is now an affirmative act, not a notice.** Every form that takes a
  mobile number renders `SmsConsentCheckbox`, unchecked, and `sendSms` refuses
  to send without a matching `SmsConsent` row. This is what rejection #5 asked
  for. Two constraints on anyone touching it:
  - **It must never be pre-ticked.** That is the literal text of error 30925.
  - **It must never be required to submit.** The registered opt-in answer says
    consent is not a condition of purchase; a required box would contradict
    what is filed with the carriers. Booking works with it untouched — the
    customer simply gets no texts.

**The demo booking link must stay working.** If the `dev` shop is deleted or
its slug changes, the home page links 404 and the next review reads that as a
missing CTA.

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

Copied from the actual send templates, not paraphrased. Reviewers compare
these against real traffic, so keep them in sync if the templates change:
`buildBookingConfirmationSms` / `buildReminderSms` / `buildCancellationSms` in
`src/lib/twilio.ts`, the queue notice in `src/actions/queue.ts`, and the
waitlist offer in `src/lib/waitlist.ts`.

1. Booking confirmation:

   ```
   Hi Marcus! Your appointment at Fades Barbershop is confirmed.

   Haircut with barber Andre
   Saturday, September 12 at 3:00 PM

   View or cancel: https://cutchair.com/appointment/ab12cd34

   Reply STOP to opt out.
   ```

2. `Hi Marcus! Reminder: Your Beard Trim at Fades Barbershop is tomorrow at 10:30 AM. See you soon! Need to cancel? https://cutchair.com/appointment/ab12cd34`
3. `Hi Marcus, your Haircut appointment at Fades Barbershop on Saturday, September 12 at 3:00 PM has been cancelled. Call us to rebook.`
4. `Fades Barbershop: you're up next! Head back in — we'll be ready in about 8 minutes.`
5. `Hi Marcus, a spot just opened at Fades Barbershop — Saturday at 3:00 PM. First to book gets it: https://cutchair.com/book/fades`

One further template exists and is not listed above for lack of sample slots —
the deposit link sent after a phone booking (`src/lib/ai-receptionist/booking.ts`):
`Fades Barbershop: to lock in your Haircut on Saturday at 3:00 PM, pay the $10 deposit here within 30 minutes: <link>`

### Message content flags

- Embedded links: **Yes** (appointment management and booking links)
- Phone numbers: **No**
- Direct lending: **No**
- Age-gated content: **No**

### URLs

- Privacy policy: `https://cutchair.com/privacy`
- Terms of service: `https://cutchair.com/terms`

### How end users consent

Give reviewers a URL they can open. Never submit a `{shop}` placeholder here —
that is what failed twice.

> End users provide their mobile number directly on a barbershop's public
> booking page. A working example is linked from our home page at
> https://cutchair.com and can be opened directly at
> https://cutchair.com/book/dev. Numbers are also collected on the walk-in
> queue page, https://cutchair.com/q/dev, and when a customer asks to be
> notified if a cancelled slot opens. Immediately beneath the mobile number
> field is a dedicated SMS consent checkbox, unchecked by default, which the
> customer must tick themselves. Its label reads: "Yes, text me. I agree to
> receive appointment text messages — confirmations, reminders, and changes —
> from {shop name} at the number I provide. Message frequency varies. Message
> and data rates may apply. Reply STOP to opt out or HELP for help," with links
> to the Privacy Policy and Terms. The checkbox is not required to complete a
> booking: consent is not a condition of purchase, and a customer who leaves it
> unticked is booked normally and receives no text messages. Nothing is sent
> unless that box was ticked — the consent is stored per shop with its
> timestamp and source, and message sending is blocked without it. Consent
> applies only to that barbershop. No numbers are purchased, rented, or shared
> from third parties.

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

Deploy first — the reviewer looks at the live site, not the branch.

1. Open `https://cutchair.com` in a private window and confirm the "See a demo
   booking" link appears and lands on a working booking page. This is the step
   that has failed twice.
2. Open `https://cutchair.com/privacy` and `https://cutchair.com/terms` in that
   same private window and confirm both load without a login.
3. On the demo booking page, confirm the consent paragraph is visible under the
   mobile number field.
4. Check the business profile address and website match what's registered.
5. Confirm the deploy actually landed before submitting — compare the page's
   `sentry-release` meta tag against `git rev-parse HEAD`:

   ```bash
   curl -s https://cutchair.com | grep -o 'sentry-release=[a-f0-9]*'
   ```

## Known gap

`STOP` and `HELP` replies are handled by Twilio's built-in Advanced Opt-Out
rather than by application code. The inbound handler exists at
`/api/twilio/sms` and understands both keywords, but Twilio will not let the
number's messaging webhook be configured until A2P registration completes — so
it cannot be wired up until this campaign is approved. Point the number at it
immediately afterwards.

Until then an opt-out is invisible to the app: Cut keeps attempting sends that
Twilio silently blocks. An `smsOptedOut` flag on Client, set by that handler,
would stop the product trying.
