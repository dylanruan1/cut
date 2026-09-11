import { canManageShop } from "@/lib/auth";
import { requireActiveSubscription } from "@/lib/subscription-guards";
import { canUseAiReceptionist } from "@/lib/subscription";
import prisma from "@/lib/db";
import { SettingsForm } from "@/components/settings/settings-form";
import { serializeForClient } from "@/lib/serializers";
import { getVoiceWebhookUrl } from "@/lib/voice-webhook";
import { DangerZone } from "@/components/settings/danger-zone";
import { BookingLinkCard } from "@/components/settings/booking-link-card";

type Props = {
  searchParams: Promise<{ payouts?: string }>;
};

export default async function SettingsPage({ searchParams }: Props) {
  const { user, shop: subscription } = await requireActiveSubscription();
  // Stripe's return_url. The stored status is whatever we wrote when setup
  // started, so the payouts card re-checks with Stripe before saying anything.
  const { payouts } = await searchParams;

  const [shop, businessHours] = await Promise.all([
    prisma.barbershop.findUnique({ where: { id: user.barbershopId } }),
    prisma.businessHour.findMany({
      where: { barbershopId: user.barbershopId },
      orderBy: { dayOfWeek: "asc" },
    }),
  ]);

  const isOwner = canManageShop(user.role);

  return (
    <div className="space-y-6">
      <SettingsForm
        shop={serializeForClient(shop!)}
        businessHours={serializeForClient(businessHours)}
        canManage={isOwner}
        voiceWebhookUrl={getVoiceWebhookUrl()}
        aiUnlocked={canUseAiReceptionist(subscription)}
        returnedFromPayoutSetup={payouts === "done" || payouts === "refresh"}
      />
      <BookingLinkCard slug={shop?.slug ?? ""} />

      {/* Hidden while deletion is already scheduled — the banner owns that
          state, and offering "delete" again would just confuse. */}
      {!shop?.deletionRequestedAt && (
        <DangerZone isOwner={isOwner} shopName={shop?.name ?? ""} />
      )}
    </div>
  );
}
