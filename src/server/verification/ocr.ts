import "server-only";
import path from "node:path";

/**
 * OCR providers. OCR only helps an admin compare the photo with the typed details; it
 * never approves anyone, and verification works the same when OCR is off or fails.
 *
 * Choose with OCR_PROVIDER:
 *   tesseract (default)  open-source Tesseract (tesseract.js, Apache-2.0) running inside the
 *                        server function. Free, no API key, and the image never leaves the server.
 *   none                 OCR off: every submission goes straight to manual review.
 *
 * To add a hosted provider later (Google Vision, AWS Textract, Azure…), implement
 * `OcrProvider` and add a case to `providerFor`.
 */

export type OcrResult = {
  text: string;
  /** 0–100, or null when the provider doesn't report one. */
  confidence: number | null;
};

export interface OcrProvider {
  readonly name: string;
  recognize(image: Buffer): Promise<OcrResult>;
}

const DEFAULT_TIMEOUT_MS = 45_000;

function timeoutMs() {
  const n = Number(process.env.OCR_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

/** Tesseract via tesseract.js, with English data bundled from @tesseract.js-data/eng (no CDN download). */
export const tesseractProvider: OcrProvider = {
  name: "tesseract",
  async recognize(image) {
    // tesseract.js is CommonJS; depending on the loader its exports sit on `default`.
    const loaded = await import("tesseract.js");
    const { createWorker, OEM, PSM } = ((loaded as unknown as { default?: typeof loaded }).default ?? loaded) as typeof loaded;
    const langPath =
      process.env.OCR_LANG_PATH ||
      path.join(process.cwd(), "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int");
    // cacheMethod "none": serverless file systems are read-only, and the data is local anyway.
    const worker = await createWorker("eng", OEM.LSTM_ONLY, { langPath, cacheMethod: "none", gzip: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      const job = worker.recognize(image);
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`OCR timed out after ${timeoutMs()} ms`)), timeoutMs());
      });
      const { data } = await Promise.race([job, timeout]);
      return { text: data.text ?? "", confidence: typeof data.confidence === "number" ? data.confidence : null };
    } finally {
      clearTimeout(timer);
      await worker.terminate().catch(() => {});
    }
  },
};

function providerFor(name: string): OcrProvider | null {
  switch (name) {
    case "tesseract":
      return tesseractProvider;
    case "none":
    case "off":
    case "manual":
    case "":
      return null;
    default:
      console.warn(`Unknown OCR_PROVIDER "${name}". OCR is off; submissions go to manual review.`);
      return null;
  }
}

let override: OcrProvider | null | undefined;

/** Tests swap in a fake provider (or null for "not configured"). */
export function setOcrProviderForTesting(provider: OcrProvider | null | undefined) {
  override = provider;
}

/** The configured provider, or null when OCR is off. */
export function getOcrProvider(): OcrProvider | null {
  if (override !== undefined) return override;
  return providerFor((process.env.OCR_PROVIDER?.trim() || "tesseract").toLowerCase());
}
