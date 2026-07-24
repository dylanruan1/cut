# Billing (Stripe)

Cut uses Stripe Checkout + Customer Portal + webhooks to manage shop subscriptions.

## Environment variables

Add these to `.env.local` (never commit secrets):

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_AI_RECEPTIONIST_PRICE_ID=price_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

If any of these are missing:

- `/pricing` and `/settings/billing` still render
- Checkout / portal routes return a helpful `503` error JSON
- Local **Dev** shop continues to bypass paywalls for testing

## Create products in Stripe test mode

1. Open Stripe Dashboard → **Test mode**
2. Products → Add product for each plan:
   - **Starter** — recurring monthly
   - **Pro** — recurring monthly
   - **AI Receptionist** — recurring monthly
3. Copy each Price ID into the env vars above
4. Optional: enable a 14-day trial on the Price, or pass `trialDays` from checkout (Cut supports both)

## Webhook configuration

Endpoint:

```text
POST {NEXT_PUBLIC_APP_URL}/api/billing/webhook
```

Events to subscribe:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Local testing with Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

Use the printed `whsec_...` as `STRIPE_WEBHOOK_SECRET`.

### Gotcha: Stripe Sandbox vs main account

If `STRIPE_SECRET_KEY` comes from a Stripe **Sandbox** (its own `acct_...`), a plain
`stripe login` authenticates the CLI to your **main** account instead, so
`stripe listen` never receives the sandbox's events (webhooks silently 400/never
fire) and `stripe prices list` shows nothing. Scope the listener to the sandbox by
passing the app's key explicitly:

```bash
stripe listen --api-key "$(grep '^STRIPE_SECRET_KEY=' .env.local | cut -d= -f2)" \
  --forward-to localhost:3000/api/billing/webhook
```

This prints a **different** `whsec_...` than the default listener — use that one as
`STRIPE_WEBHOOK_SECRET`, or webhook signature checks fail with `400`.

### Gotcha: price IDs are case-sensitive

`price_1Twaj...` and `price_1TWaj...` are different objects. A wrong-case ID gives
`No such price` / `resource_missing` on checkout. Run `npm run setup-stripe-products`
to print the exact IDs rather than transcribing them by hand.

## What the webhook updates

On the matched `Barbershop` (via `metadata.barbershopId`):

- `plan`
- `subscriptionStatus`
- `stripeCustomerId`
- `stripeSubscriptionId`
- `stripePriceId`
- `trialEndsAt`
- `currentPeriodEnd`

## Checkout rules

`POST /api/billing/create-checkout-session`

- Requires logged-in user
- Requires active shop
- Requires OWNER role
- Validates plan ∈ `STARTER | PRO | AI_RECEPTIONIST`
- Creates/reuses Stripe customer
- Attaches metadata: `barbershopId`, `userId`, `plan`

## Customer portal

`POST /api/billing/create-portal-session` — OWNER only, requires existing `stripeCustomerId`.

## Local vs production

| Environment | Behavior |
|-------------|----------|
| Development + shop named **Dev** | Paywall bypass for app + AI phone |
| Development + Test Shop 2 / other shops | Normal plan rules (NONE locks AI) |
| Production | Strict plan enforcement; unpaid AI calls get inactive voice message |

## Production checklist

- [ ] Live Stripe keys (not test) in production env
- [ ] Live price IDs for all three plans
- [ ] Webhook endpoint pointed at production URL
- [ ] `NEXT_PUBLIC_APP_URL` is the production HTTPS URL
- [ ] Customer portal branding configured in Stripe
- [ ] Test checkout + cancel + past_due flows in staging first
