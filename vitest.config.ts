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
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Focus on logic we can meaningfully unit-test (not React components,
      // browser-only clients, or thin Supabase wrappers).
      include: ["src/lib/**/*.ts"],
      exclude: [
        "src/lib/**/*.d.ts",
        "src/lib/types.ts",
        "src/lib/demo.ts",
        "src/lib/supabase/**",
        "src/lib/push-client.ts",
        "src/lib/upload-client.ts",
        "src/lib/notify.ts",
        "src/lib/gpx.ts", // parseGpxSplit needs a DOM; only pure helpers are tested
      ],
    },
  },
});
