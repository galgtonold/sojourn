import { describe, it, expect } from "vitest";
import { swipeTarget, wasDragged } from "@/lib/swipe";

const at = (dx: number, velocity = 0, width = 800) =>
  swipeTarget({ dx, velocity, width });

describe("swipeTarget", () => {
  it("springs back when the drag stays short and slow", () => {
    expect(at(-40)).toBe(0);
    expect(at(40)).toBe(0);
  });

  it("commits forward past a quarter of the width, back the other way", () => {
    expect(at(-201)).toBe(1);
    expect(at(201)).toBe(-1);
  });

  it("holds at exactly the threshold minus a pixel", () => {
    expect(at(-199)).toBe(0);
    expect(at(-200)).toBe(1); // the threshold itself commits
  });

  it("commits a short but fast flick", () => {
    expect(at(-30, -900)).toBe(1);
    expect(at(30, 900)).toBe(-1);
  });

  it("does NOT commit a fast jitter that barely moved — that's a tap", () => {
    expect(at(-4, -2000)).toBe(0);
  });

  it("ignores velocity pointing away from the drag", () => {
    // Dragged left but already springing back right at release.
    expect(at(-30, 900)).toBe(-1); // the velocity wins, it's a rightward flick
    expect(at(-30, 100)).toBe(0); // neither far enough nor fast enough
  });

  it("falls back to a fixed distance before the container is measured", () => {
    expect(swipeTarget({ dx: -70, velocity: 0, width: 0 })).toBe(1);
    expect(swipeTarget({ dx: -50, velocity: 0, width: 0 })).toBe(0);
  });

  it("scales the threshold with the viewport", () => {
    expect(swipeTarget({ dx: -120, velocity: 0, width: 400 })).toBe(1);
    expect(swipeTarget({ dx: -120, velocity: 0, width: 1600 })).toBe(0);
  });
});

describe("wasDragged", () => {
  it("treats a few pixels of wobble as a click", () => {
    expect(wasDragged(0)).toBe(false);
    expect(wasDragged(-6)).toBe(false);
  });

  it("treats real travel as a drag, in either direction", () => {
    expect(wasDragged(7)).toBe(true);
    expect(wasDragged(-40)).toBe(true);
  });
});
