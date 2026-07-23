# Production checklist

## Environment

```bash
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=...
DIRECT_URL=...

TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
# Optional exact webhook URL for signature validation:
# TWILIO_WEBHOOK_URL=https://your-domain.com/api/twilio/voice

STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
STRIPE_STARTER_PRICE_ID=...
STRIPE_PRO_PRICE_ID=...
STRIPE_AI_RECEPTIONIST_PRICE_ID=...

CRON_SECRET=...   # required — cron fails closed without it
```

Do **not** set `ALLOW_DEV_SHOP_FALLBACK=true` in production.

## Deploy

1. Push schema: `npx prisma db push` (or migrate)
2. Deploy to Vercel (or equivalent HTTPS host)
3. Set all env vars in the host dashboard
4. Confirm `NEXT_PUBLIC_APP_URL` matches the live domain

## Twilio

1. Phone number Voice webhook → `POST {APP_URL}/api/twilio/voice`
2. Process callback uses `{APP_URL}/api/twilio/voice/process`
3. Connect shop Twilio number in Settings → AI Phone (AI plan required)
4. Call the number — greeting uses shop name
5. Confirm invalid signatures are rejected (prod)

## Stripe

1. Create Starter / Pro / AI Receptionist prices (live mode for prod)
2. Webhook endpoint → `{APP_URL}/api/billing/webhook`
3. Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`
4. Test checkout + portal + cancel

## Supabase

1. Enable email auth
2. Optional: Google OAuth provider + redirect `{APP_URL}/auth/callback`
3. Site URL + redirect allowlist match production

## Cron

1. Schedule `GET /api/cron/reminders` with `Authorization: Bearer $CRON_SECRET`
2. Verify unauthorized calls return 401/503

## Smoke test

- [ ] Signup → onboarding → dashboard (Starter trial)
- [ ] Shop switcher (if multi-shop) refreshes data without flash of wrong shop
- [ ] Calendar create appointment → toast + appears
- [ ] Settings save → toast
- [ ] Billing page loads; non-owner redirected
- [ ] Unpaid shop AI Phone locked
- [ ] Paid AI shop can connect Twilio
- [ ] Dev local phone flow still works when testing locally

## Security

See [SECURITY.md](./SECURITY.md).
