import { describe, it, expect } from "vitest";
import { detectHost, updateRecipe } from "@/lib/update-hosts";
import { SETTINGS_AREAS, settingsHref, activeSettingsArea } from "@/lib/settings-areas";
import { dictionaries } from "@/lib/i18n";

// The page shows ONE set of instructions. Showing the wrong one is worse than
// showing none: `docker compose up -d --build` on Vercel is a dead end, and a
// "Sync fork" instruction on a VPS updates nothing at all.

describe("detecting the host", () => {
  it("trusts our own Dockerfile marker first", () => {
    expect(detectHost({ SOJOURN_RUNTIME: "docker" })).toBe("docker");
  });

  it("recognises Vercel by the variable Vercel sets", () => {
    expect(detectHost({ VERCEL: "1" })).toBe("vercel");
  });

  it("falls back to a plain Node process", () => {
    // A VPS, a Raspberry Pi, someone's laptop. No marker means no assumptions.
    expect(detectHost({})).toBe("node");
  });

  it("prefers the explicit marker when both are somehow present", () => {
    expect(detectHost({ SOJOURN_RUNTIME: "docker", VERCEL: "1" })).toBe("docker");
  });

  it("ignores a marker it does not recognise", () => {
    expect(detectHost({ SOJOURN_RUNTIME: "kubernetes" })).toBe("node");
  });
});

describe("the recipe for each host", () => {
  it("gives Vercel a gesture rather than a command", () => {
    // There is no shell to run it in, and the one-click already exists on
    // GitHub — it just isn't ours.
    const r = updateRecipe("vercel");
    expect(r.command).toBeNull();
  });

  it("gives the shell hosts something to actually run", () => {
    expect(updateRecipe("docker").command).toContain("docker compose");
    expect(updateRecipe("node").command).toContain("npm run build");
  });

  it("does not promise `docker compose pull` before images exist", () => {
    // docker-compose.yml still builds from source; there is nothing published
    // to pull. Saying otherwise sends people to an empty registry.
    expect(updateRecipe("docker").command).not.toContain("compose pull");
    expect(updateRecipe("docker").command).toContain("--build");
  });

  it("uses copy that exists in both languages", () => {
    for (const host of ["vercel", "docker", "node"] as const) {
      const r = updateRecipe(host);
      for (const key of [r.label, r.intro, r.note].filter(Boolean)) {
        expect(dictionaries.en[key!], `en:${key}`).toBeTruthy();
        expect(dictionaries.de[key!], `de:${key}`).toBeTruthy();
      }
    }
  });
});

describe("Updates as a settings area", () => {
  it("is reachable, and sits after the settings people actually browse", () => {
    // The point was never the last index — it was that Updates does not crowd
    // out the five areas read daily. Backup joined it at the end for the same
    // reason (arrived at rarely and urgently, not browsed), so assert the
    // intent rather than a position that any new area would break.
    expect(settingsHref("updates")).toBe("/admin/settings/updates");
    const order = SETTINGS_AREAS.map((a) => a.id);
    for (const daily of ["site", "writing", "ai", "privacy"]) {
      expect(order.indexOf(daily)).toBeLessThan(order.indexOf("updates"));
    }
  });

  it("wins the longest-prefix match against the settings root", () => {
    // Every area's href starts with /admin/settings, so a naive startsWith
    // would mark "Site" active on every page.
    expect(activeSettingsArea("/admin/settings/updates")).toBe("updates");
    expect(activeSettingsArea("/admin/settings")).toBe("site");
  });
});
