"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { acceptInvite } from "@/actions/auth";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const password = formData.get("password") as string;

    try {
      const result = await acceptInvite(token, name, password);
      if (result.error || !result.email) {
        toast({
          title: "Error",
          description: result.error ?? "Couldn't accept this invitation",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Sign in with the invited address, not one typed here: the account only
      // exists under the address the invitation was sent to. Anything else
      // returns no session, and middleware bounces them to /login seconds after
      // being told they were in.
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: result.email,
        password,
      });
      if (error) {
        // The account is real either way — say so, and send them somewhere
        // that works instead of a dashboard they have no session for.
        toast({
          title: "Account created",
          description: "Sign in with your email to join the team.",
        });
        router.push("/login");
        return;
      }

      toast({ title: "Welcome!", description: "Your account has been created" });
      router.push("/dashboard");
    } catch {
      // A server action that throws leaves the button on "Creating account…"
      // with nothing said.
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="text-center">
          <CardTitle>Join the team</CardTitle>
          <CardDescription>
            Your account uses the email address this invitation was sent to.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required minLength={8} />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : "Accept invitation"}
            </Button>
            <Link href="/login" className="text-sm text-primary hover:underline">
              Already have an account? Sign in
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
