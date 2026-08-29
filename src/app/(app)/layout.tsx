import { redirect } from "next/navigation";
import { getCurrentUser, canManageShop } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { isDevelopmentEnvironment, DEV_TEST_SHOP_2_NAME } from "@/lib/shop-constants";
import { loadShopSubscription } from "@/lib/subscription-guards";
import { TrialBanner } from "@/components/billing/trial-banner";
import { DeletionBanner } from "@/components/settings/deletion-banner";
import { daysUntilPurge } from "@/lib/account-deletion";
import prisma from "@/lib/db";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (user && (!user.barbershopId || !user.barbershop)) {
    redirect("/onboarding");
  }

  const showDevTools = isDevelopmentEnvironment();
  const hasTestShop2 = user?.memberships.some(
    (m) => m.barbershop.name === DEV_TEST_SHOP_2_NAME
  );
  const showBilling = user ? canManageShop(user.role) : false;

  // These three ran as sequential awaits, so every page navigation waited for
  // one database round trip after another before rendering anything. They do
  // not depend on each other, so they go together.
  const [subscription, shopForDeletion, unreadNotifications] = user?.barbershopId
    ? await Promise.all([
        // Warn before the trial lapses rather than bouncing them to /pricing cold.
        loadShopSubscription(user.barbershopId),
        // A shop counting down to erasure needs to know on every page, not just
        // the settings page they are unlikely to revisit.
        prisma.barbershop.findUnique({
          where: { id: user.barbershopId },
          select: { deletionRequestedAt: true },
        }),
        // Resolved here rather than in the bell itself, so the badge is correct
        // on first paint instead of popping in after a client fetch.
        prisma.notification.count({
          where: { barbershopId: user.barbershopId, isRead: false },
        }),
      ])
    : [null, null, 0];

  const pendingDeletionAt = shopForDeletion?.deletionRequestedAt ?? null;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        shopName={user?.barbershop?.name}
        memberships={user?.memberships ?? []}
        activeShopId={user?.barbershopId}
        showDevTools={showDevTools}
        hasTestShop2={hasTestShop2}
        showBilling={showBilling}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          userName={user?.name}
          userEmail={user?.email}
          shopName={user?.barbershop?.name}
          memberships={user?.memberships ?? []}
          activeShopId={user?.barbershopId}
          showDevTools={showDevTools}
          hasTestShop2={hasTestShop2}
          showBilling={showBilling}
          unreadNotifications={unreadNotifications}
        />
        <main id="main" className="flex-1 p-4 lg:p-6 overflow-auto">
          {pendingDeletionAt && (
            <DeletionBanner
              daysLeft={daysUntilPurge(pendingDeletionAt)}
              canUndo={showBilling}
            />
          )}
          {subscription && (
            <TrialBanner
              status={subscription.subscriptionStatus}
              trialEndsAt={subscription.trialEndsAt}
            />
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
