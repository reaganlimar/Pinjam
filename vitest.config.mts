import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": src,
      // `server-only` throws outside a React Server environment; tests run in plain Node.
      "server-only": `${src}/test/server-only-stub.ts`,
    },
  },
});
