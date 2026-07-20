import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { isDevelopmentEnvironment, DEV_TEST_SHOP_2_NAME } from "@/lib/shop-constants";

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

  return (
    <div className="flex min-h-screen">
      <Sidebar
        shopName={user?.barbershop?.name}
        memberships={user?.memberships ?? []}
        activeShopId={user?.barbershopId}
        showDevTools={showDevTools}
        hasTestShop2={hasTestShop2}
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
        />
        <main className="flex-1 p-4 lg:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
