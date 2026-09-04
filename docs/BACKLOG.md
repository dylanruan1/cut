# Cut — Backlog

Everything identified as outstanding, in one place. Last updated: September 3, 2026.

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
| 5 | **Rotate exposed credentials** | Rotated once. **Anthropic key and Twilio auth token were shown in a screenshot again on Sept 3 and need rotating again.** Those two bill directly and are the ones scrapers use. |
| 5b | **Stripe is still in test mode** | `STRIPE_SECRET_KEY` is `sk_test_`. No real money can be taken. Going live needs live keys in Vercel *and* a second `setup-stripe-products` run — test and live prices are separate objects. |
| 5c | **Vercel Hobby + Supabase Free** | Hobby's terms don't permit commercial use, and Supabase Free pauses after a week idle with no daily backups. Both need paid tiers before a real shop depends on this. ~$45/mo. |

---

## P1 — Visibly unfinished

| # | Item | Notes |
|---|------|-------|
| 6 | ~~**Self-serve reschedule**~~ *(done)* | Built on `/appointment/[token]`; the deposit moves with the booking. |
| 7 | ~~**Notifications bell**~~ *(done)* | Wired to the existing `Notification` rows — 51 had accumulated unread. Server-rendered badge count, list loads on open, opening marks read (scoped by shop id). |
| 8 | ~~**Google OAuth**~~ *(done)* | Four stacked causes: a typo in Google's redirect URI, a wrong `NEXT_PUBLIC_APP_URL`, `/auth/callback` missing from middleware's public routes, and two owners racing for the same PKCE verifier. The route handler now owns the flow start to finish. |
| 9 | ~~**Barber time-off / working-hours editor**~~ *(done)* | Week is replaced wholesale in a transaction — orphaned rows silently blocked bookings. |
| 10 | ~~**Mobile polish**~~ *(done)* | Inputs were 14px, which made iOS Safari zoom on focus and never zoom back; dialogs had no height cap so Save was unreachable on a phone; calendar opened on a 700px Week grid. |
| 11 | **Empty states and dashboard copy** | Error boundaries and the booking-page skeleton are now in (Sept 3). Still uneven: the dashboard is the least-considered screen and several empty states just say "No results". |

---

## P2 — Revenue and growth

| # | Item | Notes |
|---|------|-------|
| 12 | ~~**Set real pricing**~~ *(done)* | $39 / $99 / $249, plus $12 per barber above 6 and a $199 founding rate for the first 25 shops. Costed from verified Twilio and Anthropic rates: ~$0.19 per AI call, break-even near 1,150 calls/month, ~75% gross margin at a typical shop. |
| 13 | ~~**Turn on platform fee**~~ *(decided: no)* | `PLATFORM_FEE_BPS` stays 0 deliberately. Competitors charge $1–3 per booking; taking nothing is the sharpest differentiator we have and is now stated in dollars on the pricing page. |
| 14 | ~~**"Calls recovered" metric**~~ *(done)* | Conversion returns null rather than 0 when there are no calls, so an empty month reads as "no data" instead of "we failed". |
| 14b | **Usage ceiling has never fired in production** | Warn at 300 AI calls, hard stop at 900. Both are untested against real traffic — worth confirming the counting window behaves once a shop has a full billing cycle of history. |
| 15 | **Reviews + retention texts** | Auto-ask for a Google review after a completed appointment; win-back texts for clients 4+ weeks absent. Grows the shop's revenue, which is what keeps them paying. (Blocked on A2P.) |
| 16 | **Cut history with photos** | "#2 fade, scissors on top." Highest-lock-in feature not yet built — the thing a barber would mourn losing. |
| 17 | **Standing / recurring appointments** | "Every 3 weeks, Thursday 5pm." Barbershop clients are extremely habitual; guarantees baseline revenue. |
| 18 | ~~**Per-barber booking links**~~ *(done)* | `/book/lincoln-barbers/mike`. Slugs regenerate on shop rename with an alias table so old links redirect instead of 404ing. |
| 19 | ~~**Cancellation waitlist auto-fill**~~ *(done)* | Only marks NOTIFIED when the text actually sends, so a Twilio failure doesn't silently burn someone's place. |
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

Everything that blocks revenue is now an account action, not a coding task.

1. **#1 — A2P.** Still the single biggest blocker. Every text the product sends
   is dead until it clears: confirmations, both reminders, queue "you're up",
   deposit links, cancellation links, waitlist offers. `docs/A2P_RESUBMISSION.md`
   has paste-ready answers and the consent language is live on the site.
2. **Twilio inbound SMS webhook** → `https://cutchair.com/api/twilio/sms`. The
   route exists and handles STOP/HELP; nothing is pointed at it, so replies go
   nowhere. Carriers check this.
3. **#5 — rotate the Anthropic key and Twilio auth token** (screenshotted again).
4. **#5b, #5c — Stripe live keys, Vercel Pro, Supabase Pro.** ~$45/mo of
   infrastructure plus live Stripe keys is the gap between "demo" and "can take
   a customer's money".
5. **#2 — walk new-shop onboarding as a genuinely new user**, on a phone.
6. **#11, #16, #17** — polish and the lock-in features, in that order.

## Cost model (Sept 3, 2026)

Per AI-answered call ≈ **$0.19**: Twilio speech recognition $0.14 (7 `<Gather>`
turns at $0.02), inbound voice $0.026, Claude Haiku $0.026. Speech-to-text is
5× the AI bill — that is the lever if costs ever need cutting, not the model.

Ten shops on the AI plan: ~$614/mo cost against $2,490 revenue. Fixed platform
costs are only ~$66 of that and barely grow, so nearly all cost is variable and
attached to shops already paying. Growth cannot put this underwater.
