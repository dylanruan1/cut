# Cut.

A modern scheduling platform for barbershops. Built with Next.js, TypeScript, Tailwind CSS, Supabase, Prisma, and Twilio.

## Features

- **Authentication** — Sign up, login, logout, forgot password, email verification via Supabase Auth
- **Role-based access** — Owner, Barber, and Receptionist roles with granular permissions
- **Dashboard** — Today's appointments, upcoming schedule, revenue, notifications, quick actions
- **Calendar** — Apple-inspired day/week/month views with drag-and-drop, resize, search, and barber filtering
- **Appointments** — Full CRUD with status tracking, deposits, and SMS notifications
- **Phone booking** — Twilio Voice IVR flow (architecture ready for AI voice agent replacement)
- **SMS** — Booking confirmations, 24h/2h reminders, cancellation/reschedule notices
- **Client search** — Instant search by name, phone, or email with visit history
- **Services & team** — Manage service menu, invite barbers, shop settings
- **Analytics** — Revenue, appointments, popular services (owner only)
- **Dark mode** — System-aware theme with smooth transitions

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Database | PostgreSQL via Prisma |
| Auth | Supabase Authentication |
| SMS/Voice | Twilio |
| Deployment | Vercel |

## Prerequisites

- Node.js 18+
- PostgreSQL database (Supabase recommended)
- Supabase project
- Twilio account (for SMS/Voice)

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd cut

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Configure your .env.local (see Environment Variables below)

# Push database schema
npm run db:push

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_APP_URL` | App URL (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only) |
| `DATABASE_URL` | PostgreSQL connection string (pooled) |
| `DIRECT_URL` | PostgreSQL direct connection string |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Twilio phone number for SMS/Voice |
| `CRON_SECRET` | Secret for cron job authentication |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with Turbopack |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:e2e` | Run E2E tests (Playwright) |
| `npm run db:push` | Push Prisma schema to database |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:studio` | Open Prisma Studio |

## Phone booking / AI receptionist

See [docs/AI_RECEPTIONIST.md](docs/AI_RECEPTIONIST.md) for the speech-based receptionist,
Twilio webhook setup, and the upgrade path to a real LLM voice agent.

Legacy DTMF keypad flow remains at `/api/twilio/voice/handle`.

## Deployment

### Vercel

1. Push to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Add all environment variables from `.env.example`
4. Deploy

Vercel Cron is configured in `vercel.json` to send SMS reminders every 15 minutes.

### Twilio Setup

1. Purchase a phone number in Twilio Console
2. Set Voice webhook URL: `https://your-domain.com/api/twilio/voice`
3. Set SMS status callback if desired
4. Add credentials to environment variables

## Folder Structure

```
src/
├── actions/          # Server actions (auth, appointments, etc.)
├── app/
│   ├── (app)/        # Authenticated app routes
│   ├── (auth)/       # Auth pages (login, signup)
│   ├── api/          # API routes (Twilio, cron, health)
│   └── auth/         # Auth callback
├── components/
│   ├── calendar/     # Calendar views and dialogs
│   ├── dashboard/    # Dashboard widgets
│   ├── layout/       # Sidebar, header
│   ├── shared/       # Empty states, etc.
│   └── ui/           # shadcn/ui components
├── hooks/            # Custom React hooks
├── lib/              # Utilities, auth, db, twilio
└── test/             # Test setup
prisma/
└── schema.prisma     # Database schema
e2e/                  # Playwright E2E tests
docs/                 # Architecture documentation
```

## Database Schema

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full schema and architecture documentation.

## Testing

```bash
# Unit tests
npm test

# E2E tests (requires dev server)
npm run test:e2e
```

## License

Private — All rights reserved.
