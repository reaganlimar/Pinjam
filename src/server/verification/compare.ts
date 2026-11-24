import type { FieldCheck, FieldResult, OcrComparison } from "@/lib/verification";

/**
 * Turns raw OCR text from a student ID photo into extracted fields, and compares them
 * with what the student typed. Pure and deterministic so it can be unit-tested.
 *
 * This only *assists* an admin. A "match" means the typed text appears on the photo;
 * it does not prove the card is genuine or belongs to the uploader.
 */

export type SubmittedFields = { fullName: string; studentNumber: string; university: string };

export type OcrAnalysis = {
  extracted: { fullName: string | null; studentNumber: string | null; university: string | null };
  comparison: OcrComparison;
  /** True when any field is not a clean match, so the admin should look closely. */
  hasMismatch: boolean;
};

/** Upper-case, strip accents, keep letters/digits, single spaces. */
export function normalise(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Student numbers are compared without spaces, dashes or dots. */
export function normaliseStudentNumber(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Edits we forgive when matching one word, by word length (OCR misreads a letter or two). */
const allowedEdits = (len: number) => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

/** How well `word` appears among `candidates`: 1 exact, 0.75 within allowed edits, else 0. */
function wordScore(word: string, candidates: string[]): number {
  if (candidates.includes(word)) return 1;
  const edits = allowedEdits(word.length);
  if (edits && candidates.some((c) => Math.abs(c.length - word.length) <= edits && levenshtein(c, word) <= edits)) {
    return 0.75;
  }
  return 0;
}

const UNIVERSITY_WORDS = new Set([
  "UNIVERSITY", "UNIVERSITAS", "UNIV", "INSTITUTE", "INSTITUT", "INSTITUTO", "POLITEKNIK", "POLYTECHNIC",
  "COLLEGE", "SEKOLAH", "TINGGI", "ACADEMY", "AKADEMI", "OF", "THE", "DE", "AND", "DAN",
]);
const NAME_LABELS = /^(NAME|NAMA|NAMA LENGKAP|FULL NAME|STUDENT NAME)\b/;

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => normalise(l))
    .filter((l) => l.length >= 2);
}

function scoreToResult(score: number, allExact: boolean, hasText: boolean): FieldResult {
  if (!hasText) return "not_found";
  if (allExact) return "match";
  if (score >= 0.6) return "partial";
  return "mismatch";
}

/** Best line for a set of words, by how many of them it contains. */
function bestLine(textLines: string[], words: string[]): { line: string | null; overlap: number } {
  let best: { line: string | null; overlap: number } = { line: null, overlap: 0 };
  for (const line of textLines) {
    const lineWords = line.split(" ");
    const overlap = words.reduce((sum, w) => sum + wordScore(w, lineWords), 0);
    if (overlap > best.overlap) best = { line, overlap };
  }
  return best;
}

function compareName(submitted: string, textLines: string[], allWords: string[]): FieldCheck {
  const words = normalise(submitted).split(" ").filter((w) => w.length >= 2);
  const scores = words.map((w) => wordScore(w, allWords));
  const score = words.length ? scores.reduce((a, b) => a + b, 0) / words.length : 0;
  let extracted = bestLine(textLines, words).line;
  if (!extracted || score === 0) {
    // Fall back to the text after a "Name:" label, if the card has one.
    const i = textLines.findIndex((l) => NAME_LABELS.test(l));
    if (i >= 0) {
      const rest = textLines[i].replace(NAME_LABELS, "").trim();
      extracted = rest || textLines[i + 1] || null;
    } else if (score === 0) {
      extracted = null;
    }
  }
  return {
    submitted,
    extracted,
    score: round(score),
    result: scoreToResult(score, words.length > 0 && scores.every((s) => s === 1), textLines.length > 0),
  };
}

/** Common OCR confusions inside a token that is otherwise digits (O→0, I→1, S→5, B→8…). */
function digitsFromToken(token: string): string | null {
  const digitCount = (token.match(/\d/g) ?? []).length;
  const digitLike = (token.match(/[\dOQDILSBZ|]/g) ?? []).length;
  if (digitCount < 2 || digitLike / token.length < 0.8) return null;
  return token.replace(/[OQD]/g, "0").replace(/[IL|]/g, "1").replace(/S/g, "5").replace(/B/g, "8").replace(/Z/g, "2").replace(/\D/g, "");
}

function numberCandidates(text: string): string[] {
  const tokens = text.toUpperCase().split(/[\s:]+/).map((t) => t.replace(/[^A-Z0-9|]/g, "")).filter(Boolean);
  const found = new Set<string>();
  const digitTokens: (string | null)[] = tokens.map(digitsFromToken);
  digitTokens.forEach((d, i) => {
    if (d && d.length >= 4) found.add(d);
    // Numbers printed in groups ("2602 0000 01") are joined back together.
    let joined = d ?? "";
    for (let j = i + 1; d && j < digitTokens.length && digitTokens[j]; j++) {
      joined += digitTokens[j];
      if (joined.length >= 4 && joined.length <= 30) found.add(joined);
    }
  });
  // Alphanumeric IDs (some universities use letters), kept as-is.
  for (const t of tokens) if (t.length >= 4 && /\d/.test(t) && /[A-Z]/.test(t)) found.add(t.replace(/\|/g, "1"));
  return [...found];
}

function compareStudentNumber(submitted: string, rawText: string, hasText: boolean): FieldCheck {
  const target = normaliseStudentNumber(submitted);
  const candidates = numberCandidates(rawText);
  if (!hasText || candidates.length === 0) {
    return { submitted, extracted: null, result: "not_found", score: 0 };
  }
  let best = { value: candidates[0], distance: Infinity };
  for (const c of candidates) {
    const d = levenshtein(c, target);
    if (d < best.distance || (d === best.distance && c.length > best.value.length)) best = { value: c, distance: d };
  }
  const score = Math.max(0, 1 - best.distance / Math.max(target.length, 1));
  const result: FieldResult = best.distance === 0 ? "match" : best.distance <= 1 && target.length >= 6 ? "partial" : "mismatch";
  return { submitted, extracted: best.value, result, score: round(score) };
}

function compareUniversity(submitted: string, textLines: string[], allWords: string[]): FieldCheck {
  const all = normalise(submitted).split(" ").filter((w) => w.length >= 2);
  const significant = all.filter((w) => !UNIVERSITY_WORDS.has(w));
  const words = significant.length ? significant : all;
  const scores = words.map((w) => wordScore(w, allWords));
  const score = words.length ? scores.reduce((a, b) => a + b, 0) / words.length : 0;
  const byOverlap = bestLine(textLines, words);
  const extracted =
    (byOverlap.overlap > 0 ? byOverlap.line : null) ??
    textLines.find((l) => l.split(" ").some((w) => UNIVERSITY_WORDS.has(w) && w.length > 3)) ??
    null;
  return {
    submitted,
    extracted,
    score: round(score),
    result: scoreToResult(score, words.length > 0 && scores.every((s) => s === 1), textLines.length > 0),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

export function analyseOcrText(rawText: string, submitted: SubmittedFields): OcrAnalysis {
  const textLines = lines(rawText);
  const allWords = textLines.flatMap((l) => l.split(" "));
  const hasText = textLines.length > 0;
  const comparison: OcrComparison = {
    fullName: compareName(submitted.fullName, textLines, allWords),
    studentNumber: compareStudentNumber(submitted.studentNumber, rawText, hasText),
    university: compareUniversity(submitted.university, textLines, allWords),
  };
  return {
    extracted: {
      fullName: comparison.fullName.extracted,
      studentNumber: comparison.studentNumber.extracted,
      university: comparison.university.extracted,
    },
    comparison,
    hasMismatch: Object.values(comparison).some((c) => c.result !== "match"),
  };
}
