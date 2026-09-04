import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while the shop, its services and its barbers load.
 *
 * This page is reached from an Instagram bio or a text, so the person arriving
 * has no prior relationship with Cut and no reason to wait through a blank
 * screen — a white page for a second reads as a broken link. The skeleton
 * mirrors the real layout (shop header, then service cards) so the page does
 * not visibly jump when the content lands.
 */
export default function BookingLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl space-y-8 px-4 py-10">
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>

        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
