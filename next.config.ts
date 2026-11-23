import type { NextConfig } from "next";

// Cache Components is intentionally left off: almost every Pinjam page depends on
// the signed-in user's session, so pages are rendered per request. This keeps the
// data flow simple (no `use cache` / Suspense-for-cookies requirements).
const nextConfig: NextConfig = {
  // node:sqlite is a Node built-in; keep it out of the bundle.
  serverExternalPackages: ["bcryptjs"],
  experimental: {
    serverActions: {
      // Up to 4 item photos (5 MB each are rejected server-side) + form fields.
      bodySizeLimit: "12mb",
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
