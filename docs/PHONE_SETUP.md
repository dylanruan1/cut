# AI Receptionist Phone Setup

Each barbershop connects a **Twilio number** so inbound calls reach that shop’s AI receptionist. Cut stores the number and routing metadata in Settings — it does **not** buy, forward, or port numbers for you.

## How shop identity works

1. A caller dials a Twilio number (or is forwarded to one).
2. Twilio POSTs to `/api/twilio/voice` with:
   - **From** = the customer’s phone
   - **To** = the Twilio number that was called
3. Cut normalizes **To** and finds the barbershop where `twilioPhone` matches.
4. The greeting, confirmation, and booking messages use that shop’s **name**.

If **To** does not match any shop:

| Environment | Behavior |
|-------------|----------|
| Development (`NODE_ENV=development` or `ALLOW_DEV_SHOP_FALLBACK=true`) | Optional fallback to the oldest shop, with a clear console warning |
| Production | Reject the call. TwiML: *“Sorry, this phone number is not connected to a barbershop yet.”* — **no booking** |

## Voice webhook URL

Paste this in Twilio Console → Phone Numbers → [your number] → Voice configuration:

```
{NEXT_PUBLIC_APP_URL}/api/twilio/voice
```

Example: `https://your-app.vercel.app/api/twilio/voice`

Method: **HTTP POST**

The Settings → **AI Phone** tab shows the computed URL for the current deployment.

## Setup methods

### 1. New Twilio number

1. In [Twilio Console](https://console.twilio.com/) → Phone Numbers → Buy a number (Voice enabled).
2. Set the Voice webhook to `{NEXT_PUBLIC_APP_URL}/api/twilio/voice`.
3. In Cut → Settings → AI Phone:
   - Enter the Twilio number (E.164, e.g. `+15551234567`)
   - Setup method: **New Twilio number**
   - Status: **Connected** (or leave blank and save — status updates when a number is present)
4. Call the Twilio number to verify the shop-name greeting.

### 2. Forward existing shop number

Keep your published shop line; forward calls to the Twilio AI number.

1. Buy/configure a Twilio number as in method 1 and save it as `twilioPhone` in Cut.
2. At your carrier (or PBX), set **call forwarding** from the shop’s public number → the Twilio number.
3. In Cut, set setup method to **Forward existing number**.
4. Callers still dial the familiar shop number; Twilio receives the forward and Cut routes by **To** (the Twilio number).

### 3. Port existing number to Twilio (instructions only)

Cut **does not** initiate number ports. Use Twilio’s porting flow:

1. In Twilio Console, start a **port-in** for the shop’s existing number.
2. Complete carrier LOA / account verification as Twilio requests.
3. When the port completes, point the Voice webhook at `/api/twilio/voice`.
4. In Cut, set `twilioPhone` to that number, method **Port existing number to Twilio**, and optionally fill **Porting notes** (carrier account #, authorized contact, target date).

Until the port completes, you can use a temporary Twilio number + forwarding (method 2).

## Why production should use Vercel (not ngrok)

| | Vercel / stable HTTPS | ngrok / local tunnel |
|--|----------------------|----------------------|
| URL stability | Fixed domain | Changes on restart (free tier) |
| Twilio webhooks | Reliable POSTs | Break when tunnel dies |
| TLS | Managed | Depends on tunnel |
| Multi-shop | Same app URL; shops distinguished by **To** | Same, but ops are fragile |

Use ngrok (or Cloudflare Tunnel) only for **local development**. For production, deploy to Vercel (or another always-on HTTPS host) and set:

```bash
NEXT_PUBLIC_APP_URL=https://your-production-domain.com
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...   # optional default; per-shop routing uses barbershop.twilioPhone
```

## Settings fields

| Field | Purpose |
|-------|---------|
| `twilioPhone` | Unique E.164 Twilio number matched to inbound **To** |
| `phoneSetupMethod` | `NEW_TWILIO` \| `FORWARD_EXISTING` \| `PORT_TO_TWILIO` |
| `phoneSetupStatus` | `NOT_STARTED` \| `PENDING` \| `CONNECTED` \| `ERROR` |
| `phonePortingNotes` | Optional notes for manual porting |
| Voice webhook | Computed — not stored: `{NEXT_PUBLIC_APP_URL}/api/twilio/voice` |

Only **owners** can edit phone setup (`canManageShop`).

## Plan requirement

AI Phone setup and Twilio booking require the **AI Receptionist** plan (or local **Dev** shop bypass). Unpaid production shops hear:

> Sorry, this barbershop's AI receptionist is not active right now.

See [PAYWALL.md](./PAYWALL.md) and [BILLING.md](./BILLING.md).

## Related

- [AI Receptionist overview](./AI_RECEPTIONIST.md)
- [Paywall rules](./PAYWALL.md)
- Voice entry: `src/app/api/twilio/voice/route.ts`
- Shop resolve: `src/lib/ai-receptionist/shop-resolve.ts`
- Lookup helper: `findBarbershopByTwilioTo` in `src/lib/barbershop.ts`
