import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/**
 * Server gate for /onboarding — unauthenticated users go to login;
 * users who already have a shop go to the dashboard.
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login?redirect=/onboarding");
  }

  if (user.barbershopId && user.memberships.length > 0) {
    redirect("/dashboard");
  }

  return children;
}
