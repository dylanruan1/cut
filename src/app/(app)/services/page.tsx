import { requireShopUser, canManageServices } from "@/lib/auth";
import prisma from "@/lib/db";
import { ServicesManager } from "@/components/services/services-manager";
import { serializeForClient } from "@/lib/serializers";

export default async function ServicesPage() {
  const user = await requireShopUser();
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
