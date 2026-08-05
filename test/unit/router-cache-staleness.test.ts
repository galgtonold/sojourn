import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Publishing a story, then walking to the home page, showed the site as it was
// BEFORE the story existed. A forced refresh fixed it, which is what makes this
// so easy to dismiss as a fluke.
//
// It is not the server. `revalidatePath` runs on publish, and a fresh request
// for `/` renders the new story immediately — verified with curl against a
// running instance while the browser was still showing the old page. It is not
// the service worker either: its navigation handler is network-first, and a
// full reload with the worker in control returns the new page.
//
// It is Next's CLIENT router cache. Next 15.5 ships
// `staleTimes: { dynamic: 0, static: 300 }`, and every index route here is
// prerendered — so a soft navigation re-uses the RSC payload it already has for
// five minutes rather than asking. Five minutes is a long time to be told your
// own writing did not publish.
//
// Setting `static: 0` makes a soft navigation revalidate. It does NOT mean
// re-rendering: the server still answers from the ISR cache, so the cost is one
// RSC request, and the reward is that the site is never confidently wrong about
// its own contents.

// Comments stripped first. The comment beside this setting quotes Next's
// defaults verbatim — including `static: 300` — so matching raw file text finds
// the prose before the code and reports whatever the comment happens to say.
const CONFIG = readFileSync("next.config.mjs", "utf8")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

describe("client router cache", () => {
  it("does not let a soft navigation serve a stale index", () => {
    // Matches `static: 0` inside a staleTimes block, tolerating whitespace and
    // an optional `dynamic` line either side of it.
    const staleTimes = /staleTimes:\s*\{[^}]*\}/s.exec(CONFIG)?.[0];
    expect(
      staleTimes,
      "next.config.mjs sets no staleTimes, so prerendered routes keep Next's 5-minute default and a freshly published story stays invisible until a hard refresh",
    ).toBeTruthy();
    expect(staleTimes).toMatch(/static:\s*0\b/);
  });

  it("keeps the setting inside experimental, where Next reads it", () => {
    // `staleTimes` is still under `experimental` in 15.5. Spelled anywhere else
    // it is silently ignored — the config would look fixed and behave exactly
    // as before, which is the worst of both.
    expect(CONFIG).toMatch(/experimental:\s*\{[^}]*staleTimes/s);
  });
});
