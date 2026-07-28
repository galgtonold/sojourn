import { describe, it, expect, vi } from "vitest";
import { resolveAdminRoute, resolvePublicRoute } from "@/lib/admin-route";
import type { SetupState } from "@/lib/setup";

describe("resolvePublicRoute", () => {
  it("sends visitors to setup while the install is unclaimed", () => {
    expect(resolvePublicRoute("needs-setup")).toBe("/admin/setup");
  });

  it("serves the site normally once claimed", () => {
    expect(resolvePublicRoute("configured")).toBeNull();
  });

  it("fails open when the state is unknown, so a database blip cannot black out the site", () => {
    expect(resolvePublicRoute("unknown")).toBeNull();
  });
});

/** A setup-state fetcher that records whether it was consulted. */
function state(s: SetupState) {
  return vi.fn(() => Promise.resolve(s));
}

describe("resolveAdminRoute — signed in", () => {
  it("bounces the auth pages to the dashboard", async () => {
    const get = state("configured");
    expect(await resolveAdminRoute("/admin/login", true, get)).toBe("/admin");
    expect(await resolveAdminRoute("/admin/setup", true, get)).toBe("/admin");
  });

  it("lets the admin pages through", async () => {
    const get = state("configured");
    expect(await resolveAdminRoute("/admin", true, get)).toBeNull();
    expect(await resolveAdminRoute("/admin/posts/abc", true, get)).toBeNull();
  });

  it("never queries the database for a signed-in viewer", async () => {
    const get = state("configured");
    await resolveAdminRoute("/admin", true, get);
    await resolveAdminRoute("/admin/login", true, get);
    expect(get).not.toHaveBeenCalled();
  });
});

describe("resolveAdminRoute — signed out", () => {
  it("sends a fresh install straight to setup, skipping login", async () => {
    expect(await resolveAdminRoute("/admin", false, state("needs-setup"))).toBe(
      "/admin/setup",
    );
    expect(
      await resolveAdminRoute("/admin/posts/abc", false, state("needs-setup")),
    ).toBe("/admin/setup");
  });

  it("redirects a bookmarked login page to setup on a fresh install", async () => {
    expect(
      await resolveAdminRoute("/admin/login", false, state("needs-setup")),
    ).toBe("/admin/setup");
  });

  it("sends a configured install to login", async () => {
    expect(await resolveAdminRoute("/admin", false, state("configured"))).toBe(
      "/admin/login",
    );
  });

  it("falls back to login when the setup state cannot be determined", async () => {
    expect(await resolveAdminRoute("/admin", false, state("unknown"))).toBe(
      "/admin/login",
    );
  });

  it("lets the login page render on a configured install", async () => {
    expect(
      await resolveAdminRoute("/admin/login", false, state("configured")),
    ).toBeNull();
  });

  it("lets setup render on a fresh install", async () => {
    expect(
      await resolveAdminRoute("/admin/setup", false, state("needs-setup")),
    ).toBeNull();
  });

  it("tombstones setup once an owner exists", async () => {
    expect(
      await resolveAdminRoute("/admin/setup", false, state("configured")),
    ).toBe("/admin/login");
  });

  it("lets setup render when the state is unknown, so it can explain itself", async () => {
    expect(
      await resolveAdminRoute("/admin/setup", false, state("unknown")),
    ).toBeNull();
  });

  it("always lets the invite/recovery page render, without a lookup", async () => {
    const get = state("configured");
    expect(await resolveAdminRoute("/admin/welcome", false, get)).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});
