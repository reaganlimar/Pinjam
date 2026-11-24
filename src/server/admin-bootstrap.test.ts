import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, setDriverForTesting, sql } from "./db";
import type { Driver } from "./db/database";
import { createTestDriver } from "@/test/pglite";
import { registerStudent } from "@/test/accounts";
import { createSession, findUserBySession, registerUser, sessionLifetimeMs, verifyCredentials } from "./services/users";
// Plain ESM module shared with scripts/bootstrap-admin.mjs.
import { bootstrapAdmin, DEFAULT_ADMIN_EMAIL, generatePassword } from "../../scripts/bootstrap-admin-core.mjs";

let driver: Driver;
let close: () => Promise<void>;

beforeEach(async () => {
  const test = await createTestDriver();
  driver = test.driver;
  setDriverForTesting(driver);
  close = test.close;
});
afterEach(async () => {
  setDriverForTesting(undefined);
  await close();
});

const userRow = (email: string) =>
  getDb().one<{ id: number; role: string; nim: string | null; password_hash: string }>(
    sql`SELECT id, role, nim, password_hash FROM users WHERE email = ${email}`,
  );

describe("admin bootstrap", () => {
  it("creates an admin with a strong random password stored only as a bcrypt hash", async () => {
    const result = await bootstrapAdmin(driver, {});
    expect(result).toMatchObject({ status: "created", email: DEFAULT_ADMIN_EMAIL });
    expect(result.password).toMatch(/^[A-Za-z0-9_-]{24}$/);

    const row = await userRow(DEFAULT_ADMIN_EMAIL);
    expect(row).toMatchObject({ role: "ADMIN", nim: null });
    expect(row.password_hash).toMatch(/^\$2[aby]\$10\$/); // same cost as student sign-up
    // The plaintext password appears nowhere in the database row.
    const dump = await getDb().one<{ t: string }>(sql`SELECT u::text AS t FROM users u WHERE id = ${row.id}`);
    expect(dump.t).not.toContain(result.password);

    // It signs in through the normal login.
    const admin = await verifyCredentials({ email: DEFAULT_ADMIN_EMAIL, password: result.password });
    expect(admin).toMatchObject({ role: "ADMIN", isAdmin: true, nim: null });
  });

  it("is idempotent and never overwrites an existing admin's password", async () => {
    const first = await bootstrapAdmin(driver, { email: "Ops@Example.com" });
    const before = (await userRow("ops@example.com")).password_hash;
    const second = await bootstrapAdmin(driver, { email: "ops@example.com" });
    expect(second).toEqual({ status: "exists", userId: first.userId, email: "ops@example.com" });
    expect((await userRow("ops@example.com")).password_hash).toBe(before);
    const n = await getDb().one<{ n: number }>(sql`SELECT count(*) AS n FROM users WHERE role = 'ADMIN'`);
    expect(n.n).toBe(1);
  });

  it("refuses to promote a student account", async () => {
    const student = await registerStudent(1);
    await expect(bootstrapAdmin(driver, { email: student.email })).rejects.toMatchObject({ code: "student_conflict" });
    expect((await userRow(student.email)).role).toBe("STUDENT");
  });

  it("rotates only on request, invalidating the old password and sessions", async () => {
    const first = await bootstrapAdmin(driver, {});
    const { token } = await createSession(first.userId);
    const rotated = await bootstrapAdmin(driver, { rotate: true });
    expect(rotated.status).toBe("rotated");
    expect(rotated.password).not.toBe(first.password);
    await expect(verifyCredentials({ email: DEFAULT_ADMIN_EMAIL, password: first.password })).rejects.toThrow(/incorrect/);
    await expect(verifyCredentials({ email: DEFAULT_ADMIN_EMAIL, password: rotated.password })).resolves.toBeTruthy();
    expect(await findUserBySession(token)).toBeNull();
    await expect(bootstrapAdmin(driver, { email: "nobody@example.com", rotate: true })).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects bad emails, and passwords are unique", async () => {
    await expect(bootstrapAdmin(driver, { email: "not-an-email" })).rejects.toMatchObject({ code: "invalid_email" });
    expect(new Set(Array.from({ length: 50 }, generatePassword)).size).toBe(50);
  });
});

describe("roles at sign-up and sign-in", () => {
  it("new accounts are always students, whatever the form sends", async () => {
    const user = await registerUser({
      fullName: "Sneaky Student",
      nim: "2602999999",
      email: "sneaky@binus.ac.id",
      password: "password123",
      agree: "on",
      role: "ADMIN",
    });
    expect(user).toMatchObject({ role: "STUDENT", isAdmin: false, verificationStatus: "UNVERIFIED" });
  });

  it("admin sessions are short-lived", () => {
    expect(sessionLifetimeMs("ADMIN")).toBe(12 * 60 * 60 * 1000);
    expect(sessionLifetimeMs("STUDENT")).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("the database refuses a student without a NIM", async () => {
    await expect(
      getDb().run(sql`INSERT INTO users (email, password_hash, full_name, nim) VALUES ('x@binus.ac.id', 'x', 'No Nim', NULL)`),
    ).rejects.toThrow();
  });
});
