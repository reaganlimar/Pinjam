import type { NextConfig } from "next";

// Cache Components is intentionally left off: almost every Pinjam page depends on
// the signed-in user's session, so pages are rendered per request. This keeps the
// data flow simple (no `use cache` / Suspense-for-cookies requirements).
const nextConfig: NextConfig = {
  // Node-only packages loaded at runtime instead of being bundled.
  serverExternalPackages: ["bcryptjs", "pg"],
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
