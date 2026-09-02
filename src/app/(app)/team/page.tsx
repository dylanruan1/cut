import { canManageShop } from "@/lib/auth";
import { requireActiveSubscription } from "@/lib/subscription-guards";
import { canUseTeam } from "@/lib/subscription";
import prisma from "@/lib/db";
import { TeamManager } from "@/components/team/team-manager";
import { FeatureLocked } from "@/components/billing/feature-locked";
import { serializeForClient } from "@/lib/serializers";
import { backfillBarberSlugs } from "@/lib/barber-slug";

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

  // Barbers created before personal links existed have no handle. Filling them
  // in here means nobody has to run a migration, and the owner sees a working
  // link the first time they look for one.
  await backfillBarberSlugs(user.barbershopId);

  const [barbers, invitations, shopRecord] = await Promise.all([
    prisma.barber.findMany({
      where: { barbershopId: user.barbershopId, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.invitation.findMany({
      where: { barbershopId: user.barbershopId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.barbershop.findUnique({
      where: { id: user.barbershopId },
      select: { slug: true },
    }),
  ]);

  // Send only whether a PIN exists — never the hash itself.
  const barbersForClient = barbers.map((barber) => {
    const { verifyPinHash, ...rest } = barber;
    return {
      ...serializeForClient(rest),
      hasVerifyPin: Boolean(verifyPinHash),
    };
  });

  return (
    <TeamManager
      barbers={barbersForClient}
      invitations={serializeForClient(invitations)}
      canManage={canManageShop(user.role)}
      shopSlug={shopRecord?.slug ?? ""}
    />
  );
}
