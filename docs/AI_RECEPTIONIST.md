# AI Receptionist

Production-ready MVP for Cut's phone booking flow. Callers speak naturally; the system parses intent, collects missing details, checks availability, and books appointments.

## How it works

```
Caller → Twilio Voice
       → POST /api/twilio/voice          (greeting + Gather speech)
       → POST /api/twilio/voice/process  (SpeechResult)
       → processReceptionistMessage()
            ├─ rule-based parser (MVP)
            ├─ availability check
            ├─ Prisma booking / cancel
            └─ optional SMS confirmation
       → TwiML <Say> / <Gather> reply
```

### Module layout

| File | Role |
|------|------|
| `src/lib/ai-receptionist/types.ts` | Shared TypeScript contracts |
| `src/lib/ai-receptionist/prompts.ts` | Greeting + follow-up copy (+ future LLM system prompt) |
| `src/lib/ai-receptionist/parser.ts` | Deterministic intent + slot parsing |
| `src/lib/ai-receptionist/availability.ts` | Slot generation / conflict checks |
| `src/lib/ai-receptionist/booking.ts` | Find/create client, create/cancel appointments |
| `src/lib/ai-receptionist/sms.ts` | Soft SMS send (no crash if Twilio missing) |
| `src/lib/ai-receptionist/index.ts` | `processReceptionistMessage` public API |

### Persistent call sessions

Every Twilio `CallSid` maps to a `ReceptionistCallSession` row in PostgreSQL
(not in-memory), so serverless instances keep conversation state between turns.

Stored fields include intent, client name, service, barber, date/time, status,
and a `context` JSON blob (`awaitingField`, turn counts, prompt repeats).

See `src/lib/ai-receptionist/session.ts`.

- `book_appointment`
- `reschedule_appointment`
- `cancel_appointment`
- `ask_hours`
- `ask_services`
- `ask_location`
- `unknown`

## Required Twilio env vars

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

If any of these are missing (or still set to `your-*` placeholders), the app:

- Still boots and serves the dashboard
- Still returns valid TwiML from voice routes
- Skips SMS and logs a clear message instead of throwing

Check configuration in code via `isTwilioConfigured()` / `getTwilioConfigStatus()` from `@/lib/twilio`.

## Configure Twilio webhook

1. Buy or select a Twilio number.
2. In Twilio Console → Phone Numbers → Voice & Fax:
   - **A call comes in**: Webhook
   - URL: `https://YOUR_DOMAIN/api/twilio/voice`
   - Method: `HTTP POST`
3. Optionally set the shop's `twilioPhone` in the database so inbound calls resolve to the correct barbershop.
4. For local testing, expose your app with a tunnel (ngrok, Cloudflare Tunnel) and point the webhook at that URL.

Legacy keypad flow remains at `/api/twilio/voice/handle` if you still need DTMF menus.

## Example call flow

1. **Call connects**  
   AI: “Thanks for calling Cut. I'm the AI receptionist…”

2. **Caller:** “I want a haircut tomorrow at 3”  
   AI: “What's your name?”

3. **Caller:** “My name is Jordan”  
   System checks availability → creates appointment → optional SMS  
   AI: “You're all set. I booked Haircut with Chris on …”

4. **Info questions**  
   - “What time are you open?” → business hours  
   - “What services do you offer?” → service list  
   - “Where are you located?” → address  

5. **Cancel**  
   - “Cancel my appointment” → cancels the next upcoming booking for the caller’s phone number

## Testing without Twilio hardware

```bash
# Unit tests (parser, availability, follow-ups)
npm test -- src/lib/ai-receptionist/parser.test.ts

# Fake webhook (greeting)
curl -X POST http://localhost:3000/api/twilio/voice \
  -d "CallSid=CA_test" -d "From=%2B15551234567" -d "To=%2B15557654321"

# Fake speech turn
curl -X POST http://localhost:3000/api/twilio/voice/process \
  -d "CallSid=CA_test" \
  -d "From=%2B15551234567" \
  -d "SpeechResult=What services do you offer"
```

Both endpoints return `Content-Type: text/xml` TwiML.

## Future upgrade path (real AI voice)

`processReceptionistMessage(input, { provider: "openai" })` is already plumbed.

Recommended steps:

1. Add `OPENAI_API_KEY` (and optional `AI_RECEPTIONIST_PROVIDER=openai`).
2. Implement `callLanguageModel()` that:
   - Uses `buildSystemPrompt()` from `prompts.ts`
   - Returns structured JSON matching `ParsedBookingRequest`
3. Keep Twilio routes unchanged — they only call `processReceptionistMessage`.
4. Optionally swap `<Gather speech>` for Twilio Media Streams + a realtime voice model later; the booking/availability layer stays the same.

The rule-based parser remains the default so local/dev and CI stay free and deterministic.
