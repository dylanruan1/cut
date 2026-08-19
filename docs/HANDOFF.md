# Cut — Project Handoff

Snapshot for continuing work in another AI assistant (ChatGPT, Cursor agent, etc.).
Last updated: August 7, 2026.

---

## 1. What Cut is

A production SaaS for barbershops: appointment scheduling, an AI phone
receptionist that books calls automatically, a public self-serve booking page,
subscription billing, and deposits/no-show protection.

Two customer types:
- **Barbershops** — pay a monthly subscription to use Cut.
- **Their customers** — book appointments (by phone or online). They never log in.

---

## 2. Stack & where things live

```
Next.js 15 (App Router) · TypeScript · Tailwind · shadcn-style UI
Prisma → PostgreSQL (Supabase)      Supabase Auth
Twilio Voice + SMS                  Anthropic Claude (AI receptionist brain)
Stripe (subscriptions) + Stripe Connect (deposits)
Sentry (errors) · Vercel (hosting)
```

Local path: `~/Projects/cut`
Branch: `cursor/ai-receptionist-booking-timezone`
Repo: `https://github.com/dylanruan1/cut.git`
Live: `https://4u5y3i5befigbaeighasbfghiasbifsbifg.vercel.app`

### Key files

| Area | Files |
|---|---|
| AI receptionist brain | `src/lib/ai-receptionist/claude.ts` (LLM + tools), `index.ts` (provider switch), `parser.ts` (legacy regex fallback) |
| Booking engine | `src/lib/ai-receptionist/availability.ts` (slot rules), `booking.ts` (writes appointments) |
| Phone webhooks | `src/app/api/twilio/voice/route.ts`, `voice/process/route.ts` |
| Public booking | `src/actions/public-booking.ts`, `src/app/book/[slug]/page.tsx`, `src/components/booking/booking-wizard.tsx` |
| Payments | `src/lib/stripe.ts`, `src/lib/stripe-connect.ts`, `src/actions/connect.ts`, `src/app/api/billing/webhook/route.ts` |
| Schema | `prisma/schema.prisma` |

### Useful commands

```bash
npm run dev                      # local dev
npm run build                    # production build (run before pushing)
npx vitest run                   # unit tests
npx prisma generate              # after ANY schema.prisma change
npm run test-receptionist        # chat with the AI receptionist in terminal
npm run stress-test-receptionist # 14 adversarial AI-vs-AI call scenarios
npm run simulate-call en|es      # simulate a real phone call against production
```

---

## 3. Current state

### Working and verified
- **AI phone receptionist** — Claude-powered, books real appointments. 14/14 on the
  adversarial stress test. Bilingual English/Spanish (press 2 or just speak Spanish).
- **Public booking page** — `/book/[slug]` (e.g. `/book/dev`). Verified in production.
- **Subscription billing** — Stripe checkout, webhooks, customer portal, paywall.
- **Deposits / no-show protection** — Stripe Connect destination charges; money goes
  to the shop, not to Cut. Verified end to end with a real test payment.
- **Availability correctness** — barber working hours, holidays, service eligibility,
  past-time guard. 15 unit tests in `src/lib/ai-receptionist/availability.test.ts`.
- **Double-booking prevention** — Postgres exclusion constraint (see §5).
- **Sentry**, **privacy/terms pages**, **deploys on push**.

### Blocked (not a code problem)
- **All SMS** — Twilio A2P 10DLC campaign is **In review**. Carriers block every
  message until approved (error 30034). Confirmations, reminders, and the phone
  deposit link are all correct in code but undeliverable until then.
  Check status: Twilio Console → Trust Hub → Registrations → A2P Campaigns.

### Known broken / missing
1. **Google OAuth** — `redirect_uri_mismatch`, never resolved. Email/password works.
2. **No customer self-serve cancel/reschedule** — they must call the shop.
3. **Notifications bell** — "coming soon" tooltip, not implemented.
4. **No reviews / retention texts** — planned, not built.
5. **No barber time-off / vacation UI** — schema supports working hours; no editor.
6. **Analytics page** — exists but never verified to compute correct numbers.
7. **Vercel Hobby** — cron limited to once daily, so reminders can't fire on a
   15-minute cadence. Either upgrade or use an external cron (cron-job.org) to hit
   `/api/cron/reminders` with the `CRON_SECRET` bearer token.
8. **7 duplicate Vercel projects** from a naming mishap. The live one is
   `4u5y3i5befigbaeighasbfghiasbifsbifgasdlf`. Others are junk but harmless.
9. **Stripe Accounts v1** — enabled via a compatibility toggle. Stripe is pushing
   v2; migration would be contained to `src/lib/stripe-connect.ts`.

### Security debt
- API keys (Anthropic, Twilio, GitHub) appeared in screenshots during development
  and should be rotated.
- Supabase DB password is weak and was visible in `.env.local` screenshots.

---

## 4. Environment variables

All are set in `.env.local` (local) and Vercel (production).

```
NEXT_PUBLIC_APP_URL              NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY    SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL                     DIRECT_URL
TWILIO_ACCOUNT_SID               TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER              TWILIO_MESSAGING_SERVICE_SID
ANTHROPIC_API_KEY                AI_RECEPTIONIST_PROVIDER=claude
STRIPE_SECRET_KEY                NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET            STRIPE_*_PRICE_ID (starter/pro/ai_receptionist)
SENTRY_AUTH_TOKEN                CRON_SECRET
PLATFORM_FEE_BPS                 (optional; unset = 0% cut of deposits)
```

**Gotchas that cost hours before:**
- Env var changes only apply to a **new** Vercel build. Force one with
  `git commit --allow-empty -m "Redeploy" && git push`.
- `stripe listen` must be scoped to the sandbox or it watches the wrong account:
  ```bash
  stripe listen --api-key "$(grep '^STRIPE_SECRET_KEY=' .env.local | cut -d= -f2)" \
    --forward-to localhost:3000/api/billing/webhook
  ```
  It prints a **different** `whsec_` than the default listener — use that one.
- Stripe price IDs are case-sensitive (`price_1Twaj…` ≠ `price_1TWaj…`).
- Vercel blocks deploys when the git committer email isn't linked to the GitHub
  account. Use `dylanruan5@gmail.com`.

---

## 5. Things that will bite you

**Double-booking constraint is NOT in Prisma.** It's raw SQL applied directly to
the database. Prisma can't express exclusion constraints, so it will not be
recreated automatically on a fresh database. Re-apply with:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_no_double_booking
  EXCLUDE USING gist (
    "barberId" WITH =,
    tsrange("startTime", "endTime") WITH &&
  ) WHERE (status <> 'CANCELLED');
```

Violations surface as SQLSTATE `23P01`; handled in `src/lib/booking-conflict.ts`.

**Deposit holds.** A deposit booking is created as `PENDING` with
`holdExpiresAt` set 30 minutes out. Three layers release abandoned holds:
the availability query ignores lapsed holds, the `checkout.session.expired`
webhook cancels them, and the reminders cron sweeps stragglers. Don't remove one
without understanding the others.

**Money flow.** Deposits are *destination charges* — funds settle into the
barbershop's connected Stripe account, never Cut's. Do not change this to charge
the platform account; that's a money-transmission problem, not just a code choice.

**Never trust the client** in `src/actions/public-booking.ts` — it's the only
unauthenticated surface. Availability is always recomputed server-side at write
time, deposits are re-read from the DB, and everything is rate limited per IP.

---

## 6. Good next tasks

Roughly easiest → hardest. Anything here is safe to hand to another assistant.

**Small / mechanical**
1. Rotate the exposed API keys and the Supabase DB password.
2. Delete the 7 duplicate Vercel projects (keep `4u5y3i5…asdlf`).
3. Set up a free external cron (cron-job.org) to hit `/api/cron/reminders` every
   15 minutes with header `Authorization: Bearer $CRON_SECRET`.
4. Add a barber time-off / working-hours editor on the Team page (schema already
   supports it — `WorkingHour` model, and availability already enforces it).
5. Verify the Analytics page math against real appointment data.

**Medium**
6. **Customer self-serve cancel/reschedule.** Add a tokenized link
   (`/appointment/[token]`) included in confirmation texts. Biggest support-load
   reducer for shops. Needs a token field on Appointment.
7. **Fix Google OAuth.** Create a fresh Google Cloud OAuth client; add ONLY
   `https://itsmifeefsxjudefrtke.supabase.co/auth/v1/callback` as the redirect URI
   and `http://localhost:3000` as a JS origin; paste the new client ID/secret into
   Supabase → Auth → Providers → Google. Test in incognito.
8. **Reviews + retention texts.** After a COMPLETED appointment, text a Google
   review link. Text clients whose `lastVisitAt` is 4+ weeks old. Extend the
   existing cron. (Blocked on A2P approval.)
9. **Notifications bell** — the `Notification` model is already populated by
   bookings; just needs a dropdown UI.

**Larger / architectural — probably worth waiting for a stronger model**
10. **Premium voice.** Current TTS is neural Amazon Polly (decent, still
    synthetic). Genuinely human-sounding voice + better Spanish recognition means
    moving the audio layer to Vapi/Retell with ElevenLabs voices. All booking
    logic is reusable; only the telephony layer changes.
11. **Stripe Accounts v2 migration** (see §3.9).
12. **Multi-shop onboarding polish** — the signup → create shop → connect payouts
    → first booking path has never been walked end to end by a real new user.

---

## 7. How to prompt another assistant

Paste this file, then be specific about scope. Useful framing:

> I'm working on Cut, a barbershop SaaS. Here's the handoff doc [paste].
> I want to work on [task N]. Before changing anything, read the relevant files
> and tell me your plan. Don't touch payments, availability, or the double-booking
> constraint without explaining the blast radius first.

**Rules worth enforcing with any assistant:**
- Run `npm run build` and `npx vitest run` before claiming something works.
- Run `npx prisma generate` after any `schema.prisma` edit.
- Never commit `.env.local`, and never print secrets into chat.
- Keep changes to one concern per commit.
