"use client";

import { useState } from "react";
import Link from "next/link";
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
import { signUp } from "@/actions/auth";
import { startGoogleSignIn } from "@/lib/oauth-client";
import { toast } from "@/hooks/use-toast";

export default function SignUpPage() {
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    const result = await signUp(formData);
    setLoading(false);

    if (result?.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    } else {
      setSuccess(true);
      toast({ title: "Account created", description: result?.message });
    }
  }

  async function handleGoogle() {
    setOauthLoading(true);
    try {
      const result = await startGoogleSignIn("/dashboard");
      if (result?.error) {
        toast({
          title: "Google sign-up unavailable",
          description: result.error,
          variant: "destructive",
        });
        setOauthLoading(false);
      }
    } catch (err) {
      toast({
        title: "Google sign-up failed",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
      setOauthLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background">
        <Card className="w-full max-w-md text-center animate-fade-in border-border/60 shadow-soft">
          <CardHeader>
            <CardTitle>Check your email</CardTitle>
            <CardDescription>
              We sent you a verification link. Click it to activate your account, then
              set up your shop.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center gap-3">
            <Button asChild>
              <Link href="/login">Go to sign in</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/verify-email">Verify email help</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
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
            <CardTitle className="text-2xl tracking-tight">Create your account</CardTitle>
            <CardDescription>Set up your shop in under a minute</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Your name</Label>
                <Input id="name" name="name" placeholder="John Smith" required autoComplete="name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account…
                  </>
                ) : (
                  "Create account"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogle}
                disabled={oauthLoading}
              >
                {oauthLoading ? "Connecting…" : "Continue with Google"}
              </Button>
              <p className="text-sm text-muted-foreground text-center">
                Already have an account?{" "}
                <Link href="/login" className="text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
