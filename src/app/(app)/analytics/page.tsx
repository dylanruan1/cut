import { requireShopUser, canViewAnalytics } from "@/lib/auth";
import prisma from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { BarChart3, TrendingUp, Users, Calendar } from "lucide-react";
import { redirect } from "next/navigation";

export default async function AnalyticsPage() {
  const user = await requireShopUser();
  if (!canViewAnalytics(user.role)) {
    redirect("/dashboard");
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [appointments, clients] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        barbershopId: user.barbershopId,
        startTime: { gte: startOfMonth, lte: endOfMonth },
        status: "COMPLETED",
      },
      include: { service: true },
    }),
    prisma.client.count({ where: { barbershopId: user.barbershopId } }),
  ]);

  const revenue = appointments.reduce((sum, a) => sum + Number(a.service.price), 0);
  const avgTicket = appointments.length > 0 ? revenue / appointments.length : 0;

  const serviceBreakdown = appointments.reduce(
    (acc, apt) => {
      const name = apt.service.name;
      acc[name] = (acc[name] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground mt-1">This month&apos;s performance</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Revenue</p>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold mt-1">{formatCurrency(revenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Appointments</p>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold mt-1">{appointments.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Avg. ticket</p>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold mt-1">{formatCurrency(avgTicket)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Clients</p>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-semibold mt-1">{clients}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Popular Services</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(serviceBreakdown).length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed appointments this month</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(serviceBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{name}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{
                            width: `${(count / appointments.length) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground w-8">{count}</span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
