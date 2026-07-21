# Paywall

## Plans

| Plan | Includes |
|------|----------|
| `NONE` | No app access (except local Dev bypass) |
| `STARTER` | Dashboard, calendar, clients, services, basic settings |
| `PRO` | Everything in Starter + team + analytics |
| `AI_RECEPTIONIST` | Everything in Pro + AI phone setup + Twilio booking |

## Subscription statuses that grant access

- `TRIALING` (and `trialEndsAt` in the future, if set)
- `ACTIVE`

Blocked / upgrade:

- `NONE`, `PAST_DUE`, `CANCELED`, `INCOMPLETE`

## Feature matrix

| Feature | Starter | Pro | AI Receptionist |
|---------|---------|-----|-----------------|
| Dashboard / calendar / clients / services | ✓ | ✓ | ✓ |
| Team | | ✓ | ✓ |
| Analytics | | ✓ | ✓ |
| Billing settings (OWNER) | ✓ | ✓ | ✓ |
| AI Phone setup | | | ✓ |
| Twilio AI booking | | | ✓ |

## Helpers

`src/lib/subscription.ts`

- `getShopSubscription` / snapshot fields
- `canUseCalendar` / `canUseBasicApp`
- `canUseTeam`
- `canUseAnalytics`
- `canUseAiReceptionist`
- `isLocalDevShopBypass` — shop name **Dev** in development only

Guards in `src/lib/subscription-guards.ts`:

- `requireActiveSubscription()` → redirects to `/pricing`
- `requireAiReceptionistPlan()` → redirects to AI upgrade

## Twilio AI lock rules

After resolving shop by Twilio `To`:

1. If development **and** shop name is `Dev` → allow
2. Else if plan is `AI_RECEPTIONIST` and status is `ACTIVE`/`TRIALING` → allow
3. Else speak: *"Sorry, this barbershop's AI receptionist is not active right now."* and do not book

## UI locks

- Team / Analytics pages show `FeatureLocked` upgrade card
- Settings → AI Phone tab shows locked premium card without AI plan
- `updateShopSettings` rejects Twilio field changes without AI access

## Test Shop 2

Created with `plan=NONE` (no trial). AI Phone stays locked unless upgraded. Dev bypass does **not** apply to Test Shop 2.
