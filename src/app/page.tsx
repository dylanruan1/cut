import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Scissors, Calendar, Phone, Shield, Zap } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-glass">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-primary flex items-center justify-center">
              <Scissors className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold">Cut.</span>
          </Link>
          <nav className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="container mx-auto px-4 py-24 text-center animate-fade-in">
          <h1 className="text-5xl md:text-7xl font-semibold tracking-tight text-balance max-w-4xl mx-auto">
            Scheduling for barbershops,{" "}
            <span className="text-primary">reimagined.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto text-balance">
            A beautiful, fast scheduling platform built for modern barbershops.
            Manage appointments, team, and clients — all in one place.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild>
              <Link href="/signup">Start free trial</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </section>

        <section className="container mx-auto px-4 py-16">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: Calendar,
                title: "Smart Calendar",
                description: "Day, week, and month views with drag-and-drop scheduling.",
              },
              {
                icon: Phone,
                title: "Phone Booking",
                description: "Customers book by phone with Twilio Voice integration.",
              },
              {
                icon: Zap,
                title: "SMS Reminders",
                description: "Automatic confirmations and reminders keep clients on track.",
              },
              {
                icon: Shield,
                title: "Team Management",
                description: "Invite barbers, manage roles, and control permissions.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border bg-card p-6 shadow-card hover:shadow-glass transition-shadow"
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Cut. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
