import { canManageShop } from "@/lib/auth";
import { requireActiveSubscription } from "@/lib/subscription-guards";
import { canUseAiReceptionist } from "@/lib/subscription";
import prisma from "@/lib/db";
import { SettingsForm } from "@/components/settings/settings-form";
import { serializeForClient } from "@/lib/serializers";
import { getVoiceWebhookUrl } from "@/lib/voice-webhook";

export default async function SettingsPage() {
  const { user, shop: subscription } = await requireActiveSubscription();

  const [shop, businessHours] = await Promise.all([
    prisma.barbershop.findUnique({ where: { id: user.barbershopId } }),
    prisma.businessHour.findMany({
      where: { barbershopId: user.barbershopId },
      orderBy: { dayOfWeek: "asc" },
    }),
  ]);

  return (
    <SettingsForm
      shop={serializeForClient(shop!)}
      businessHours={serializeForClient(businessHours)}
      canManage={canManageShop(user.role)}
      voiceWebhookUrl={getVoiceWebhookUrl()}
      aiUnlocked={canUseAiReceptionist(subscription)}
    />
  );
}
