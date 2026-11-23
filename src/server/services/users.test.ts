import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, setDriverForTesting, sql } from "../db";
import { createTestDriver } from "@/test/pglite";
import {
  changePassword,
  createSession,
  deleteSession,
  findUserBySession,
  registerUser,
  verifyCredentials,
} from "./users";
import { readImage, saveImage } from "../storage";
import { AppError } from "../errors";

let close: () => Promise<void>;

beforeEach(async () => {
  const test = await createTestDriver();
  setDriverForTesting(test.driver);
  close = test.close;
});
afterEach(async () => {
  setDriverForTesting(undefined);
  await close();
});

const alya = {
  fullName: "Alya Putri",
  nim: "2602000001",
  email: "Alya.Putri@BINUS.ac.id",
  password: "pinjam-test-123",
  agree: "on",
};

describe("registration and sign-in", () => {
  it("creates a user with a bcrypt hash and a lower-cased email", async () => {
    const user = await registerUser(alya);
    expect(user.email).toBe("alya.putri@binus.ac.id");
    const row = await getDb().one<{ password_hash: string }>(sql`SELECT password_hash FROM users WHERE id = ${user.id}`);
    expect(row.password_hash).toMatch(/^\$2[aby]\$10\$/);
    expect(row.password_hash).not.toContain("pinjam-test-123");
  });

  it("rejects duplicate emails (any case) and duplicate NIMs with field errors", async () => {
    await registerUser(alya);
    const dupEmail = registerUser({ ...alya, nim: "2602000099", email: "alya.putri@binus.ac.id" });
    await expect(dupEmail).rejects.toMatchObject({ fieldErrors: { email: "This email is already registered." } });
    const dupNim = registerUser({ ...alya, email: "someone.else@binus.ac.id" });
    await expect(dupNim).rejects.toMatchObject({ fieldErrors: { nim: "This student ID is already registered." } });
    const count = await getDb().one<{ n: number }>(sql`SELECT count(*) AS n FROM users`);
    expect(count.n).toBe(1);
  });

  it("enforces uniqueness even when two sign-ups race", async () => {
    const results = await Promise.allSettled([registerUser(alya), registerUser(alya)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(AppError);
  });

  it("rejects non-university emails and missing agreement", async () => {
    await expect(registerUser({ ...alya, email: "alya@gmail.com" })).rejects.toMatchObject({
      fieldErrors: { email: expect.stringContaining("@binus.ac.id") },
    });
    await expect(registerUser({ ...alya, agree: undefined })).rejects.toMatchObject({
      fieldErrors: { agree: "Please agree to the lending rules." },
    });
  });

  it("signs in with the right password only, and sessions resolve to the user", async () => {
    const user = await registerUser(alya);
    await expect(verifyCredentials({ email: alya.email, password: "wrong-password" })).rejects.toThrow(/incorrect/);
    const signedIn = await verifyCredentials({ email: "alya.putri@binus.ac.id", password: alya.password });
    expect(signedIn.id).toBe(user.id);

    const { token } = await createSession(user.id);
    expect((await findUserBySession(token))?.id).toBe(user.id);
    expect(await findUserBySession("not-a-token")).toBeNull();
    await deleteSession(token);
    expect(await findUserBySession(token)).toBeNull();
  });

  it("changing the password signs out other sessions", async () => {
    const user = await registerUser(alya);
    const keep = await createSession(user.id);
    const other = await createSession(user.id);
    await changePassword(
      user.id,
      { currentPassword: alya.password, newPassword: "new-password-456", confirmPassword: "new-password-456" },
      keep.token,
    );
    expect(await findUserBySession(keep.token)).not.toBeNull();
    expect(await findUserBySession(other.token)).toBeNull();
    await expect(verifyCredentials({ email: alya.email, password: "new-password-456" })).resolves.toBeTruthy();
  });

  it("stores the student ID card in Postgres in the same transaction", async () => {
    const png = new File([Buffer.from("89504e470d0a1a0a0000000d49484452", "hex")], "card.png", { type: "image/png" });
    const user = await registerUser(alya, (userId, db) => saveImage(png, "idcard", userId, db));
    expect(user.hasStudentIdCard).toBe(true);
    const row = await getDb().one<{ student_id_card_key: string }>(
      sql`SELECT student_id_card_key FROM users WHERE id = ${user.id}`,
    );
    const file = await readImage(row.student_id_card_key);
    expect(file?.mime).toBe("image/png");
    expect(file?.ownerId).toBe(user.id);
  });
});
