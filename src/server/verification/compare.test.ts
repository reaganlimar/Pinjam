import { describe, expect, it } from "vitest";
import { analyseOcrText, levenshtein, normaliseStudentNumber } from "./compare";

const submitted = { fullName: "Alya Putri", studentNumber: "2602000001", university: "Binus University" };

describe("OCR comparison", () => {
  it("matches a clean card", () => {
    const text = "BINUS UNIVERSITY\nSTUDENT CARD\nALYA PUTRI\n2602000001\nSchool of Computer Science\n";
    const a = analyseOcrText(text, submitted);
    expect(a.comparison.fullName.result).toBe("match");
    expect(a.comparison.studentNumber).toMatchObject({ result: "match", extracted: "2602000001" });
    expect(a.comparison.university.result).toBe("match");
    expect(a.extracted.fullName).toBe("ALYA PUTRI");
    expect(a.hasMismatch).toBe(false);
  });

  it("forgives typical OCR misreads but flags them as partial", () => {
    const text = "BlNUS UNIVERSITY\nALYA PUTR1\nNIM: 26O2OOOOO1";
    const a = analyseOcrText(text, submitted);
    expect(a.comparison.studentNumber.result).toBe("match"); // O→0 inside a digit token
    expect(a.comparison.fullName.result).toBe("partial");
    expect(a.comparison.university.result).toBe("partial");
    expect(a.hasMismatch).toBe(true);
  });

  it("joins student numbers printed in groups", () => {
    const a = analyseOcrText("ALYA PUTRI\n2602 0000 01\nBINUS UNIVERSITY", submitted);
    expect(a.comparison.studentNumber.result).toBe("match");
  });

  it("flags a different person and number as mismatches", () => {
    const a = analyseOcrText("UNIVERSITAS INDONESIA\nBUDI SANTOSO\n1906123456", submitted);
    expect(a.comparison.fullName.result).toBe("mismatch");
    expect(a.comparison.studentNumber.result).toBe("mismatch");
    expect(a.comparison.studentNumber.extracted).toBe("1906123456");
    expect(a.comparison.university.result).toBe("mismatch");
    expect(a.extracted.university).toBe("UNIVERSITAS INDONESIA");
    expect(a.hasMismatch).toBe(true);
  });

  it("reports not_found when the photo has no readable text", () => {
    const a = analyseOcrText("  \n \n", submitted);
    expect(Object.values(a.comparison).map((c) => c.result)).toEqual(["not_found", "not_found", "not_found"]);
    expect(a.extracted).toEqual({ fullName: null, studentNumber: null, university: null });
  });

  it("uses a Name: label when the name isn't found elsewhere", () => {
    const a = analyseOcrText("BINUS UNIVERSITY\nNAMA: SITI RAHMA\n2602000001", submitted);
    expect(a.comparison.fullName.result).toBe("mismatch");
    expect(a.extracted.fullName).toBe("SITI RAHMA");
  });

  it("helpers", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(normaliseStudentNumber(" 2602-0000.01 ")).toBe("2602000001");
  });
});
