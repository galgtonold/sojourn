import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // `import "server-only"` throws in non-RSC bundlers; stub it for tests.
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
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
    // Routes touch module-level singletons (env, fake DB); keep files isolated.
    isolate: true,
  },
});
