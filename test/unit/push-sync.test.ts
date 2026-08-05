import { describe, it, expect } from "vitest";
import {
  shouldResync,
  rememberedAudience,
  syncRecord,
  RESYNC_INTERVAL_MS,
} from "@/lib/push-sync";

const NOW = 1_800_000_000_000;
const EP = "https://fcm.googleapis.com/fcm/send/CURRENT";

describe("shouldResync", () => {
  it("checks when nothing has ever been recorded", () => {
    expect(shouldResync(null, EP, NOW)).toBe(true);
  });

  it("stays quiet for the rest of the interval", () => {
    const raw = syncRecord(EP, NOW - 60_000, "viewer");
    expect(shouldResync(raw, EP, NOW)).toBe(false);
  });

  it("checks again once the interval is up", () => {
    const raw = syncRecord(EP, NOW - RESYNC_INTERVAL_MS, "viewer");
    expect(shouldResync(raw, EP, NOW)).toBe(true);
  });

  it("checks immediately when the endpoint has changed", () => {
    // The case that matters. A rotation the service worker never saw would
    // otherwise leave this browser silent until the interval elapsed.
    const raw = syncRecord("https://fcm.googleapis.com/fcm/send/OLD", NOW - 1000, "admin");
    expect(shouldResync(raw, EP, NOW)).toBe(true);
  });

  it("recovers from a clock that moved backwards", () => {
    const raw = syncRecord(EP, NOW + RESYNC_INTERVAL_MS, "viewer");
    expect(shouldResync(raw, EP, NOW)).toBe(true);
  });

  it("treats unreadable storage as never synced", () => {
    expect(shouldResync("not json", EP, NOW)).toBe(true);
    expect(shouldResync("{}", EP, NOW)).toBe(true);
    expect(shouldResync('{"endpoint":"x"}', EP, NOW)).toBe(true);
    expect(shouldResync('{"endpoint":"x","at":"soon"}', EP, NOW)).toBe(true);
  });
});

describe("rememberedAudience", () => {
  it("survives a rotation, because it belongs to the browser not the endpoint", () => {
    const raw = syncRecord("https://fcm.googleapis.com/fcm/send/OLD", NOW, "admin");
    expect(rememberedAudience(raw)).toBe("admin");
  });

  it("is null when never recorded, so nothing is guessed", () => {
    // A browser that subscribed before this existed. Re-registering it as a
    // guess could demote an admin subscription to viewer, so the honest answer
    // is "unknown" and the caller leaves it alone.
    expect(rememberedAudience(null)).toBeNull();
    expect(rememberedAudience(syncRecord(EP, NOW, null))).toBeNull();
  });

  it("refuses a value that is not one of the two audiences", () => {
    expect(rememberedAudience('{"endpoint":"x","at":1,"audience":"owner"}')).toBeNull();
  });
});
