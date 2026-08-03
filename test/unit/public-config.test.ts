import { describe, it, expect } from "vitest";
import {
  publicConfigFromEnv,
  publicConfigScript,
  mergePublicConfig,
  isPlaceholderUrl,
  CONFIG_GLOBAL,
  DEFAULT_MAP_STYLE,
  type PublicConfig,
} from "@/lib/public-config";

// This module exists so one Docker image can serve any deployment. Everything
// below is a way for that to go wrong quietly: a stale value winning over a
// live one, a blank value winning over a good one, or operator config escaping
// a script tag.

const EMPTY: PublicConfig = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  siteName: "",
  siteUrl: "",
  mapStyleUrl: "",
  vapidPublicKey: "",
  sentryDsnClient: "",
  demoMode: false,
};

describe("reading the environment at runtime", () => {
  it("prefers the unprefixed name over the build-time one", () => {
    // The whole point: NEXT_PUBLIC_* may have been frozen into the image when
    // someone else built it. The bare name is never rewritten, so it is the
    // only one that can be trusted to describe THIS container.
    const c = publicConfigFromEnv({
      SUPABASE_URL: "https://runtime.supabase.co",
      NEXT_PUBLIC_SUPABASE_URL: "https://baked-into-the-image.supabase.co",
    });
    expect(c.supabaseUrl).toBe("https://runtime.supabase.co");
  });

  it("still accepts the prefixed name alone, so nothing existing breaks", () => {
    const c = publicConfigFromEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://vercel.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });
    expect(c.supabaseUrl).toBe("https://vercel.supabase.co");
    expect(c.supabaseAnonKey).toBe("anon-key");
  });

  it("accepts the four spellings of the browser key", () => {
    // Ours and the Vercel integration's, prefixed and bare.
    const of = (e: Record<string, string>) => publicConfigFromEnv(e).supabaseAnonKey;
    expect(of({ SUPABASE_ANON_KEY: "a" })).toBe("a");
    expect(of({ SUPABASE_PUBLISHABLE_KEY: "b" })).toBe("b");
    expect(of({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "c" })).toBe("c");
    expect(of({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "d" })).toBe("d");
  });

  it("treats whitespace-only as unset", () => {
    // Vercel stores a defined-but-blank variable as "". Letting that win would
    // shadow a perfectly good fallback with nothing.
    const c = publicConfigFromEnv({
      SUPABASE_URL: "   ",
      NEXT_PUBLIC_SUPABASE_URL: "https://real.supabase.co",
    });
    expect(c.supabaseUrl).toBe("https://real.supabase.co");
  });

  it("falls back to Vercel's production domain for the site URL", () => {
    expect(
      publicConfigFromEnv({ VERCEL_PROJECT_PRODUCTION_URL: "sojourn.example" })
        .siteUrl,
    ).toBe("https://sojourn.example");
  });

  it("has working defaults for the things that have one", () => {
    const c = publicConfigFromEnv({});
    expect(c.mapStyleUrl).toBe(DEFAULT_MAP_STYLE);
    expect(c.siteName).toBe("Sojourn");
    expect(c.siteUrl).toBe("http://localhost:3000");
    // And none for the things that must not be guessed.
    expect(c.supabaseUrl).toBe("");
    expect(c.supabaseAnonKey).toBe("");
  });

  it("reads demo mode as the exact string 1", () => {
    expect(publicConfigFromEnv({ DEMO_MODE: "1" }).demoMode).toBe(true);
    expect(publicConfigFromEnv({ NEXT_PUBLIC_DEMO_MODE: "1" }).demoMode).toBe(true);
    expect(publicConfigFromEnv({ DEMO_MODE: "true" }).demoMode).toBe(false);
    expect(publicConfigFromEnv({}).demoMode).toBe(false);
  });
});

describe("build placeholders are not configuration", () => {
  it("accepts one at build time, because otherwise there is no build", () => {
    // The client wrappers throw when Supabase is unconfigured, so prerendering
    // needs a URL to exist. Rejecting the placeholder here fails the image
    // build outright — which is exactly what happened when this was written the
    // other way round.
    expect(
      publicConfigFromEnv({ SUPABASE_URL: "https://build.invalid" }).supabaseUrl,
    ).toBe("https://build.invalid");
  });

  it("does not let one inlined into an image masquerade as configuration", () => {
    // A published image carries the placeholder in its bundle. Without this the
    // browser would try to reach build.invalid and fail at DNS, instead of the
    // app saying plainly that it is not configured.
    const merged = mergePublicConfig(EMPTY, {
      ...EMPTY,
      supabaseUrl: "https://build.invalid",
    });
    expect(merged.supabaseUrl).toBe("");
  });

  it("leaves real hosts alone, including ones that merely contain the word", () => {
    expect(isPlaceholderUrl("https://invalid.supabase.co")).toBe(false);
    expect(isPlaceholderUrl("https://db.abc.supabase.co")).toBe(false);
    expect(isPlaceholderUrl("not a url")).toBe(false);
    expect(isPlaceholderUrl("https://anything.invalid")).toBe(true);
  });
});

describe("merging what the server sent with what the build inlined", () => {
  it("takes the injected value when there is one", () => {
    const merged = mergePublicConfig(
      { ...EMPTY, supabaseUrl: "https://runtime.co" },
      { ...EMPTY, supabaseUrl: "https://build-time.co" },
    );
    expect(merged.supabaseUrl).toBe("https://runtime.co");
  });

  it("does NOT let a blank injected value beat a good inlined one", () => {
    // The case that makes this a merge rather than a swap: the config script is
    // rendered into statically prerendered HTML at BUILD time, so a prebuilt
    // image ships those pages carrying an empty config. Taking it wholesale
    // would break pages that would otherwise have worked.
    const merged = mergePublicConfig(EMPTY, {
      ...EMPTY,
      supabaseUrl: "https://build-time.co",
      supabaseAnonKey: "key",
    });
    expect(merged.supabaseUrl).toBe("https://build-time.co");
    expect(merged.supabaseAnonKey).toBe("key");
  });

  it("merges per field, not all-or-nothing", () => {
    const merged = mergePublicConfig(
      { ...EMPTY, supabaseUrl: "https://runtime.co" },
      { ...EMPTY, supabaseUrl: "https://build.co", vapidPublicKey: "vapid" },
    );
    expect(merged.supabaseUrl).toBe("https://runtime.co");
    expect(merged.vapidPublicKey).toBe("vapid");
  });

  it("uses the inlined config when nothing was injected at all", () => {
    const inlined = { ...EMPTY, siteName: "Fernweh" };
    expect(mergePublicConfig(null, inlined)).toEqual(inlined);
  });
});

describe("handing it to the browser", () => {
  it("assigns to the agreed global", () => {
    const js = publicConfigScript({ ...EMPTY, siteName: "Fernweh" });
    expect(js.startsWith(`window.${CONFIG_GLOBAL}=`)).toBe(true);
    expect(JSON.parse(js.slice(`window.${CONFIG_GLOBAL}=`.length)).siteName).toBe(
      "Fernweh",
    );
  });

  it("cannot be closed out of its own script tag", () => {
    // These values come from the operator's environment rather than a visitor,
    // so this is defence in depth — but a config value containing </script>
    // would otherwise stop being data and start being markup.
    const js = publicConfigScript({
      ...EMPTY,
      siteName: "</script><script>alert(1)</script>",
    });
    expect(js).not.toContain("</script>");
    expect(js).toContain("\\u003c");
  });

  it("survives the round trip it just escaped", () => {
    const nasty = "</script>—ō— ";
    const js = publicConfigScript({ ...EMPTY, siteName: nasty });
    const parsed = JSON.parse(js.slice(`window.${CONFIG_GLOBAL}=`.length));
    expect(parsed.siteName).toBe(nasty);
  });
});
