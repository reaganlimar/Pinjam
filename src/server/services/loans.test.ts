import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase, setDbForTesting } from "../db";
import { registerUser } from "./users";
import { createItem, deleteItem, getItem } from "./items";
import { requestLoan, transitionLoan, getLoanForUser, markFeeReceived } from "./loans";
import { listNotifications, unreadCount } from "./notifications";
import { createReview } from "./reviews";
import { addDays, todayDateOnly } from "@/lib/format";
import { AppError } from "../errors";

async function student(n: number) {
  return registerUser(
    {
      fullName: `Student ${n}`,
      nim: `2600${n}0000${n}`,
      email: `student${n}@binus.ac.id`,
      password: "password123",
      agree: "on",
    },
    null,
  );
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
  let a: Awaited<ReturnType<typeof student>>;
  let b: Awaited<ReturnType<typeof student>>;
  let c: Awaited<ReturnType<typeof student>>;

  beforeEach(async () => {
    setDbForTesting(openDatabase(":memory:"));
    a = await student(1);
    b = await student(2);
    c = await student(3);
  });

  it("runs a free loan from request to completion with notifications", () => {
    const itemId = calculator(a.id);
    const loanId = requestLoan(b.id, { itemId, startDate: today, days: "2" });

    expect(unreadCount(a.id)).toBe(1);
    expect(listNotifications(a.id)[0].title).toBe("Student 2 requested your Scientific Calculator");

    expect(transitionLoan(loanId, a.id, "approve")).toBe("approved");
    expect(listNotifications(b.id)[0].type).toBe("loan_approved");
    expect(transitionLoan(loanId, a.id, "mark_ready")).toBe("ready_for_pickup");
    expect(transitionLoan(loanId, b.id, "confirm_pickup")).toBe("borrowed");
    expect(getItem(itemId).availability).toBe("borrowed");
    expect(transitionLoan(loanId, b.id, "mark_returned")).toBe("return_pending");
    expect(transitionLoan(loanId, a.id, "confirm_return")).toBe("completed");

    const { loan, events } = getLoanForUser(loanId, b.id);
    expect(loan.endDate).toBe(addDays(today, 2));
    expect(loan.feeTotal).toBe(0);
    expect(events.map((e) => e.toStatus)).toEqual([
      "pending",
      "approved",
      "ready_for_pickup",
      "borrowed",
      "return_pending",
      "completed",
    ]);
    expect(getItem(itemId).availability).toBe("available");

    createReview(b.id, { loanId, rating: "5", comment: "Easy pickup" });
    expect(getItem(itemId).ownerRating).toBe(5);
    expect(() => createReview(b.id, { loanId, rating: "4" })).toThrow(AppError);
  });

  it("rejects invalid transitions and wrong actors", () => {
    const itemId = calculator(a.id);
    const loanId = requestLoan(b.id, { itemId, startDate: today, days: "1" });
    expect(() => transitionLoan(loanId, b.id, "approve")).toThrow(/permission|changed/);
    expect(() => transitionLoan(loanId, c.id, "approve")).toThrow(AppError);
    expect(() => transitionLoan(loanId, b.id, "confirm_pickup")).toThrow(AppError);
    expect(() => transitionLoan(loanId, a.id, "confirm_return")).toThrow(AppError);
    transitionLoan(loanId, a.id, "reject");
    expect(() => transitionLoan(loanId, a.id, "approve")).toThrow(AppError);
  });

  it("prevents borrowing your own item, duplicates and too-long loans", () => {
    const itemId = calculator(a.id);
    expect(() => requestLoan(a.id, { itemId, startDate: today, days: "1" })).toThrow(/own item/);
    requestLoan(b.id, { itemId, startDate: today, days: "1" });
    expect(() => requestLoan(b.id, { itemId, startDate: addDays(today, 5), days: "1" })).toThrow(/already have/);
    expect(() => requestLoan(c.id, { itemId, startDate: today, days: "4" })).toThrow(AppError);
    expect(() => requestLoan(c.id, { itemId, startDate: addDays(today, -1), days: "1" })).toThrow(AppError);
  });

  it("blocks overlapping reservations and auto-declines clashing requests on approval", () => {
    const itemId = calculator(a.id);
    const first = requestLoan(b.id, { itemId, startDate: today, days: "3" });
    const clashing = requestLoan(c.id, { itemId, startDate: addDays(today, 1), days: "1" });
    transitionLoan(first, a.id, "approve");

    expect(getLoanForUser(clashing, c.id).loan.status).toBe("rejected");
    expect(listNotifications(c.id)[0].type).toBe("loan_rejected");
    expect(() => requestLoan(c.id, { itemId, startDate: addDays(today, 2), days: "1" })).toThrow(/already booked/);
    // Back-to-back (pickup on the other loan's return day) is allowed.
    const after = requestLoan(c.id, { itemId, startDate: addDays(today, 3), days: "1" });
    expect(transitionLoan(after, a.id, "approve")).toBe("approved");
  });

  it("records paid loans without moving money", () => {
    const itemId = calculator(a.id, 10000);
    expect(() => requestLoan(b.id, { itemId, startDate: today, days: "2" })).toThrow(AppError);
    const loanId = requestLoan(b.id, { itemId, startDate: today, days: "2", paymentMethod: "cash" });
    expect(getLoanForUser(loanId, a.id).loan.feeTotal).toBe(20000);
    expect(() => markFeeReceived(loanId, a.id)).toThrow(/ready for pickup/);
    transitionLoan(loanId, a.id, "approve");
    transitionLoan(loanId, a.id, "mark_ready");
    expect(() => markFeeReceived(loanId, b.id)).toThrow(AppError);
    markFeeReceived(loanId, a.id);
    expect(getLoanForUser(loanId, b.id).loan.feeReceivedAt).not.toBeNull();
  });

  it("only lets owners delete idle listings and declines pending requests", () => {
    const itemId = calculator(a.id);
    const pending = requestLoan(b.id, { itemId, startDate: today, days: "1" });
    expect(() => deleteItem(b.id, itemId)).toThrow(AppError);
    deleteItem(a.id, itemId);
    expect(getLoanForUser(pending, b.id).loan.status).toBe("rejected");
    expect(() => getItem(itemId)).toThrow(/could not be found/);
  });
});
