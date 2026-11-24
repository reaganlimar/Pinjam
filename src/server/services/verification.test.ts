import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, setDriverForTesting, sql } from "../db";
import type { Driver } from "../db/database";
import { createTestDriver } from "@/test/pglite";
import { createAdmin, markVerified, pngFile, registerStudent, verifiedStudent } from "@/test/accounts";
import { setOcrProviderForTesting, type OcrProvider } from "../verification/ocr";
import {
  adminOverview,
  decideSubmission,
  deleteSubmissionImage,
  getMyVerification,
  getSubmissionForAdmin,
  listSubmissions,
  purgeExpiredIdImages,
  readSubmissionImage,
  rerunOcr,
  runOcrForSubmission,
  submitVerification,
} from "./verification";
import { browseItems, createItem, getItem } from "./items";
import { requestLoan, transitionLoan } from "./loans";
import { listNotifications } from "./notifications";
import { readImage } from "../storage";
import { AppError } from "../errors";
import { todayDateOnly } from "@/lib/format";

let driver: Driver;
let close: () => Promise<void>;

beforeEach(async () => {
  const test = await createTestDriver();
  driver = test.driver;
  setDriverForTesting(driver);
  close = test.close;
  setOcrProviderForTesting(null); // OCR off unless a test turns it on
  delete process.env.ID_IMAGE_RETENTION_DAYS;
});
afterEach(async () => {
  setOcrProviderForTesting(undefined);
  setDriverForTesting(undefined);
  await close();
});

function details(n: number, overrides: Record<string, string> = {}) {
  return {
    fullName: `Student ${n}`,
    studentNumber: `2600${n}0000${n}`,
    university: "Binus University",
    consent: "on",
    ...overrides,
  };
}

const fakeOcr = (text: string): OcrProvider => ({ name: "fake", recognize: async () => ({ text, confidence: 91 }) });
const brokenOcr: OcrProvider = {
  name: "fake",
  recognize: async () => {
    throw new Error("engine crashed");
  },
};

async function userRow(id: number) {
  return getDb().one<{ verification_status: string; student_verified_at: string | null }>(
    sql`SELECT verification_status, student_verified_at FROM users WHERE id = ${id}`,
  );
}

async function submissionRow(id: number) {
  return getDb().one<Record<string, unknown>>(sql`SELECT * FROM verification_submissions WHERE id = ${id}`);
}

function calculator(ownerId: number) {
  return createItem(
    ownerId,
    { name: "Calculator", categoryId: "2", condition: "good", maxDays: "3", pricePerDay: "", pickupPoint: "Atrium" },
    [],
  );
}

describe("student submission", () => {
  it("creates a PENDING submission, stores the photo privately and updates the student's status", async () => {
    const s = await registerStudent(1);
    expect(s.verificationStatus).toBe("UNVERIFIED");
    const id = await submitVerification(s.id, details(1, { studentNumber: "2600-1000-01" }), pngFile());

    const row = await submissionRow(id);
    expect(row).toMatchObject({ status: "PENDING", student_number: "2600100001", ocr_status: "not_configured", reviewer_id: null });
    expect((await userRow(s.id)).verification_status).toBe("PENDING");
    const file = await readImage(String(row.id_image_key));
    expect(file).toMatchObject({ mime: "image/png", ownerId: s.id });
    expect(String(row.id_image_key)).toMatch(/^idcard\//);

    const mine = await getMyVerification(s.id);
    expect(mine).toMatchObject({ status: "PENDING", canSubmit: false, latest: { id, status: "PENDING" } });
  });

  it("prevents duplicate pending submissions, even when two arrive at once", async () => {
    const s = await registerStudent(1);
    await submitVerification(s.id, details(1), pngFile());
    await expect(submitVerification(s.id, details(1), pngFile())).rejects.toThrow(/already have a submission/);

    const t = await registerStudent(2);
    const results = await Promise.allSettled([
      submitVerification(t.id, details(2), pngFile()),
      submitVerification(t.id, details(2), pngFile()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const n = await getDb().one<{ n: number }>(sql`SELECT count(*) AS n FROM verification_submissions WHERE user_id = ${t.id}`);
    expect(n.n).toBe(1);
  });

  it("validates fields and the file signature, and leaves nothing behind on failure", async () => {
    const s = await registerStudent(1);
    await expect(submitVerification(s.id, details(1, { consent: "" }), pngFile())).rejects.toMatchObject({
      fieldErrors: { consent: expect.any(String) },
    });
    await expect(submitVerification(s.id, details(1, { studentNumber: "12" }), pngFile())).rejects.toMatchObject({
      fieldErrors: { studentNumber: expect.any(String) },
    });
    // A text file renamed to .png is rejected by its content, not its name.
    const fake = new File([Buffer.from("not really an image")], "card.png", { type: "image/png" });
    await expect(submitVerification(s.id, details(1), fake)).rejects.toMatchObject({ fieldErrors: { idPhoto: expect.any(String) } });

    const counts = await getDb().one<{ subs: number; files: number }>(sql`
      SELECT (SELECT count(*) FROM verification_submissions) AS subs, (SELECT count(*) FROM files) AS files`);
    expect(counts).toEqual({ subs: 0, files: 0 });
    expect((await userRow(s.id)).verification_status).toBe("UNVERIFIED");
  });

  it("doesn't let verified students or admins submit", async () => {
    const v = await verifiedStudent(1);
    await expect(submitVerification(v.id, details(1), pngFile())).rejects.toThrow(/already verified/);
    const admin = await createAdmin(driver);
    await expect(submitVerification(admin.id, details(9), pngFile())).rejects.toThrow(/Admin accounts/);
  });
});

describe("OCR assistance", () => {
  it("stores extracted fields and a clean comparison without changing the status", async () => {
    setOcrProviderForTesting(fakeOcr("BINUS UNIVERSITY\nSTUDENT 1\n2600100001"));
    const s = await registerStudent(1);
    const id = await submitVerification(s.id, details(1), pngFile());
    expect((await submissionRow(id)).ocr_status).toBe("pending");

    expect(await runOcrForSubmission(id)).toBe("completed");
    const row = await submissionRow(id);
    expect(row).toMatchObject({ status: "PENDING", ocr_status: "completed", ocr_provider: "fake", ocr_has_mismatch: false });
    expect(row.ocr_extracted).toMatchObject({ studentNumber: "2600100001" });
    expect((await userRow(s.id)).verification_status).toBe("PENDING"); // never auto-approved
  });

  it("flags mismatches for the admin", async () => {
    setOcrProviderForTesting(fakeOcr("UNIVERSITAS LAIN\nBUDI SANTOSO\n1906123456"));
    const s = await registerStudent(1);
    const id = await submitVerification(s.id, details(1), pngFile());
    await runOcrForSubmission(id);
    const admin = await createAdmin(driver);
    const detail = await getSubmissionForAdmin(admin.id, id);
    expect(detail.ocr.comparison?.fullName.result).toBe("mismatch");
    expect(detail.ocr.comparison?.studentNumber).toMatchObject({ result: "mismatch", extracted: "1906123456" });
    expect(detail.ocrHasMismatch).toBe(true);
    expect((await adminOverview(admin.id)).needsAttention).toBe(1);
  });

  it("falls back to manual review when OCR fails or is off, and the admin can still decide", async () => {
    setOcrProviderForTesting(brokenOcr);
    const s = await registerStudent(1);
    const id = await submitVerification(s.id, details(1), pngFile());
    expect(await runOcrForSubmission(id)).toBe("failed");
    expect(await submissionRow(id)).toMatchObject({ status: "PENDING", ocr_status: "failed", ocr_error: "engine crashed" });

    setOcrProviderForTesting(null);
    const t = await registerStudent(2);
    const id2 = await submitVerification(t.id, details(2), pngFile());
    expect(await runOcrForSubmission(id2)).toBe("not_configured");

    const admin = await createAdmin(driver);
    expect((await getSubmissionForAdmin(admin.id, id)).warnings.join(" ")).toMatch(/OCR couldn't read/);
    expect(await decideSubmission(admin.id, id, { decision: "approve" })).toBe("APPROVED");
    expect(await decideSubmission(admin.id, id2, { decision: "approve" })).toBe("APPROVED");
  });

  it("only admins can re-run OCR", async () => {
    setOcrProviderForTesting(fakeOcr("STUDENT 1"));
    const s = await registerStudent(1);
    const id = await submitVerification(s.id, details(1), pngFile());
    await expect(rerunOcr(s.id, id)).rejects.toMatchObject({ code: "forbidden" });
    const admin = await createAdmin(driver);
    expect(await rerunOcr(admin.id, id)).toBe("completed");
  });
});

describe("admin review", () => {
  it("approves: records reviewer and time, verifies the student and notifies them", async () => {
    const s = await registerStudent(1);
    const id = await submitVerification(s.id, details(1), pngFile());
    const admin = await createAdmin(driver);
    expect(await decideSubmission(admin.id, id, { decision: "approve", notes: "Checked against the photo" })).toBe("APPROVED");

    const row = await submissionRow(id);
    expect(row).toMatchObject({ status: "APPROVED", reviewer_id: admin.id, decision_reason: null, admin_notes: "Checked against the photo" });
    expect(String(row.reviewed_at)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const user = await userRow(s.id);
    expect(user.verification_status).toBe("APPROVED");
    expect(user.student_verified_at).not.toBeNull();
    expect((await listNotifications(s.id))[0]).toMatchObject({ type: "verification_approved", link: "/verification" });

    // Decisions are final: a second one is refused.
    await expect(decideSubmission(admin.id, id, { decision: "reject", reason: "Changed my mind" })).rejects.toThrow(/already reviewed/);
    const detail = await getSubmissionForAdmin(admin.id, id);
    expect(detail.reviewer?.id).toBe(admin.id);
    expect(detail.events.map((e) => e.action)).toEqual(["submitted", "approved"]);
  });

  it("rejects with a required reason, shows it to the student, and allows resubmission", async () => {
    const s = await registerStudent(1);
    const id = await submitVerification(s.id, details(1), pngFile());
    const admin = await createAdmin(driver);
    await expect(decideSubmission(admin.id, id, { decision: "reject" })).rejects.toMatchObject({
      fieldErrors: { reason: expect.any(String) },
    });
    await decideSubmission(admin.id, id, { decision: "reject", reason: "The name on the card doesn't match." });

    const mine = await getMyVerification(s.id);
    expect(mine).toMatchObject({
      status: "REJECTED",
      canSubmit: true,
      latest: { status: "REJECTED", decisionReason: "The name on the card doesn't match." },
    });
    const again = await submitVerification(s.id, details(1), pngFile());
    expect((await getMyVerification(s.id)).latest).toMatchObject({ id: again, status: "PENDING", decisionReason: null });
    expect((await getSubmissionForAdmin(admin.id, again)).history.map((h) => h.id)).toEqual([id]);
  });

  it("requests a resubmission with an explanation", async () => {
    const s = await registerStudent(1);
    const id = await submitVerification(s.id, details(1), pngFile());
    const admin = await createAdmin(driver);
    await decideSubmission(admin.id, id, { decision: "request_resubmission", reason: "The photo is blurry. Please retake it." });
    expect(await getMyVerification(s.id)).toMatchObject({
      status: "RESUBMISSION_REQUIRED",
      canSubmit: true,
      latest: { decisionReason: "The photo is blurry. Please retake it." },
    });
    expect((await listNotifications(s.id))[0].type).toBe("verification_resubmission");
  });

  it("won't verify two accounts with the same student ID number", async () => {
    const a = await registerStudent(1);
    const b = await registerStudent(2);
    const first = await submitVerification(a.id, details(1, { studentNumber: "2602000001" }), pngFile());
    const second = await submitVerification(b.id, details(2, { studentNumber: "2602000001" }), pngFile());
    const admin = await createAdmin(driver);
    expect((await getSubmissionForAdmin(admin.id, second)).warnings.join(" ")).toMatch(/also on another account/);
    await decideSubmission(admin.id, first, { decision: "approve" });
    await expect(decideSubmission(admin.id, second, { decision: "approve" })).rejects.toThrow(/already verified with this student ID/);
    expect((await userRow(b.id)).verification_status).toBe("PENDING");
  });

  it("lists, filters and searches submissions, and counts the overview", async () => {
    const admin = await createAdmin(driver);
    const ids: number[] = [];
    for (const n of [1, 2, 3]) ids.push(await submitVerification((await registerStudent(n)).id, details(n), pngFile()));
    await decideSubmission(admin.id, ids[0], { decision: "approve" });
    await decideSubmission(admin.id, ids[1], { decision: "reject", reason: "Not a student card." });
    await registerStudent(4); // never submitted

    expect((await listSubmissions(admin.id)).total).toBe(3);
    expect((await listSubmissions(admin.id, { status: "PENDING" })).rows.map((r) => r.id)).toEqual([ids[2]]);
    expect((await listSubmissions(admin.id, { q: "student2@binus" })).rows.map((r) => r.id)).toEqual([ids[1]]);
    expect((await listSubmissions(admin.id, { q: "2600-3000" })).rows.map((r) => r.id)).toEqual([ids[2]]);
    expect((await listSubmissions(admin.id, { q: "Student 1" })).rows.map((r) => r.id)).toEqual([ids[0]]);

    expect(await adminOverview(admin.id)).toMatchObject({ totalStudents: 4, verifiedStudents: 1, pending: 1, rejected: 1 });
  });
});

describe("admin-only access", () => {
  it("refuses every admin operation to students, verified or not", async () => {
    const s = await registerStudent(1);
    const id = await submitVerification(s.id, details(1), pngFile());
    const v = await verifiedStudent(2);
    for (const who of [s.id, v.id]) {
      for (const op of [
        () => adminOverview(who),
        () => listSubmissions(who),
        () => getSubmissionForAdmin(who, id),
        () => readSubmissionImage(who, id),
        () => decideSubmission(who, id, { decision: "approve" }),
        () => deleteSubmissionImage(who, id),
        () => purgeExpiredIdImages(who),
      ]) {
        await expect(op()).rejects.toMatchObject({ code: "forbidden" });
      }
    }
    expect((await userRow(s.id)).verification_status).toBe("PENDING");
  });

  it("serves the ID photo to admins only", async () => {
    const s = await registerStudent(1);
    const id = await submitVerification(s.id, details(1), pngFile());
    const admin = await createAdmin(driver);
    expect((await readSubmissionImage(admin.id, id))?.mime).toBe("image/png");
  });
});

describe("ID photo retention", () => {
  it("deletes reviewed photos after the retention period, never pending ones", async () => {
    process.env.ID_IMAGE_RETENTION_DAYS = "30";
    const admin = await createAdmin(driver);
    const reviewed = await submitVerification((await registerStudent(1)).id, details(1), pngFile());
    const pending = await submitVerification((await registerStudent(2)).id, details(2), pngFile());
    await decideSubmission(admin.id, reviewed, { decision: "approve" });

    expect(await purgeExpiredIdImages(admin.id)).toBe(0); // reviewed just now
    const later = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
    expect(await purgeExpiredIdImages(admin.id, later)).toBe(1);

    const row = await submissionRow(reviewed);
    expect(row).toMatchObject({ id_image_key: null, ocr_raw_text: null, status: "APPROVED" });
    expect(row.id_image_deleted_at).not.toBeNull();
    expect(await readSubmissionImage(admin.id, reviewed)).toBeNull();
    expect((await submissionRow(pending)).id_image_key).not.toBeNull();
    expect((await getDb().one<{ n: number }>(sql`SELECT count(*) AS n FROM files`)).n).toBe(1);
  });

  it("can delete a reviewed photo right away, and with retention 0 deletes it at decision time", async () => {
    const admin = await createAdmin(driver);
    const a = await submitVerification((await registerStudent(1)).id, details(1), pngFile());
    await expect(deleteSubmissionImage(admin.id, a)).rejects.toThrow(/Review the submission/);
    await decideSubmission(admin.id, a, { decision: "approve" });
    expect(await deleteSubmissionImage(admin.id, a)).toBe(true);
    expect((await submissionRow(a)).id_image_key).toBeNull();

    process.env.ID_IMAGE_RETENTION_DAYS = "0";
    const b = await submitVerification((await registerStudent(2)).id, details(2), pngFile());
    await decideSubmission(admin.id, b, { decision: "reject", reason: "Expired student card." });
    expect((await submissionRow(b)).id_image_key).toBeNull();
  });
});

describe("permissions by verification status", () => {
  it("lets unverified students browse but not borrow, list or approve", async () => {
    const lender = await verifiedStudent(1);
    const itemId = await calculator(lender.id);
    const pending = await registerStudent(2);
    await submitVerification(pending.id, details(2), pngFile());
    const fresh = await registerStudent(3);

    for (const u of [pending, fresh]) {
      expect((await browseItems({})).map((i) => i.id)).toContain(itemId);
      expect((await getItem(itemId)).name).toBe("Calculator");
      await expect(requestLoan(u.id, { itemId, startDate: todayDateOnly(), days: "1" })).rejects.toMatchObject({ code: "forbidden" });
      await expect(calculator(u.id)).rejects.toMatchObject({ code: "forbidden" });
    }
    await expect(requestLoan(pending.id, { itemId, startDate: todayDateOnly(), days: "1" })).rejects.toThrow(/being reviewed/);
    await expect(calculator(fresh.id)).rejects.toThrow(/Verify your student ID to list items/);
  });

  it("lets verified students borrow, list and approve, and blocks approval by an unverified lender", async () => {
    const lender = await verifiedStudent(1);
    const borrower = await verifiedStudent(2);
    const itemId = await calculator(lender.id);
    const loanId = await requestLoan(borrower.id, { itemId, startDate: todayDateOnly(), days: "1" });

    // If the lender's verification is withdrawn (e.g. a legacy unverified owner), approving is locked
    // but declining still works, so requests never get stuck.
    await getDb().run(sql`UPDATE users SET verification_status = 'UNVERIFIED' WHERE id = ${lender.id}`);
    await expect(transitionLoan(loanId, lender.id, "approve")).rejects.toThrow(/approve borrowing requests/);
    await markVerified(lender.id);
    expect(await transitionLoan(loanId, lender.id, "approve")).toBe("approved");
  });

  it("gives admins the verified capabilities", async () => {
    const admin = await createAdmin(driver);
    const lender = await verifiedStudent(1);
    const itemId = await calculator(lender.id);
    expect(await calculator(admin.id)).toBeGreaterThan(0);
    expect(await requestLoan(admin.id, { itemId, startDate: todayDateOnly(), days: "1" })).toBeGreaterThan(0);
  });

  it("the admin check reads the database, not a stale session", async () => {
    const admin = await createAdmin(driver);
    await getDb().run(sql`UPDATE users SET role = 'STUDENT', nim = '2600999999' WHERE id = ${admin.id}`);
    await expect(adminOverview(admin.id)).rejects.toBeInstanceOf(AppError);
  });
});
