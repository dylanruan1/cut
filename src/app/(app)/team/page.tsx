import { requireShopUser, canManageShop } from "@/lib/auth";
import prisma from "@/lib/db";
import { TeamManager } from "@/components/team/team-manager";
import { serializeForClient } from "@/lib/serializers";

export default async function TeamPage() {
  const user = await requireShopUser();

  const [barbers, invitations] = await Promise.all([
    prisma.barber.findMany({
      where: { barbershopId: user.barbershopId, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.invitation.findMany({
      where: { barbershopId: user.barbershopId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <TeamManager
      barbers={serializeForClient(barbers)}
      invitations={serializeForClient(invitations)}
      canManage={canManageShop(user.role)}
    />
  );
}
