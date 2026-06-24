// Loads .env.local into process.env for REAL (non-EVAL_FAKE) eval runs, so the
// operator's provider keys (DEEPSEEK_API_KEY, VISION_API_KEY, …) reach the
// pipeline. vitest doesn't auto-load .env files the way Next.js does. Runs as a
// vitest setupFile — in the worker, before the test module (and its env.ts
// import) are evaluated. Existing process.env always wins; in EVAL_FAKE mode
// the fake backend intercepts fetch, so the loaded keys are simply unused.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(process.cwd(), ".env.local");
if (existsSync(file)) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key] !== undefined) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    } else {
      // Strip an unquoted inline comment (" # …"), like dotenv does — otherwise
      // a `KEY=value # note` line loads "value # note" and breaks auth.
      val = val.replace(/\s+#.*$/, "").trimEnd();
    }
    process.env[key] = val;
  }
}
