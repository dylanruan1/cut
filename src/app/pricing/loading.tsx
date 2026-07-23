import { PricingSkeleton } from "@/components/shared/page-skeletons";

export default function PricingLoading() {
  return (
    <div className="min-h-screen bg-background">
      <PricingSkeleton />
    </div>
  );
}
