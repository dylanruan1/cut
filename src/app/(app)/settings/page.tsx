import { requireShopUser, canManageShop } from "@/lib/auth";
import prisma from "@/lib/db";
import { SettingsForm } from "@/components/settings/settings-form";
import { serializeForClient } from "@/lib/serializers";
import { getVoiceWebhookUrl } from "@/lib/voice-webhook";

export default async function SettingsPage() {
  const user = await requireShopUser();

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
    />
  );
}
