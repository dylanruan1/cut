import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PLAN_DISPLAY, type ShopPlan } from "@/lib/subscription";

interface FeatureLockedProps {
  feature: string;
  requiredPlan: ShopPlan;
  description?: string;
  ctaHref?: string;
  ctaLabel?: string;
}

export function FeatureLocked({
  feature,
  requiredPlan,
  description,
  ctaHref = `/pricing?plan=${requiredPlan}&reason=upgrade`,
  ctaLabel = `Upgrade to ${PLAN_DISPLAY[requiredPlan].name}`,
}: FeatureLockedProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4 animate-fade-in">
      <Card className="max-w-lg w-full border-border/60 shadow-soft">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <CardTitle className="text-2xl tracking-tight">{feature}</CardTitle>
          <CardDescription className="text-base">
            {description ??
              `${feature} is available on the ${PLAN_DISPLAY[requiredPlan].name} plan.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <Button asChild className="w-full sm:w-auto">
            <Link href={ctaHref}>
              <Sparkles className="mr-2 h-4 w-4" />
              {ctaLabel}
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/pricing">View all plans</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
