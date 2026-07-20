# Cut. Architecture

## Overview

Cut. is a multi-tenant barbershop scheduling platform. Each barbershop is an isolated tenant with its own users, barbers, services, clients, and appointments.

```
┌─────────────────────────────────────────────────────────┐
│                      Client (Browser)                    │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│                   Next.js App Router                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │  Pages   │  │  Server  │  │   API    │  │ Middle-│ │
│  │  (RSC)   │  │  Actions │  │  Routes  │  │  ware  │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
└──────┬──────────────┬──────────────┬────────────────────┘
       │              │              │
┌──────▼──────┐ ┌─────▼─────┐ ┌─────▼─────┐
│  Supabase   │ │  Prisma   │ │  Twilio   │
│    Auth     │ │  + PG     │ │ SMS/Voice │
└─────────────┘ └───────────┘ └───────────┘
```

## Authentication Flow

1. User signs up via Supabase Auth (email/password)
2. Server action creates Barbershop, User (OWNER), Barber, default Services, and BusinessHours
3. Supabase session stored in HTTP-only cookies via `@supabase/ssr`
4. Middleware validates session on protected routes
5. `getCurrentUser()` joins Supabase user with Prisma User record for role/shop context

## Multi-Tenancy

- Every data model includes `barbershopId`
- All queries scoped to user's `barbershopId`
- Role-based permissions enforced in server actions via `requireUser()` and permission helpers

## User Roles

| Role | Permissions |
|------|------------|
| **OWNER** | Full access: shop settings, team, services, all schedules, analytics |
| **BARBER** | Personal schedule, shop schedule (view), own appointments |
| **RECEPTIONIST** | Create/move appointments, view schedules (future-ready) |

## Database Schema

### Core Models

- **Barbershop** — Tenant root (name, slug, settings, timezone)
- **User** — Links Supabase auth ID to barbershop + role
- **Barber** — Staff profile (name, photo, hours, services, color)
- **Service** — Service menu (name, duration, price, color)
- **Client** — Customer record (name, phone, email, visit history)
- **Appointment** — Booking (client, barber, service, time, status)

### Supporting Models

- **BusinessHour** — Shop operating hours (per day of week)
- **WorkingHour** — Individual barber availability
- **Holiday** — Shop closures
- **Invitation** — Team member invite tokens
- **Notification** — In-app notifications
- **SmsLog** — SMS delivery audit trail
- **PhoneBookingSession** — Twilio IVR state machine

### Enums

- `UserRole`: OWNER, BARBER, RECEPTIONIST
- `AppointmentStatus`: CONFIRMED, PENDING, COMPLETED, CANCELLED, NO_SHOW
- `DepositStatus`: NONE, PENDING, PAID, REFUNDED

## Phone Booking Architecture

The Twilio Voice integration uses a state machine pattern stored in `PhoneBookingSession`:

```
Customer calls → Menu (1=Book, 2=Reschedule, 3=Cancel)
  → Collect name → phone → barber → day → time
  → Create appointment + send SMS confirmation
```

Each step is a Twilio `<Gather>` webhook to `/api/twilio/voice/handle`. Session state persists in the database by `callSid`.

**AI-ready**: The state machine abstraction allows replacing keypad input with speech recognition or an AI voice agent by swapping the input handler while keeping the same session flow.

## SMS System

| Event | Trigger |
|-------|---------|
| Booking confirmation | Appointment created |
| 24h reminder | Cron job (Vercel, every 15 min) |
| 2h reminder | Cron job |
| Cancellation | Status → CANCELLED |
| Reschedule | Start time changed |
| No-show follow-up | Manual trigger (future) |

SMS logs stored in `SmsLog` for deduplication and audit.

## Calendar

Three view modes sharing a common appointment data layer:

- **Day** — Column per barber, hourly grid, drag-and-drop
- **Week** — 7-day grid with appointment blocks
- **Month** — Calendar grid with appointment dots

Appointments are color-coded by barber. Drag-and-drop updates via server actions.

## Security

- Supabase Auth with email verification
- Middleware route protection
- Server-side validation with Zod schemas
- Role-based authorization in server actions
- Rate limiting utility (in-memory, per-key)
- Input sanitization
- Environment variables for secrets
- Twilio webhook signature validation (available)
- Cron endpoint protected by `CRON_SECRET`

## Deployment

Optimized for Vercel:

- Server Components for data fetching
- Server Actions for mutations
- Edge-compatible middleware
- Cron jobs via `vercel.json`
- PostgreSQL via Supabase connection pooling
