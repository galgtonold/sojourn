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
  // Vitest 4 transforms with oxc instead of esbuild, and oxc leaves JSX alone by
  // default — it expects a framework plugin to claim it. There is none here (the
  // suite tests logic, not rendering), so JSX survived the transform and then hit
  // the SSR parser, which reports "Unexpected JSX expression" pointing at a `.tsx`
  // file that is perfectly valid. Only one test imports a component module at all
  // (not-found-noindex, for `metadata`), which is why exactly one file failed.
  oxc: { jsx: { runtime: "automatic" } },
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
