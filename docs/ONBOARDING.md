# Onboarding

## Signup flow

1. `/signup` — create Supabase Auth user + Prisma `User` (`barbershopId: null`)
2. Email verification → `/auth/callback` (also used for magic link / Google OAuth)
3. If user has no membership → `/onboarding`
4. If user already has a shop → `/dashboard`

Also supported:

- Email/password on `/login`
- Magic link (Supabase OTP email)
- Google OAuth button (fails gracefully if Google provider is not enabled in Supabase)

## Shop creation (`/onboarding`)

Fields:

| Field | Required |
|-------|----------|
| Barbershop name | Yes |
| Timezone | Yes (default `America/Los_Angeles`) |
| Address | Optional |
| Business phone | Optional |
| First barber name | Optional |
| Starting services | At least one (Haircut, Beard trim, Lineup, Custom) |

On submit (`completeOnboarding`):

1. Creates `Barbershop` with slug
2. Creates OWNER `BarbershopMembership`
3. Sets active shop cookie + `User.barbershopId`
4. Creates default business hours
5. Creates selected starting services
6. Creates owner barber profile
7. Starts a **14-day Starter trial** (`plan=STARTER`, `subscriptionStatus=TRIALING`)
8. Redirects to `/dashboard`

## Membership & roles

| Role | Access |
|------|--------|
| OWNER | Full shop + billing + phone + team invites |
| BARBER | Own appointments, limited ops |
| RECEPTIONIST | Appointments/clients/services, no billing |

A user can belong to many shops via `BarbershopMembership`.

## Active shop

Cookie: `cut_active_barbershop_id`

Resolution order in `getCurrentUser()`:

1. Cookie (if membership exists)
2. `User.barbershopId`
3. First membership

Shop switcher in sidebar/header updates cookie + `User.barbershopId` and refreshes data.

## Empty / gate states

- No auth → `/login`
- Auth, no shop → `/onboarding`
- Auth + shop, no active subscription (non-Dev) → `/pricing`
- Already onboarded visiting `/onboarding` → `/dashboard`
