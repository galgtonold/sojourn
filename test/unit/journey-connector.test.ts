import { describe, expect, it } from "vitest";
import {
  buildConnectorSegments,
  type ConnectorTrack,
} from "@/lib/journey-connector";

const track = (
  startedAt: string,
  endedAt: string,
  coords: number[][],
): ConnectorTrack => ({ startedAt, endedAt, coords });

describe("buildConnectorSegments", () => {
  it("bridges the gap between two tracks but never retraces a track", () => {
    const segs = buildConnectorSegments(
      [
        track("2025-08-13T10:00:00Z", "2025-08-13T11:00:00Z", [[0, 0], [1, 1]]),
        track("2025-08-13T12:00:00Z", "2025-08-13T13:00:00Z", [[2, 2], [3, 3]]),
      ],
      [],
    );
    // Only the end-of-A → start-of-B bridge; the two track spans are solid.
    expect(segs).toEqual([[[1, 1], [2, 2]]]);
  });

  it("routes a between-tracks photo into the bridge", () => {
    const segs = buildConnectorSegments(
      [
        track("2025-08-13T10:00:00Z", "2025-08-13T11:00:00Z", [[0, 0], [1, 1]]),
        track("2025-08-13T12:00:00Z", "2025-08-13T13:00:00Z", [[2, 2], [3, 3]]),
      ],
      [{ takenAt: "2025-08-13T11:30:00Z", lng: 1.5, lat: 1.5 }],
    );
    expect(segs).toEqual([
      [[1, 1], [1.5, 1.5]],
      [[1.5, 1.5], [2, 2]],
    ]);
  });

  it("drops a photo taken during a track's timeline", () => {
    const segs = buildConnectorSegments(
      [
        track("2025-08-13T10:00:00Z", "2025-08-13T11:00:00Z", [[0, 0], [1, 1]]),
        track("2025-08-13T12:00:00Z", "2025-08-13T13:00:00Z", [[2, 2], [3, 3]]),
      ],
      [{ takenAt: "2025-08-13T10:30:00Z", lng: 9, lat: 9 }],
    );
    expect(segs).toEqual([[[1, 1], [2, 2]]]);
    expect(JSON.stringify(segs)).not.toContain("9");
  });

  it("connects consecutive photos when there is no track between them", () => {
    const segs = buildConnectorSegments(
      [],
      [
        { takenAt: "2025-08-14T09:00:00Z", lng: 0, lat: 0 },
        { takenAt: "2025-08-14T10:00:00Z", lng: 1, lat: 1 },
      ],
    );
    expect(segs).toEqual([[[0, 0], [1, 1]]]);
  });

  it("returns nothing when no track times or photo times are present", () => {
    const segs = buildConnectorSegments(
      [{ startedAt: null, endedAt: null, coords: [[0, 0], [1, 1]] }],
      [{ takenAt: null, lng: 2, lat: 2 }],
    );
    expect(segs).toEqual([]);
  });
});
