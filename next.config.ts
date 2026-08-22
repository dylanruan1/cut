import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

/**
 * Content-Security-Policy.
 *
 * Scoped to what Cut genuinely loads: Stripe for checkout, Sentry for error
 * reporting, Supabase for auth/data. 'unsafe-inline'/'unsafe-eval' on scripts
 * are required by the Next.js runtime — tightening those needs a nonce-based
 * CSP, which is a larger change.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com https://*.stripe.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://*.sentry.io",
  // Sentry Session Replay compresses in a blob-backed Web Worker.
  "worker-src 'self' blob:",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://connect.stripe.com",
  // Checkout and Connect onboarding are reached by redirecting out of a form
  // submission. Chrome applies form-action to those redirects, so Stripe has
  // to be listed here or deposits and payouts break.
  "form-action 'self' https://checkout.stripe.com https://connect.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Stop the browser guessing content types (MIME-sniffing attacks).
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Nobody should be framing a booking or payment page.
          { key: "X-Frame-Options", value: "DENY" },
          // Don't leak full URLs (which contain manage/queue tokens) to
          // third-party sites when a customer follows an outbound link.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // We never use these; deny them outright.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          // Force HTTPS for a year, including subdomains.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value: CSP,
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "cut-xo",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
