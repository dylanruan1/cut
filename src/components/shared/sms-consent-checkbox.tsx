"use client";

import Link from "next/link";

/**
 * Affirmative SMS opt-in.
 *
 * Every place Cut collects a mobile number renders this. It must stay
 * unchecked until the customer ticks it themselves — a pre-ticked box is not
 * consent to a carrier, and A2P campaign rejection 30925 says so in as many
 * words.
 *
 * It is also deliberately optional. Cut's registered opt-in answer states that
 * consent is not a condition of purchase, so booking has to work with the box
 * left alone; the booking simply goes through without texts. Do not make this
 * required to submit — that would contradict what is filed with the carriers.
 *
 * Square, hard-ruled and 20px to match the rest of the product, and because a
 * consent control a thumb misses on a phone is not much of a consent control.
 */
export function SmsConsentCheckbox({
  checked,
  onChange,
  shopName,
  context = "booking",
  id = "sms-consent",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  shopName: string;
  context?: "booking" | "queue" | "waitlist";
  id?: string;
}) {
  const what =
    context === "queue"
      ? "text messages about my place in line"
      : context === "waitlist"
        ? "a text if a spot opens up"
        : "appointment text messages — confirmations, reminders, and changes";

  return (
    <div className="flex items-start gap-3 border-2 border-foreground p-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-foreground"
      />
      <label htmlFor={id} className="cursor-pointer text-xs leading-snug">
        Yes, text me. I agree to receive {what} from {shopName} at the number I
        provide. Message frequency varies. Message and data rates may apply.
        Reply STOP to opt out or HELP for help. See our{" "}
        <Link href="/privacy" className="underline" target="_blank">
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link href="/terms" className="underline" target="_blank">
          Terms
        </Link>
        .
      </label>
    </div>
  );
}
