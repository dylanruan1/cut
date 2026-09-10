import Link from "next/link";

/**
 * Shown when a booking link resolves to a real shop that cannot take bookings.
 *
 * This used to be `notFound()`, which told the customer "the link may be
 * mistyped". It rarely was — the shop had deleted its starter services, or its
 * trial had lapsed — and blaming the customer for a working link sends them to
 * the shop down the road. The shop is named here precisely so they know they
 * reached the right place, and the phone number is offered because wanting a
 * haircut is not the same as wanting this website.
 */
export function ShopUnavailable({
  shopName,
  shopPhone,
  reason,
}: {
  shopName: string;
  shopPhone: string | null;
  reason: "setup" | "inactive";
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-16 text-foreground">
      <div className="w-full max-w-md border-2 border-foreground p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em]">
          {shopName}
        </p>
        <h1 className="mt-4 text-3xl font-black uppercase leading-[0.95] tracking-tighter">
          Not booking
          <br />
          online yet
        </h1>
        <p className="mt-6 text-sm font-medium leading-snug">
          {reason === "setup"
            ? "This shop hasn't finished setting up online booking. Your link is fine — there's just nothing to book yet."
            : "This shop isn't taking online bookings at the moment. Your link is fine."}
        </p>

        {shopPhone ? (
          <a
            href={`tel:${shopPhone.replace(/[^\d+]/g, "")}`}
            className="mt-8 inline-block bg-foreground px-6 py-3 text-sm font-bold uppercase tracking-wide text-background hover:opacity-80"
          >
            Call {shopPhone}
          </a>
        ) : (
          <p className="mt-8 text-sm font-medium leading-snug">
            Try the shop directly to book.
          </p>
        )}

        <p className="mt-8 border-t-2 border-foreground pt-4 text-xs font-bold uppercase tracking-wide">
          <Link href="/" className="hover:underline">
            Powered by Cut
          </Link>
        </p>
      </div>
    </div>
  );
}
