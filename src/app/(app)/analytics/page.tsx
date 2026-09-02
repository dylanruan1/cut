import { canViewAnalytics } from "@/lib/auth";
import { requireActiveSubscription } from "@/lib/subscription-guards";
import { canUseAnalytics, canUseAiReceptionist } from "@/lib/subscription";
import { getReceptionistStats } from "@/lib/receptionist-stats";
import prisma from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FeatureLocked } from "@/components/billing/feature-locked";
import { formatCurrency } from "@/lib/utils";
import { getShopAnalytics } from "@/lib/analytics";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  Calendar,
  UserPlus,
  UserX,
  PhoneCall,
} from "lucide-react";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const { user, shop } = await requireActiveSubscription();
  if (!canViewAnalytics(user.role)) redirect("/dashboard");

  if (!canUseAnalytics(shop)) {
    return (
      <FeatureLocked
        feature="Analytics"
        requiredPlan="PRO"
        description="See revenue, popular services, and shop performance on Pro or higher."
        ctaLabel="Upgrade to Pro"
      />
    );
  }

  const { timezone } = await prisma.barbershop.findUniqueOrThrow({
    where: { id: user.barbershopId },
    select: { timezone: true },
  });

  const [stats, receptionist] = await Promise.all([
    getShopAnalytics(user.barbershopId, timezone),
    getReceptionistStats(user.barbershopId, timezone),
  ]);
  const totalVisits = stats.appointmentCount + stats.walkInCount;
  const aiUnlocked = canUseAiReceptionist(shop);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Analytics
        </h1>
        <p className="mt-1 text-muted-foreground">
          {stats.monthLabel} · {shop.name}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Revenue"
          value={formatCurrency(stats.revenue)}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
          footer={
            stats.revenueChangePct !== null ? (
              <span
                className={`inline-flex items-center gap-1 text-xs ${
                  stats.revenueChangePct >= 0
                    ? "text-primary"
                    : "text-destructive"
                }`}
              >
                {stats.revenueChangePct >= 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {Math.abs(stats.revenueChangePct)}% vs last month
              </span>
            ) : null
          }
        />
        <Stat
          label="Visits"
          value={String(totalVisits)}
          icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
          footer={
            <span className="text-xs text-muted-foreground">
              {stats.appointmentCount} booked · {stats.walkInCount} walk-in
            </span>
          }
        />
        <Stat
          label="Avg. ticket"
          value={formatCurrency(stats.avgTicket)}
          icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
        />
        <Stat
          label="New clients"
          value={String(stats.newClients)}
          icon={<UserPlus className="h-4 w-4 text-muted-foreground" />}
          footer={
            <span className="text-xs text-muted-foreground">
              {stats.totalClients} total
            </span>
          }
        />
      </div>

      {/* The receptionist's own numbers. This is what a shop is paying the AI
          plan for, so it gets its own block rather than being buried among the
          general shop stats. */}
      {aiUnlocked && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PhoneCall className="h-4 w-4 text-muted-foreground" />
              Answered by your AI receptionist
            </CardTitle>
          </CardHeader>
          <CardContent>
            {receptionist.callsAnswered === 0 ? (
              <p className="text-sm text-muted-foreground">
                No calls yet this month. Once your number is pointed at Cut,
                every call it answers shows up here.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <MiniStat
                    label="Calls answered"
                    value={String(receptionist.callsAnswered)}
                  />
                  <MiniStat
                    label="Turned into bookings"
                    value={String(receptionist.callsBooked)}
                  />
                  <MiniStat
                    label="Booked value"
                    value={formatCurrency(receptionist.bookedValue)}
                  />
                  <MiniStat
                    label="Booking rate"
                    value={
                      receptionist.conversionPct === null
                        ? "—"
                        : `${receptionist.conversionPct}%`
                    }
                  />
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  Calls the AI picked up and appointments it put in your
                  calendar this month.
                  {receptionist.callsUnfinished > 0 &&
                    ` ${receptionist.callsUnfinished} call${
                      receptionist.callsUnfinished === 1 ? "" : "s"
                    } ended before booking.`}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Popular services</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.serviceBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No visits yet this month.
              </p>
            ) : (
              <div className="space-y-3">
                {stats.serviceBreakdown.map((s) => (
                  <div key={s.name} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{s.name}</span>
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${Math.round((s.count / totalVisits) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="w-8 text-sm text-muted-foreground">
                        {s.count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserX className="h-4 w-4 text-muted-foreground" />
              No-shows
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="nums text-3xl font-semibold">{stats.noShowCount}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {stats.noShowCount === 0
                ? "None this month."
                : "Deposits can help cut this down."}
            </p>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Revenue counts appointments that have already happened plus paid
        walk-ins. Cancelled appointments and no-shows are excluded.
      </p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="nums mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  footer,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          {icon}
        </div>
        <p className="nums mt-1 text-2xl font-semibold tracking-tight">{value}</p>
        {footer ? <div className="mt-1">{footer}</div> : null}
      </CardContent>
    </Card>
  );
}
