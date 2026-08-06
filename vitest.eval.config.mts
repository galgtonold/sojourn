import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// `.mts`, and therefore no `__dirname`: Vite's native config loader rejects ESM
// syntax in a file it loads as CommonJS, and warns on every run until the
// extension says which one this is. Same reason as vitest.config.mts.
const src = fileURLToPath(new URL("./src", import.meta.url));
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^server-only$/,
        replacement: fileURLToPath(
          new URL("./test/_stubs/server-only.ts", import.meta.url),
        ),
      },
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
