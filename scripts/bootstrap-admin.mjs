#!/usr/bin/env node
// Creates the initial Pinjam admin account in the database in DATABASE_URL (server-side only).
//
//   npm run admin:bootstrap                               create admin@pinjam.local (or ADMIN_EMAIL)
//   npm run admin:bootstrap -- --email you@example.com    create an admin with this email
//   npm run admin:bootstrap -- --email you@example.com --rotate
//                                                        replace that admin's password (signs it out everywhere)
//
// Env: ADMIN_EMAIL, ADMIN_NAME (default "Pinjam Admin"), APP_URL (for the printed login link).
//
// Idempotent: if the admin already exists, nothing changes and no password is printed.
// If the email belongs to a student, it stops without promoting anyone.
// The generated password is printed ONCE to this terminal. It is stored only as a bcrypt
// hash; it is never written to a file, a log, or the database in plaintext.
import pg from "pg";
import { bootstrapAdmin, BootstrapError, DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_NAME } from "./bootstrap-admin-core.mjs";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Put your Neon connection string in .env.local (see .env.example).");
  process.exit(1);
}

// Empty values (e.g. `ADMIN_EMAIL=` copied from .env.example) fall back to the defaults.
const email = arg("--email") || process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
const fullName = arg("--name") || process.env.ADMIN_NAME || DEFAULT_ADMIN_NAME;
const rotate = process.argv.includes("--rotate");
const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

const client = new pg.Client({ connectionString: url });
const db = {
  async transaction(fn) {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }
  },
};

try {
  await client.connect();
  console.log(`Connected to ${new URL(url).hostname}`);
  const result = await bootstrapAdmin(db, { email, fullName, rotate });

  if (result.status === "exists") {
    console.log(`\nAn admin account for ${result.email} already exists (user ${result.userId}).`);
    console.log("Nothing was changed and the password was NOT reset.");
    console.log("To set a new password: sign in and use Settings → Change password,");
    console.log(`or run: npm run admin:bootstrap -- --email ${result.email} --rotate`);
  } else {
    const heading = result.status === "created" ? "Initial Pinjam admin login credentials" : "New Pinjam admin password";
    console.log(`\n${"=".repeat(60)}`);
    console.log(heading);
    console.log("=".repeat(60));
    console.log(`  Email:     ${result.email}`);
    console.log(`  Password:  ${result.password}`);
    console.log(`  Login URL: ${appUrl}/login   (you'll be taken to ${appUrl}/admin)`);
    console.log("=".repeat(60));
    console.log("This password is shown once. Save it in a password manager now.");
    console.log("It is stored only as a bcrypt hash and can't be recovered, only rotated.");
    if (result.status === "rotated") console.log("All existing sessions for this admin were signed out.");
  }
} catch (err) {
  // BootstrapError messages explain what to do; anything else is a connection/SQL error.
  console.error(`\nAdmin NOT ${rotate ? "rotated" : "created"}: ${err.message}`);
  if (!(err instanceof BootstrapError)) console.error("Nothing was changed.");
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
