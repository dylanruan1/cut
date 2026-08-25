#!/usr/bin/env node
/**
 * Swaps the database password in .env and .env.local.
 *
 * Done as a script rather than by hand because the password sits inside a URL,
 * where characters like @ : / ? # & must be percent-encoded. Pasting a raw
 * password with an "@" in it produces a connection string that looks right and
 * fails with a confusing error about the host.
 *
 * The password arrives via the NEW_DB_PASSWORD environment variable rather than
 * an interactive prompt. An earlier version prompted from stdin and got the
 * terminal handling wrong — it swallowed the password and then read the user's
 * NEXT command as the password, writing "npx prisma db pull --force" into both
 * connection strings. Shell `read -s` is the tool that already does this
 * correctly, so this script leans on it instead of reimplementing it.
 *
 * Usage (works in both zsh and bash — `read -p` means something else in zsh,
 * so the prompt is printed separately):
 *
 *   printf "New database password: " && read -s P && echo && \
 *     NEW_DB_PASSWORD="$P" node scripts/update-db-password.mjs
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";

const FILES = [".env", ".env.local"];
const KEYS = ["DATABASE_URL", "DIRECT_URL"];

const password = process.env.NEW_DB_PASSWORD ?? "";

if (!password) {
  console.error("NEW_DB_PASSWORD is not set. Run this as one line:\n");
  console.error(
    '  printf "New database password: " && read -s P && echo && ' +
      'NEW_DB_PASSWORD="$P" node scripts/update-db-password.mjs'
  );
  process.exit(1);
}

/**
 * Refuse input that is obviously a shell command rather than a password.
 * This is exactly the failure that corrupted both files once already.
 */
const looksLikeCommand =
  /\s/.test(password) &&
  /^(npx|npm|node|git|prisma|cd|ls|rm|read)\b/.test(password.trim());

if (looksLikeCommand) {
  console.error(
    `Refusing to continue: that looks like a shell command, not a password.\n` +
      `Got: "${password.slice(0, 20)}..."`
  );
  process.exit(1);
}

if (password.length < 12) {
  console.error(
    `Refusing to continue: ${password.length} characters is too short. ` +
      `Let Supabase generate one.`
  );
  process.exit(1);
}

const encoded = encodeURIComponent(password);
if (encoded !== password) {
  console.log("Password contains characters needing URL-encoding — handled.");
}

/**
 * Replaces the password segment of a postgres URL.
 *
 * Anchored on the LAST "@", because a password may itself contain "@" —
 * splitting on the first one would corrupt the host.
 */
function replacePassword(url, encodedPassword) {
  const m = url.match(/^(postgres(?:ql)?:\/\/[^:/@]+:)(.*)(@[^@]+)$/);
  if (!m) return null;
  return `${m[1]}${encodedPassword}${m[3]}`;
}

let changed = 0;
for (const file of FILES) {
  if (!existsSync(file)) {
    console.log(`skip ${file} (not found)`);
    continue;
  }

  // Back up before writing. These files are gitignored, so a bad edit would
  // otherwise be unrecoverable.
  copyFileSync(file, `${file}.bak`);

  const lines = readFileSync(file, "utf8").split("\n");
  const next = lines.map((line) => {
    const key = KEYS.find((k) => line.startsWith(`${k}=`));
    if (!key) return line;

    const rawValue = line.slice(key.length + 1);
    const quote = rawValue.startsWith('"') ? '"' : "";
    const url = rawValue.replace(/^"|"$/g, "");
    const updated = replacePassword(url, encoded);

    if (!updated) {
      console.warn(`  ! ${file}: could not parse ${key}, left unchanged`);
      return line;
    }
    changed += 1;
    return `${key}=${quote}${updated}${quote}`;
  });

  writeFileSync(file, next.join("\n"));
  console.log(`updated ${file}  (backup at ${file}.bak)`);
}

console.log(`\n${changed} connection string(s) updated.`);
// NOT `prisma db pull` — that rewrites prisma/schema.prisma from the database,
// destroying every doc comment and @@map name, and it cannot represent the
// raw-SQL EXCLUDE constraint that prevents double bookings.
console.log(
  "Verify the connection with:\n" +
    `  node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();` +
    `p.\\$queryRaw\\\`select 1\\\`.then(()=>console.log('CONNECTED')).catch(e=>console.log('FAILED:',e.message))` +
    `.finally(()=>p.\\$disconnect())"`
);
console.log("Then update DATABASE_URL and DIRECT_URL in Vercel and redeploy.");
console.log("Once everything works:  rm -f .env.bak .env.local.bak");

// Printed so the value can be pasted into Vercel without re-encoding by hand.
if (encoded !== password) {
  console.log(
    `\nFor Vercel, the password must be pasted URL-encoded as:\n  ${encoded}`
  );
}
