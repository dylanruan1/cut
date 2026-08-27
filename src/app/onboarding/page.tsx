"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, Scissors, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { completeOnboarding } from "@/actions/auth";
import { toast } from "@/hooks/use-toast";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "Pacific/Honolulu",
];

const SERVICE_OPTIONS = [
  { id: "haircut", label: "Haircut" },
  { id: "beard", label: "Beard trim" },
  { id: "lineup", label: "Lineup" },
  { id: "custom", label: "Custom service" },
] as const;

/**
 * useSearchParams() forces this subtree to render on the client, and Next
 * requires a Suspense boundary around it or the production build fails. tsc
 * does not catch that, so the boundary lives here deliberately.
 */
export default function OnboardingPage() {
  return (
    // Fallback must not itself call useSearchParams, or it recurses.
    <Suspense fallback={null}>
      <OnboardingForm />
    </Suspense>
  );
}

function OnboardingForm() {
  const [loading, setLoading] = useState(false);
  const [includeCustom, setIncludeCustom] = useState(false);
  // Set by the auth callback after a successful email verification.
  const justVerified = useSearchParams().get("verified") === "1";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const result = await completeOnboarding(formData);
    setLoading(false);

    if (result?.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background">
      <div className="w-full max-w-lg animate-fade-in">
        <div className="flex justify-center mb-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
              <Scissors className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-2xl font-semibold tracking-tight">Cut.</span>
          </Link>
        </div>

        {justVerified && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium">Email confirmed</p>
              <p className="text-sm text-muted-foreground">
                Your account is verified. One more step and you&apos;re taking
                bookings.
              </p>
            </div>
          </div>
        )}

        <Card className="border-border/60 shadow-soft">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl tracking-tight">Set up your shop</CardTitle>
            <CardDescription>
              Create your barbershop profile. You&apos;ll get a Starter trial so you can
              start scheduling right away.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="shopName">Barbershop name</Label>
                <Input
                  id="shopName"
                  name="shopName"
                  placeholder="The Gentleman's Cut"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <select
                  id="timezone"
                  name="timezone"
                  defaultValue="America/Los_Angeles"
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm"
                  required
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address (optional)</Label>
                <Input id="address" name="address" placeholder="123 Main St" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Business phone (optional)</Label>
                <Input id="phone" name="phone" type="tel" placeholder="+1 555 0100" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="firstBarberName">First barber name (optional)</Label>
                <Input
                  id="firstBarberName"
                  name="firstBarberName"
                  placeholder="Defaults to your name"
                />
              </div>
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">Starting services</legend>
                <div className="grid grid-cols-2 gap-2">
                  {SERVICE_OPTIONS.map((opt) => (
                    <label
                      key={opt.id}
                      className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/40"
                    >
                      <input
                        type="checkbox"
                        name="services"
                        value={opt.id}
                        defaultChecked={opt.id !== "custom"}
                        onChange={(e) => {
                          if (opt.id === "custom") setIncludeCustom(e.target.checked);
                        }}
                        className="rounded border-input"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
                {includeCustom && (
                  <Input
                    name="customServiceName"
                    placeholder="Custom service name"
                    defaultValue="Hot towel shave"
                  />
                )}
              </fieldset>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating shop…
                  </>
                ) : (
                  "Continue to dashboard"
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
