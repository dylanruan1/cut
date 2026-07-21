import { canManageShop } from "@/lib/auth";
import { requireActiveSubscription } from "@/lib/subscription-guards";
import { canUseTeam } from "@/lib/subscription";
import prisma from "@/lib/db";
import { TeamManager } from "@/components/team/team-manager";
import { FeatureLocked } from "@/components/billing/feature-locked";
import { serializeForClient } from "@/lib/serializers";

export default async function TeamPage() {
  const { user, shop } = await requireActiveSubscription();

  if (!canUseTeam(shop)) {
    return (
      <FeatureLocked
        feature="Team management"
        requiredPlan="PRO"
        description="Invite barbers and manage your team on the Pro plan or higher."
        ctaLabel="Upgrade to Pro"
      />
    );
  }

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
