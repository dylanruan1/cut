import { requireActiveSubscription } from "@/lib/subscription-guards";
import { getDashboardData } from "@/actions/appointments";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { formatDate } from "@/lib/dates";

export default async function DashboardPage() {
  const { user } = await requireActiveSubscription();
  const data = await getDashboardData();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Good {getGreeting()}, {user.name?.split(" ")[0] ?? "there"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {formatDate(new Date(), user.barbershop.timezone)} · {user.barbershop.name}
        </p>
      </div>
      <DashboardContent data={data} timezone={user.barbershop.timezone} />
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
