import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setDriverForTesting } from "../db";
import { createTestDriver } from "@/test/pglite";
import { createItem, deleteItem, getItem } from "./items";
import { requestLoan, transitionLoan, getLoanForUser, markFeeReceived } from "./loans";
import { listNotifications, unreadCount } from "./notifications";
import { createReview } from "./reviews";
import { registerUser } from "./users";
import { addDays, todayDateOnly } from "@/lib/format";
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

function student(n: number) {
  return registerUser({
    fullName: `Student ${n}`,
    nim: `2600${n}0000${n}`,
    email: `student${n}@binus.ac.id`,
    password: "password123",
    agree: "on",
  });
}

function calculator(ownerId: number, price = 0) {
  return createItem(
    ownerId,
    {
      name: "Scientific Calculator",
      categoryId: "2",
      description: "Casio fx-991EX",
      condition: "good",
      maxDays: "3",
      pricePerDay: price ? String(price) : "",
      pickupPoint: "Atrium",
    },
    [],
  );
}

const today = todayDateOnly();

describe("borrowing workflow", () => {
  it("runs a free loan from request to completion with notifications", async () => {
    const [a, b] = [await student(1), await student(2)];
    const itemId = await calculator(a.id);
    const loanId = await requestLoan(b.id, { itemId, startDate: today, days: "2" });

    expect(await unreadCount(a.id)).toBe(1);
    expect((await listNotifications(a.id))[0].title).toBe("Student 2 requested your Scientific Calculator");

    expect(await transitionLoan(loanId, a.id, "approve")).toBe("approved");
    expect((await listNotifications(b.id))[0].type).toBe("loan_approved");
    expect(await transitionLoan(loanId, a.id, "mark_ready")).toBe("ready_for_pickup");
    expect(await transitionLoan(loanId, b.id, "confirm_pickup")).toBe("borrowed");
    expect((await getItem(itemId)).availability).toBe("borrowed");
    expect(await transitionLoan(loanId, b.id, "mark_returned")).toBe("return_pending");
    expect(await transitionLoan(loanId, a.id, "confirm_return")).toBe("completed");

    const { loan, events } = await getLoanForUser(loanId, b.id);
    expect(loan.startDate).toBe(today);
    expect(loan.endDate).toBe(addDays(today, 2));
    expect(loan.feeTotal).toBe(0);
    expect(loan.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(events.map((e) => e.toStatus)).toEqual([
      "pending",
      "approved",
      "ready_for_pickup",
      "borrowed",
      "return_pending",
      "completed",
    ]);
    expect((await getItem(itemId)).availability).toBe("available");

    await createReview(b.id, { loanId, rating: "5", comment: "Easy pickup" });
    expect((await getItem(itemId)).ownerRating).toBe(5);
    await expect(createReview(b.id, { loanId, rating: "4" })).rejects.toThrow(AppError);
  });

  it("rejects invalid transitions and wrong actors", async () => {
    const [a, b, c] = [await student(1), await student(2), await student(3)];
    const itemId = await calculator(a.id);
    const loanId = await requestLoan(b.id, { itemId, startDate: today, days: "1" });
    await expect(transitionLoan(loanId, b.id, "approve")).rejects.toThrow(/changed/);
    await expect(transitionLoan(loanId, c.id, "approve")).rejects.toThrow(AppError);
    await expect(transitionLoan(loanId, b.id, "confirm_pickup")).rejects.toThrow(AppError);
    await expect(transitionLoan(loanId, a.id, "confirm_return")).rejects.toThrow(AppError);
    await transitionLoan(loanId, a.id, "reject");
    await expect(transitionLoan(loanId, a.id, "approve")).rejects.toThrow(AppError);
  });

  it("prevents borrowing your own item, duplicates and too-long loans", async () => {
    const [a, b, c] = [await student(1), await student(2), await student(3)];
    const itemId = await calculator(a.id);
    await expect(requestLoan(a.id, { itemId, startDate: today, days: "1" })).rejects.toThrow(/own item/);
    await requestLoan(b.id, { itemId, startDate: today, days: "1" });
    await expect(requestLoan(b.id, { itemId, startDate: addDays(today, 5), days: "1" })).rejects.toThrow(/already have/);
    await expect(requestLoan(c.id, { itemId, startDate: today, days: "4" })).rejects.toThrow(AppError);
    await expect(requestLoan(c.id, { itemId, startDate: addDays(today, -1), days: "1" })).rejects.toThrow(AppError);
  });

  it("blocks overlapping reservations and auto-declines clashing requests on approval", async () => {
    const [a, b, c] = [await student(1), await student(2), await student(3)];
    const itemId = await calculator(a.id);
    const first = await requestLoan(b.id, { itemId, startDate: today, days: "3" });
    const clashing = await requestLoan(c.id, { itemId, startDate: addDays(today, 1), days: "1" });
    await transitionLoan(first, a.id, "approve");

    expect((await getLoanForUser(clashing, c.id)).loan.status).toBe("rejected");
    expect((await listNotifications(c.id))[0].type).toBe("loan_rejected");
    await expect(requestLoan(c.id, { itemId, startDate: addDays(today, 2), days: "1" })).rejects.toThrow(/already booked/);
    // Back-to-back (pickup on the other loan's return day) is allowed.
    const after = await requestLoan(c.id, { itemId, startDate: addDays(today, 3), days: "1" });
    expect(await transitionLoan(after, a.id, "approve")).toBe("approved");
  });

  it("approving two overlapping requests at the same time lets only one through", async () => {
    const [a, b, c] = [await student(1), await student(2), await student(3)];
    const itemId = await calculator(a.id);
    const one = await requestLoan(b.id, { itemId, startDate: today, days: "2" });
    const two = await requestLoan(c.id, { itemId, startDate: addDays(today, 1), days: "2" });
    const results = await Promise.allSettled([
      transitionLoan(one, a.id, "approve"),
      transitionLoan(two, a.id, "approve"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const statuses = [(await getLoanForUser(one, a.id)).loan.status, (await getLoanForUser(two, a.id)).loan.status];
    expect(statuses.sort()).toEqual(["approved", "rejected"]);
  });

  it("records paid loans without moving money", async () => {
    const [a, b] = [await student(1), await student(2)];
    const itemId = await calculator(a.id, 10000);
    await expect(requestLoan(b.id, { itemId, startDate: today, days: "2" })).rejects.toThrow(AppError);
    const loanId = await requestLoan(b.id, { itemId, startDate: today, days: "2", paymentMethod: "cash" });
    expect((await getLoanForUser(loanId, a.id)).loan.feeTotal).toBe(20000);
    await expect(markFeeReceived(loanId, a.id)).rejects.toThrow(/ready for pickup/);
    await transitionLoan(loanId, a.id, "approve");
    await transitionLoan(loanId, a.id, "mark_ready");
    await expect(markFeeReceived(loanId, b.id)).rejects.toThrow(AppError);
    await markFeeReceived(loanId, a.id);
    expect((await getLoanForUser(loanId, b.id)).loan.feeReceivedAt).not.toBeNull();
  });

  it("only lets owners delete idle listings and declines pending requests", async () => {
    const [a, b] = [await student(1), await student(2)];
    const itemId = await calculator(a.id);
    const pending = await requestLoan(b.id, { itemId, startDate: today, days: "1" });
    await expect(deleteItem(b.id, itemId)).rejects.toThrow(AppError);
    await deleteItem(a.id, itemId);
    expect((await getLoanForUser(pending, b.id)).loan.status).toBe("rejected");
    await expect(getItem(itemId)).rejects.toThrow(/could not be found/);
  });
});
