import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center animate-fade-in">
        <CardHeader>
          <div className="mx-auto h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-2">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Verify your email</CardTitle>
          <CardDescription>
            We sent a verification link to your email address. Click the link to activate your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Didn&apos;t receive the email? Check your spam folder or contact support.
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Button asChild>
            <Link href="/login">Back to sign in</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
