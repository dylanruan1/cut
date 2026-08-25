import { ImageResponse } from "next/og";
import { getPublicShop } from "@/actions/public-booking";

/**
 * Social preview card for a shop's booking link.
 *
 * This exists because the booking link is the product's entire distribution
 * channel — shops put it in an Instagram bio or text it to a client. Without an
 * OG image the link renders as bare grey text next to competitors that show a
 * card, so the missing image was costing bookings.
 *
 * Rendered at request time by Next's OG image route; no assets to maintain.
 */

export const alt = "Book an appointment";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  // Next has moved params between sync and Promise across versions; awaiting
  // handles both, and getting this wrong would silently render "Cut." for every
  // shop rather than fail loudly.
  params: Promise<{ slug: string }> | { slug: string };
}) {
  const { slug } = await params;
  const shop = await getPublicShop(slug).catch(() => null);
  const name = shop?.name ?? "Cut.";
  const location = shop?.address ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#0e1116",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#1f7ac2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            C
          </div>
          <div style={{ fontSize: 26, color: "#93a1b1", letterSpacing: -0.5 }}>
            Cut.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: name.length > 24 ? 76 : 96,
              fontWeight: 700,
              letterSpacing: -3,
              lineHeight: 1.05,
            }}
          >
            {name}
          </div>
          {location ? (
            <div style={{ fontSize: 34, color: "#93a1b1" }}>{location}</div>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 34,
            color: "#e6edf3",
          }}
        >
          <div
            style={{
              background: "#1f7ac2",
              borderRadius: 999,
              padding: "14px 32px",
              fontWeight: 600,
            }}
          >
            Book online
          </div>
          <div style={{ color: "#6b7a8c", fontSize: 28 }}>
            Pick a barber, pick a time
          </div>
        </div>
      </div>
    ),
    size
  );
}
