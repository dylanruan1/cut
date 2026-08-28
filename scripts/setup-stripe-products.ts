#!/usr/bin/env npx tsx
/**
 * One-time setup script: creates Cut's three subscription products + monthly
 * prices in Stripe (whatever mode STRIPE_SECRET_KEY belongs to — test or live).
 *
 * Usage:
 *   npx tsx scripts/setup-stripe-products.ts
 *
 * Requires STRIPE_SECRET_KEY in .env.local (or already exported in the shell).
 * Idempotent: reruns find existing products/prices via metadata.cutPlan
 * instead of creating duplicates.
 *
 * This script does NOT write to .env.local — it only prints the price IDs
 * for you (or Cursor) to add.
 *
 * Optional overrides (cents), if you don't want the defaults:
 *   STRIPE_STARTER_AMOUNT_CENTS (default 3900 = $39/mo)
 *   STRIPE_PRO_AMOUNT_CENTS (default 9900 = $99/mo)
 *   STRIPE_AI_RECEPTIONIST_AMOUNT_CENTS (default 24900 = $249/mo)
 */

import fs from "fs";
import path from "path";
import Stripe from "stripe";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const contents = fs.readFileSync(envPath, "utf8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
if (!secretKey) {
  console.error(
    "STRIPE_SECRET_KEY is not set. Add it to .env.local first, then rerun."
  );
  process.exit(1);
}

const stripe = new Stripe(secretKey, { typescript: true });

type CutPlan = "STARTER" | "PRO" | "AI_RECEPTIONIST";

type PlanConfig = {
  cutPlan: CutPlan;
  name: string;
  description: string;
  amountCentsEnv: string;
  defaultAmountCents: number;
};

const PLANS: PlanConfig[] = [
  {
    cutPlan: "STARTER",
    name: "Cut — Starter",
    description:
      "Online booking, walk-in queue, calendar, clients, and deposits. For a solo barber.",
    amountCentsEnv: "STRIPE_STARTER_AMOUNT_CENTS",
    defaultAmountCents: 3900,
  },
  {
    cutPlan: "PRO",
    name: "Cut — Pro",
    description:
      "Everything in Starter, plus up to 6 barbers, team management and analytics.",
    amountCentsEnv: "STRIPE_PRO_AMOUNT_CENTS",
    defaultAmountCents: 9900,
  },
  {
    cutPlan: "AI_RECEPTIONIST",
    name: "Cut — AI Receptionist",
    description:
      "Everything in Pro, plus an AI that answers the shop phone 24/7 and books by voice.",
    amountCentsEnv: "STRIPE_AI_RECEPTIONIST_AMOUNT_CENTS",
    defaultAmountCents: 24900,
  },
];

async function findExistingProduct(
  cutPlan: string
): Promise<Stripe.Product | null> {
  const products = await stripe.products.list({ limit: 100, active: true });
  return products.data.find((p) => p.metadata?.cutPlan === cutPlan) ?? null;
}

async function findActiveMonthlyPrice(
  productId: string
): Promise<Stripe.Price | null> {
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 10,
  });
  return prices.data.find((p) => p.recurring?.interval === "month") ?? null;
}

async function main() {
  const mode = secretKey!.startsWith("sk_live") ? "LIVE MODE" : "test mode";
  console.log(`Using Stripe key in ${mode}\n`);

  const results: Record<CutPlan, string> = {
    STARTER: "",
    PRO: "",
    AI_RECEPTIONIST: "",
  };

  for (const plan of PLANS) {
    let product = await findExistingProduct(plan.cutPlan);
    if (product) {
      console.log(`Found existing product for ${plan.cutPlan}: ${product.id}`);
    } else {
      product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: { cutPlan: plan.cutPlan },
      });
      console.log(`Created product for ${plan.cutPlan}: ${product.id}`);
    }

    let price = await findActiveMonthlyPrice(product.id);
    if (price) {
      console.log(
        `Found existing monthly price for ${plan.cutPlan}: ${price.id}`
      );
    } else {
      const amount = Number(
        process.env[plan.amountCentsEnv] ?? plan.defaultAmountCents
      );
      price = await stripe.prices.create({
        product: product.id,
        currency: "usd",
        unit_amount: amount,
        recurring: { interval: "month" },
        metadata: { cutPlan: plan.cutPlan },
      });
      console.log(
        `Created $${(amount / 100).toFixed(2)}/mo price for ${plan.cutPlan}: ${price.id}`
      );
    }

    results[plan.cutPlan] = price.id;
  }

  console.log("\nAdd these lines to .env.local:\n");
  console.log(`STRIPE_STARTER_PRICE_ID=${results.STARTER}`);
  console.log(`STRIPE_PRO_PRICE_ID=${results.PRO}`);
  console.log(`STRIPE_AI_RECEPTIONIST_PRICE_ID=${results.AI_RECEPTIONIST}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
