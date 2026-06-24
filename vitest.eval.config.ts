import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const src = resolve(__dirname, "src");
export default defineConfig({
  resolve: {
    alias: [
      { find: /^server-only$/, replacement: resolve(__dirname, "test/_stubs/server-only.ts") },
      { find: /^@\/(.*)$/, replacement: `${src}/$1` },
    ],
  },
  test: {
    environment: "node",
    include: ["eval/**/*.eval.ts"],
    testTimeout: 600_000, // real model calls are slow
    hookTimeout: 600_000,
  },
});
