import { canManageServices } from "@/lib/auth";
import { requireActiveSubscription } from "@/lib/subscription-guards";
import prisma from "@/lib/db";
import { ServicesManager } from "@/components/services/services-manager";
import { serializeForClient } from "@/lib/serializers";

export default async function ServicesPage() {
  const { user } = await requireActiveSubscription();
  const services = await prisma.service.findMany({
    where: { barbershopId: user.barbershopId, isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <ServicesManager
      services={serializeForClient(services)}
      canManage={canManageServices(user.role)}
    />
  );
}
