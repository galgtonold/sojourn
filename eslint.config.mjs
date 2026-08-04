// ESLint, finally wired up. `next lint` is deprecated and unconfigured, so this
// drives the CLI directly — which is what ci.yml's own comment said was the
// follow-up.
//
// `eslint-config-next` is still eslintrc-shaped, so FlatCompat translates it for
// ESLint 9's flat config. That is the arrangement Next documents; when the
// config ships flat natively this file gets shorter.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  {
    // Build output, dependencies, and the operator's own private backups — the
    // last of which is gitignored and holds real exports.
    ignores: [
      ".next/**",
      // Not ours: agent worktrees, and a type file Next regenerates.
      ".claude/**",
      "next-env.d.ts",
      "node_modules/**",
      "backups/**",
      "coverage/**",
      "supabase/functions/**", // Deno, with its own globals and import style
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Test doubles are deliberately shaped like whatever the code under test
    // reaches for, and `any` says that more honestly than a fictional
    // interface. Shipped code does not get the same latitude.
    files: ["test/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    rules: {
      // Deliberate in this codebase: `catch {}` with a comment saying why is a
      // recurring, intentional pattern for best-effort work (metering, cache
      // warming, revalidation) where failing loudly would be worse.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default config;
