import type { NextConfig } from "next";

const OCR_FILES = [
  "./node_modules/tesseract.js/**/*",
  "./node_modules/tesseract.js-core/*.{js,wasm}",
  "./node_modules/@tesseract.js-data/eng/4.0.0_best_int/**/*",
  "./node_modules/{regenerator-runtime,is-url,bmp-js,zlibjs,wasm-feature-detect,node-fetch,whatwg-url,tr46,webidl-conversions}/**/*",
];

// Cache Components is intentionally left off: almost every Pinjam page depends on
// the signed-in user's session, so pages are rendered per request. This keeps the
// data flow simple (no `use cache` / Suspense-for-cookies requirements).
const nextConfig: NextConfig = {
  // Node-only packages loaded at runtime instead of being bundled. tesseract.js (student ID
  // OCR) starts a worker thread from its own files, so it must stay unbundled.
  serverExternalPackages: ["bcryptjs", "pg", "tesseract.js"],
  // OCR loads its worker script, WASM core and English language data by path at runtime, which
  // file tracing can't see. Ship them with the routes whose server actions run OCR.
  outputFileTracingIncludes: {
    "/verification": OCR_FILES,
    "/admin/verifications/[id]": OCR_FILES,
  },
  experimental: {
    serverActions: {
      // Vercel rejects request bodies over 4.5 MB. Photos are compressed in the browser
      // (src/lib/compress-image.ts) so a listing with 4 photos stays well under this.
      bodySizeLimit: "4mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
