import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (user && (!user.barbershopId || !user.barbershop)) {
    redirect("/onboarding");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          userName={user?.name}
          userEmail={user?.email}
          shopName={user?.barbershop?.name}
          memberships={user?.memberships ?? []}
          activeShopId={user?.barbershopId}
        />
        <main className="flex-1 p-4 lg:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
