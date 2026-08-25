import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

/**
 * Fonts are loaded here rather than left to a system stack.
 *
 * The previous setup listed `-apple-system` / `SF Pro Display` first, so the app
 * looked correct on a Mac or iPhone and fell all the way back to Arial on
 * Android and Windows — where a large share of customers actually are. Loading
 * the font means every device sees the same thing.
 */
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

/** Used for money and times, where digits must not change width. */
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

// Fallback only — NEXT_PUBLIC_APP_URL should be set in every environment.
// Used as metadataBase, so getting it wrong makes social preview images
// resolve against the wrong host and silently fail to render.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://cutchair.com";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Cut. — Barbershop Scheduling",
    template: "%s · Cut.",
  },
  description:
    "Booking, walk-in queue, deposits, and an AI receptionist that answers the phone. Built for barbershops.",
  applicationName: "Cut.",
  openGraph: {
    type: "website",
    siteName: "Cut.",
    title: "Cut. — Barbershop Scheduling",
    description:
      "Booking, walk-in queue, deposits, and an AI receptionist that answers the phone.",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geist.variable} ${geistMono.variable} min-h-screen font-sans antialiased`}
      >
        {/* Keyboard and screen-reader users shouldn't have to tab through the
            whole sidebar on every page. Visible only when focused. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
