"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Scissors } from "lucide-react";
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
import { signIn, signInWithMagicLink, signInWithOAuth } from "@/actions/auth";
import { toast } from "@/hooks/use-toast";

export default function LoginPageInner() {
  const [loading, setLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = useMemo(
    () => searchParams.get("redirect") || "/dashboard",
    [searchParams]
  );
  const authError = searchParams.get("error");

  useEffect(() => {
    if (authError === "auth_callback_error") {
      toast({
        title: "Sign-in could not be completed",
        description:
          "The login link may have expired or Google sign-in is not fully configured yet. Try email and password, or contact support.",
        variant: "destructive",
      });
    }
  }, [authError]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    formData.set("redirect", redirectTo);

    try {
      const result = await signIn(formData);
      if (result?.error) {
        toast({ title: "Error", description: result.error, variant: "destructive" });
      } else if (result?.success) {
        router.push(result.redirectTo || redirectTo);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMagicLoading(true);
    const formData = new FormData(e.currentTarget);
    try {
      const result = await signInWithMagicLink(formData);
      if (result?.error) {
        toast({ title: "Error", description: result.error, variant: "destructive" });
      } else {
        toast({
          title: "Check your email",
          description: result?.message ?? "We sent you a magic link.",
        });
      }
    } finally {
      setMagicLoading(false);
    }
  }

  async function handleGoogle() {
    setOauthLoading(true);
    try {
      const result = await signInWithOAuth("google");
      if (result?.error) {
        toast({
          title: "Google sign-in unavailable",
          description: result.error,
          variant: "destructive",
        });
        return;
      }
      if (result?.url) {
        window.location.href = result.url;
      }
    } finally {
      setOauthLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex justify-center mb-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
              <Scissors className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-2xl font-semibold tracking-tight">Cut.</span>
          </Link>
        </div>

        <Card className="border-border/60 shadow-soft">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl tracking-tight">Welcome back</CardTitle>
            <CardDescription>Sign in to run your barbershop</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  aria-required="true"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  aria-required="true"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </CardFooter>
          </form>

          <div className="px-6 pb-6 space-y-3">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogle}
              disabled={oauthLoading}
            >
              {oauthLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting…
                </>
              ) : (
                "Continue with Google"
              )}
            </Button>

            <form onSubmit={handleMagicLink} className="space-y-2">
              <Input
                name="email"
                type="email"
                placeholder="Email for magic link"
                required
                autoComplete="email"
              />
              <Button
                type="submit"
                variant="ghost"
                className="w-full"
                disabled={magicLoading}
              >
                {magicLoading ? "Sending link…" : "Email me a magic link"}
              </Button>
            </form>

            <p className="text-sm text-muted-foreground text-center pt-2">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="text-primary hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
