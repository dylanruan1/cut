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

    const result = await acceptInvite(token, name, password);
    if (result?.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
      setLoading(false);
      return;
    }

    const supabase = createClient();
    await supabase.auth.signInWithPassword({
      email: formData.get("email") as string,
      password,
    });

    toast({ title: "Welcome!", description: "Your account has been created" });
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="text-center">
          <CardTitle>Join the team</CardTitle>
          <CardDescription>Create your account to get started</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
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
