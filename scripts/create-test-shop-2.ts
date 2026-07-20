#!/usr/bin/env npx tsx
/**
 * Development script: create "Test Shop 2" for multi-shop testing.
 * Usage: npx tsx scripts/create-test-shop-2.ts <user-email>
 *
 * Requires DATABASE_URL and Supabase env vars (same as the app).
 * Does not switch the user's active shop or modify Dev settings.
 */

import prisma from "../src/lib/db";
import {
  createDevTestShop2ForUser,
  listMembershipsForUser,
} from "../src/lib/barbershop";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx tsx scripts/create-test-shop-2.ts <user-email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  const memberships = await listMembershipsForUser(user.id);
  const result = await createDevTestShop2ForUser({
    id: user.id,
    name: user.name,
    email: user.email,
    memberships,
  });

  if ("error" in result) {
    console.error(result.error);
    process.exit(1);
  }

  console.log(
    result.created
      ? `Created "${result.shop.name}" (${result.shop.id}) for ${email}`
      : `"${result.shop.name}" already exists (${result.shop.id}) for ${email}`
  );
  console.log("Active shop was not changed. Use the shop switcher in the app to test.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
