import { Skeleton } from "@/components/ui/skeleton";

export function PageHeaderSkeleton({ withSubtitle = true }: { withSubtitle?: boolean }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-48" />
      {withSubtitle && <Skeleton className="h-4 w-72 max-w-full" />}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <Skeleton className="h-[70vh] min-h-[420px] rounded-2xl" />
    </div>
  );
}

export function ListPageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-6 animate-pulse">
      <PageHeaderSkeleton />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="space-y-6 max-w-3xl animate-pulse">
      <PageHeaderSkeleton />
      <Skeleton className="h-10 w-64 rounded-xl" />
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}

export function PricingSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 space-y-10 animate-pulse">
      <div className="text-center space-y-3">
        <Skeleton className="h-4 w-24 mx-auto" />
        <Skeleton className="h-12 w-96 max-w-full mx-auto" />
        <Skeleton className="h-5 w-[28rem] max-w-full mx-auto" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-96 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
