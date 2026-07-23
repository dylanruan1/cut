# Security

Cut is a multi-tenant SaaS. Every barbershop’s data must stay isolated.

## Auth rules

- Unauthenticated users cannot access app pages (middleware → `/login`).
- Authenticated users with **no membership** → `/onboarding`.
- Active shop is resolved from cookie `cut_active_barbershop_id` + memberships.
- Post-login redirects are sanitized (`sanitizeInternalRedirect`) — no open redirects.

## Role rules

| Role | Can do |
|------|--------|
| OWNER | Billing, phone setup, shop settings, team invites, all appointments |
| RECEPTIONIST | Appointments, clients, services view — **not** billing/phone/owner settings |
| BARBER | Own appointments only (when role-gated) |

Owner checks use `canManageShop(role)` on server actions and billing APIs.

## Shop isolation rules

- Every Prisma query for shop data must include `barbershopId` from `requireShopUser()`.
- Never trust client-supplied shop IDs.
- When updating appointments, `serviceId` / `barberId` must be re-verified against the active shop.
- Shop switch revalidates dashboard, calendar, clients, services, team, analytics, settings, billing.

## Webhook security

### Stripe

- `POST /api/billing/webhook` verifies `stripe-signature` with `STRIPE_WEBHOOK_SECRET`.
- Invalid signatures → `400`.
- Subscription fields update only after verified events.

### Twilio

- Voice routes use `assertTwilioWebhook` (`src/lib/twilio-webhook-auth.ts`).
- Production: require `TWILIO_AUTH_TOKEN` + valid `X-Twilio-Signature`.
- Development: bypass allowed with console warning if token/signature missing.
- Optional `TWILIO_WEBHOOK_URL` for exact signature URL (must match Twilio console).
- Rate-limited per CallSid.

### Cron

- `GET /api/cron/reminders` **requires** `CRON_SECRET` (fail closed).
- Missing/placeholder secret → `503`.

## Rate limiting

In-memory limits (per server instance) on:

- Sign-in / sign-up (per email)
- Billing checkout (per user)
- Twilio webhooks (per CallSid)

For multi-instance production, consider Redis-backed limits later.

## Secrets

- Never commit `.env` / `.env.local`.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `TWILIO_AUTH_TOKEN`, or webhook secrets to the client.
- Only `NEXT_PUBLIC_*` keys may ship to the browser.

## XSS

- No `dangerouslySetInnerHTML` in the app.
- User text is React-escaped; `sanitizeInput` strips `<>` on write paths (names/notes).

## Manual security checklist

- [ ] Attempt shop A session with shop B appointment ID → not found
- [ ] Barber cannot open `/settings/billing`
- [ ] Invalid Stripe signature rejected
- [ ] Production Twilio request without signature rejected
- [ ] Cron without bearer token rejected
