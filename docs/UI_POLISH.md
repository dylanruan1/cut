# UI polish

Cut should feel premium, calm, and trustworthy for barbershop owners.

## Patterns in use

| Pattern | Where |
|---------|--------|
| Route `loading.tsx` + skeletons | Dashboard, calendar, clients, services, team, analytics, settings, billing, pricing |
| `error.tsx` / `global-error.tsx` | App segment + root — no stack traces in UI |
| Toasts | Auth, onboarding, settings, billing, team, services, calendar, shop switch |
| Empty states | Dashboard, clients, services, team |
| Tooltips | Header theme/notifications, team remove |
| Button loading | Login, signup, onboarding, checkout, portal, invite, settings saves |
| Shop switcher | Spinner + toast + full path revalidation |

## Copy guidelines

- Prefer verbs: “Save changes”, “Send invitation”, “Start trial”, “Upgrade to AI Receptionist”
- Errors: short title + helpful description
- Locked features: explain plan + CTA (never dead-end)

## Spacing & layout

- Page title: `text-2xl md:text-3xl font-semibold tracking-tight`
- Subtitle: `text-muted-foreground mt-1`
- Cards: `rounded-xl` / soft borders — avoid heavy multi-shadow chrome
- Mobile: sidebar sheet + header shop switcher; touch targets ≥ 40px

## After mutations

Always:

1. Toast success or error
2. `revalidatePath` for affected routes
3. `router.refresh()` when client needs fresh RSC data (shop switch)

## Don’t

- Flash previous shop’s appointments after switch
- Show raw Prisma / stack errors to users
- Use emoji-heavy empty states
- Disable primary CTAs without explanation
