"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Calendar,
  Clock,
  DollarSign,
  Plus,
  Users,
  Bell,
  TrendingUp,
} from "lucide-react";
import { formatTime, getStatusColor, getStatusLabel, formatDuration } from "@/lib/dates";
import { formatCurrency, getInitials, getAppointmentClientName } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";

interface DashboardContentProps {
  data: {
    todayAppointments: Array<{
      id: string;
      startTime: string;
      endTime: string;
      status: string;
      duration: number;
      clientNameSnapshot?: string | null;
      client: { name: string; phone: string };
      barber: { name: string; color: string; photoUrl: string | null };
      service: { name: string; price: number };
    }>;
    upcomingAppointments: Array<{
      id: string;
      startTime: string;
      status: string;
      clientNameSnapshot?: string | null;
      client: { name: string };
      barber: { name: string; color: string };
      service: { name: string };
    }>;
    notifications: Array<{
      id: string;
      title: string;
      message: string;
      createdAt: string;
    }>;
    revenue: number;
    stats: {
      todayCount: number;
      upcomingCount: number;
      completedCount: number;
    };
  };
  timezone: string;
}

export function DashboardContent({ data, timezone }: DashboardContentProps) {
  const { todayAppointments, upcomingAppointments, notifications, revenue, stats } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today"
          value={stats.todayCount.toString()}
          subtitle="appointments"
          icon={Calendar}
        />
        <StatCard
          title="Upcoming"
          value={stats.upcomingCount.toString()}
          subtitle="this week"
          icon={Clock}
        />
        <StatCard
          title="Revenue"
          value={formatCurrency(revenue)}
          subtitle="today"
          icon={DollarSign}
        />
        <StatCard
          title="Completed"
          value={stats.completedCount.toString()}
          subtitle="today"
          icon={TrendingUp}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Today&apos;s Appointments</CardTitle>
              <Button size="sm" asChild>
                <Link href="/calendar">
                  <Plus className="h-4 w-4 mr-1" />
                  New
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {todayAppointments.length === 0 ? (
                <EmptyState
                  icon={Calendar}
                  title="No appointments today"
                  description="Your schedule is clear. Enjoy the break or book ahead."
                  action={{ label: "View calendar", href: "/calendar" }}
                />
              ) : (
                <div className="space-y-3">
                  {todayAppointments.map((apt) => (
                    <div
                      key={apt.id}
                      className="flex items-center gap-4 p-3 rounded-xl hover:bg-muted/50 transition-colors"
                    >
                      <div
                        className="w-1 h-12 rounded-full shrink-0"
                        style={{ backgroundColor: apt.barber.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{getAppointmentClientName(apt)}</p>
                          <Badge className={getStatusColor(apt.status)} variant="outline">
                            {getStatusLabel(apt.status)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {apt.service.name} · {formatDuration(apt.duration)} · {apt.barber.name}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-medium text-sm">
                          {formatTime(apt.startTime, timezone)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(apt.service.price)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Upcoming</CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingAppointments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No upcoming appointments
                </p>
              ) : (
                <div className="space-y-3">
                  {upcomingAppointments.map((apt) => (
                    <div key={apt.id} className="flex items-center gap-3 p-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback style={{ backgroundColor: `${apt.barber.color}20`, color: apt.barber.color }}>
                          {getInitials(getAppointmentClientName(apt))}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{getAppointmentClientName(apt)}</p>
                        <p className="text-xs text-muted-foreground">
                          {apt.service.name} with {apt.barber.name}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground shrink-0">
                        {formatTime(apt.startTime, timezone)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              {notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  All caught up
                </p>
              ) : (
                <div className="space-y-3">
                  {notifications.map((n) => (
                    <div key={n.id} className="p-3 rounded-xl bg-muted/50">
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button variant="outline" className="justify-start" asChild>
                <Link href="/calendar">
                  <Plus className="h-4 w-4 mr-2" />
                  New appointment
                </Link>
              </Button>
              <Button variant="outline" className="justify-start" asChild>
                <Link href="/clients">
                  <Users className="h-4 w-4 mr-2" />
                  Find client
                </Link>
              </Button>
              <Button variant="outline" className="justify-start" asChild>
                <Link href="/calendar">
                  <Calendar className="h-4 w-4 mr-2" />
                  View calendar
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{title}</p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-2xl font-semibold mt-1">{value}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}
