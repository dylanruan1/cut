"use client";

import { useState, useTransition } from "react";
import { Bell, Loader2, CalendarPlus, CalendarX, CreditCard, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getNotifications,
  markAllNotificationsRead,
  type ShopNotification,
} from "@/actions/notifications";

/**
 * Header notification bell.
 *
 * Loads on open rather than on every page render, because most page views
 * never touch it. The unread count comes in as a prop from the server so the
 * badge is correct before anyone clicks.
 */
export function NotificationsBell({ initialUnread }: { initialUnread: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ShopNotification[] | null>(null);
  const [unread, setUnread] = useState(initialUnread);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;

    setLoading(true);
    getNotifications()
      .then((res) => {
        setItems(res.items);
        setUnread(res.unread);
        // Opening the panel is the read. Clear the badge immediately so it
        // doesn't linger while the write round-trips.
        if (res.unread > 0) {
          setUnread(0);
          startTransition(async () => {
            await markAllNotificationsRead();
          });
        }
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
          }
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="nums absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-medium">Notifications</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading
          </div>
        ) : !items || items.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Bell className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nothing yet. New bookings and cancellations show up here.
            </p>
          </div>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {items.map((n) => (
              <li
                key={n.id}
                className={`flex gap-3 px-4 py-3 ${n.isRead ? "" : "bg-accent/40"}`}
              >
                <span className="mt-0.5 text-muted-foreground">
                  <NotificationIcon type={n.type} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug">{n.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {n.message}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {timeAgo(n.createdAtIso)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function NotificationIcon({ type }: { type: string }) {
  const className = "h-4 w-4";
  switch (type) {
    case "APPOINTMENT":
      return <CalendarPlus className={className} />;
    case "REMINDER":
      return <CalendarX className={className} />;
    case "INVITE":
      return <Users className={className} />;
    default:
      return <CreditCard className={className} />;
  }
}

/**
 * Relative time, computed in the browser so it reflects the reader's clock.
 *
 * Deliberately coarse — "2h ago" is what someone glancing at a bell wants, not
 * a timestamp they have to decode.
 */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
