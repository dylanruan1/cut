# Cut — Backlog

Everything identified as outstanding, in one place. Last updated: August 19, 2026.

Legend: **P0** = blocks a real shop using Cut · **P1** = visibly unfinished ·
**P2** = growth / revenue · **P3** = nice to have

---

## Blocked on external approval

| # | Item | Notes |
|---|------|-------|
| 1 | **Twilio A2P 10DLC campaign** | **Everything SMS is dead until this clears.** Booking confirmations, reminders, queue "you're up" texts, deposit payment links, cancellation links. All built, all correct, all silently blocked (error 30034). Check: Twilio Console → Trust Hub → Registrations → A2P Campaigns. |

---

## P0 — Blocks a real shop

| # | Item | Why it matters |
|---|------|----------------|
| 2 | **Walk new-shop onboarding end to end** | signup → create shop → services → barbers → hours → payouts → first booking has *never* been tested by a genuinely new user. Highest-risk untested path, and it's the first thing a real shop touches. |
| 3 | ~~**Verify analytics math**~~ *(fixed)* | Revenue required status COMPLETED, which nothing ever sets, so it read $0 forever. Now counts appointments that happened and weren't cancelled, plus paid walk-ins, with month boundaries in the shop's timezone rather than the server's. |
| 4 | ~~**Reminder cron can't run on time**~~ *(fixed)* | The job asked for appointments in a ±15min window exactly 24h/2h out, so a once-daily run texted almost nobody. Now uses wide windows (12–36h and 0–12h) with wording derived from the real time remaining, so one daily run covers everyone. Running it more often only makes it more precise. Optional upgrade: a free external cron (cron-job.org) hitting `/api/cron/reminders` with the `CRON_SECRET` bearer token every 15 min for closer same-day timing. |
| 5 | **Rotate exposed credentials** | Anthropic, Twilio, GitHub keys appeared in screenshots. Supabase DB password is weak and was visible. |

---

## P1 — Visibly unfinished

| # | Item | Notes |
|---|------|-------|
| 6 | ~~**Self-serve reschedule**~~ *(done)* | Built on `/appointment/[token]`; the deposit moves with the booking. |
| 7 | ~~**Notifications bell**~~ *(done)* | Wired to the existing `Notification` rows — 51 had accumulated unread. Server-rendered badge count, list loads on open, opening marks read (scoped by shop id). |
| 8 | **Google OAuth** | `redirect_uri_mismatch`, unresolved since the original handoff. Signup is email/password only. |
| 9 | **Barber time-off / working-hours editor** | Schema supports it and availability already enforces it — there's just no UI to set it. |
| 10 | **Mobile polish** | Barbers will use this on a phone. Only the customer-facing pages were designed mobile-first. |
| 11 | **Empty states, loading skeletons, error copy** | Inconsistent across the app. Dashboard is the least-considered screen. |

---

## P2 — Revenue and growth

| # | Item | Notes |
|---|------|-------|
| 12 | **Set real pricing** | $29 / $59 / $99 are placeholder defaults invented in `setup-stripe-products.ts`. Needs a deliberate decision — the whole business model rests on it. |
| 13 | **Turn on platform fee** | `PLATFORM_FEE_BPS` is 0, so Cut earns nothing on payments. In vertical SaaS this usually out-earns subscriptions. |
| 14 | **"Calls recovered" metric** | Track missed vs answered calls and show the shop what the AI receptionist recovered *in dollars*. This is the entire sales pitch, and the call data already exists. |
| 15 | **Reviews + retention texts** | Auto-ask for a Google review after a completed appointment; win-back texts for clients 4+ weeks absent. Grows the shop's revenue, which is what keeps them paying. (Blocked on A2P.) |
| 16 | **Cut history with photos** | "#2 fade, scissors on top." Highest-lock-in feature not yet built — the thing a barber would mourn losing. |
| 17 | **Standing / recurring appointments** | "Every 3 weeks, Thursday 5pm." Barbershop clients are extremely habitual; guarantees baseline revenue. |
| 18 | **Per-barber booking links** | `/book/dev/mike`. Barbers promote themselves on Instagram → free distribution, and barbers resist switching, not just owners. |
| 19 | **Cancellation waitlist auto-fill** | When someone cancels, text people who wanted that slot. Turns a lost slot into a filled one. |
| 20 | **Commission / booth-rent tracking** | Owners track this in spreadsheets they hate. Deep in their finances = very hard to switch away from. |
| 21 | **Phone number porting** | Strongest lock-in available: leaving Cut would mean losing the number customers have called for years. |

---

## P3 — Nice to have

| # | Item |
|---|------|
| 22 | Shop-facing queue screen (read-only; deliberately not required) |
| 23 | Loyalty / digital punch card (also motivates cash check-out) |
| 24 | Station QR codes ("I'm in this chair now") |
| 25 | Client flags for repeat no-shows → auto-require deposit |
| 26 | Daily close-out summary texted to the owner |
| 27 | Product / retail sales |
| 28 | Premium voice — move audio to Vapi/Retell + ElevenLabs (current neural Polly is the ceiling for Twilio TTS) |
| 29 | Stripe Accounts v2 migration (currently on a v1 compatibility toggle) |
| 30 | Delete 7 duplicate Vercel projects (keep `4u5y3i5…asdlf`) |
| 31 | iPhone home-screen widget (needs a native/PWA companion) |

---

## Suggested order

1. **#1** — chase A2P; a lot of finished work is dead behind it
2. **#2** — walk new-shop onboarding; most likely place something is quietly broken
3. **#6** — reschedule; most-requested customer action still missing
4. **#3, #7, #8** — the visible "unfinished" tells
5. **#12, #13, #14** — the business model
