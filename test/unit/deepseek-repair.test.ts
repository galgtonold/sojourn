import { describe, it, expect, vi } from "vitest";
import { runJsonWithRepair, type Completion } from "@/lib/ai/deepseek";

const ok = (s: string, finishReason = "stop"): Completion => ({
  content: s,
  finishReason,
});
const parse = (s: string) => {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
};

// A transport that returns (or throws) scripted results in order, repeating the
// last once exhausted, and records the (messages, overrides) it was called with.
function scripted(results: Array<Completion | Error>) {
  const calls: {
    messages: unknown;
    overrides: { repair?: boolean; maxTokens?: number };
  }[] = [];
  let i = 0;
  const complete = async (
    messages: unknown,
    overrides: { temperature?: number; maxTokens?: number; repair?: boolean },
  ): Promise<Completion> => {
    calls.push({ messages, overrides });
    const r = results[Math.min(i, results.length - 1)];
    i++;
    if (r instanceof Error) throw r;
    return r;
  };
  return { complete: complete as never, calls };
}

const run = (over: Partial<Parameters<typeof runJsonWithRepair>[0]>) =>
  runJsonWithRepair({
    messages: [],
    attempts: 3,
    maxTokens: 4096,
    isParseable: parse,
    complete: async () => ok("{}"),
    onFail: async () => {},
    ...over,
  });

describe("runJsonWithRepair", () => {
  it("returns the first parseable output without a repair pass", async () => {
    const onFail = vi.fn();
    const { complete, calls } = scripted([ok('{"a":1}')]);
    const out = await run({ complete, onFail });
    expect(out).toBe('{"a":1}');
    expect(calls.length).toBe(1);
    expect(onFail).not.toHaveBeenCalled();
  });

  it("runs one repair pass and returns the repaired JSON", async () => {
    const onFail = vi.fn();
    const { complete, calls } = scripted([ok("nope"), ok('{"a":1}')]);
    const out = await run({ complete, onFail });
    expect(out).toBe('{"a":1}');
    expect(calls.length).toBe(2); // 1 attempt + 1 repair, no blind re-roll
    expect(calls[1].overrides.repair).toBe(true);
    expect(onFail).not.toHaveBeenCalled();
  });

  it("records a 'malformed' failure and returns raw when repair also fails", async () => {
    const onFail = vi.fn();
    const { complete } = scripted([ok("bad1"), ok("still bad")]);
    const out = await run({ complete, onFail });
    expect(out).toBe("still bad");
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(onFail.mock.calls[0][0].error).toMatch(/unparseable/);
  });

  it("holds the cap steady across the attempt and the repair", async () => {
    const { complete, calls } = scripted([ok("nope"), ok('{"a":1}')]);
    await run({ complete, maxTokens: 8000 });
    expect(calls.map((c) => c.overrides.maxTokens)).toEqual([8000, 8000]);
  });

  it("records a 'truncated at the cap' failure naming the cap it gave up at", async () => {
    const onFail = vi.fn();
    const { complete, calls } = scripted([
      ok("bad", "length"),
      ok("still bad", "length"),
    ]);
    await run({ complete, onFail, maxTokens: 8000 });
    // One attempt at the caller's cap, then the repair pass at the same cap.
    expect(calls.map((c) => c.overrides.maxTokens)).toEqual([8000, 8000]);
    expect(onFail.mock.calls[0][0].error).toMatch(/truncated at the 8000-token cap/);
  });

  it("retries a 5xx transport error, then succeeds", async () => {
    const onFail = vi.fn();
    const { complete, calls } = scripted([
      Object.assign(new Error("upstream"), { status: 503 }),
      ok('{"a":1}'),
    ]);
    const out = await run({ complete, onFail });
    expect(out).toBe('{"a":1}');
    expect(calls.length).toBe(2);
    expect(onFail).not.toHaveBeenCalled();
  });

  it("does NOT retry a 4xx, records the error and rethrows", async () => {
    const onFail = vi.fn();
    const { complete, calls } = scripted([
      Object.assign(new Error("bad request"), { status: 400 }),
    ]);
    await expect(run({ complete, onFail })).rejects.toThrow("bad request");
    expect(calls.length).toBe(1);
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(onFail.mock.calls[0][0].error).toMatch(/bad request/);
  });

  it("skips the repair pass entirely when every attempt is empty", async () => {
    const onFail = vi.fn();
    const { complete, calls } = scripted([ok("")]);
    const out = await run({ complete, onFail });
    expect(out).toBe("");
    expect(calls.length).toBe(1); // no repair call — nothing to repair
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  // The reasoning-cap failure in full: the model spends the whole budget on
  // reasoning_content and returns EMPTY content, so there is nothing for the
  // repair pass to work on either.
  //
  // This used to assert that buying room on the retry was "the only way out".
  // It is not, and measuring settled it: against a real article the same call
  // burned 8000 reasoning tokens at an 8000 cap and 32000 at a 32000 cap, the
  // thinking circling back over sentences it had already cleared. No cap
  // finishes. The way out is not to ask the model to think (ChatOpts.noThinking)
  // — so the loop's job here is simply to stop and say so, cheaply.
  it("gives up immediately on an empty, cap-truncated answer", async () => {
    const onFail = vi.fn();
    const { complete, calls } = scripted([ok("", "length")]);
    const out = await run({ complete, onFail, maxTokens: 1200 });
    expect(out).toBe("");
    expect(calls.map((c) => c.overrides.maxTokens)).toEqual([1200]);
    expect(onFail).toHaveBeenCalledTimes(1);
  });
});

// The cap never moves any more, for anybody.
//
// It used to double on every `length` finish, up to 32000. The proofreader made
// the cost visible: 8000 reasoning tokens, then 16000, then a failure — three
// generations to reach the same place, with the author waiting through all of
// them. A retry is now only ever for a transient server error.
describe("runJsonWithRepair never escalates the cap", () => {
  it("asks for exactly the cap it was given, once, when truncated", async () => {
    const { complete, calls } = scripted([ok("", "length")]);
    await run({ complete, maxTokens: 8000 });
    expect(calls.map((c) => c.overrides.maxTokens)).toEqual([8000]);
  });

  it("does not re-roll a truncated response at all", async () => {
    // Empty content also leaves the repair pass nothing to work on, so this is
    // genuinely one round trip rather than three.
    const { complete, calls } = scripted([ok("", "length")]);
    await run({ complete, maxTokens: 8000 });
    expect(calls.length).toBe(1);
    expect(calls.every((c) => !c.overrides.repair)).toBe(true);
  });

  it("reports the truncation instead of silently returning nothing", async () => {
    const onFail = vi.fn();
    const { complete } = scripted([ok("", "length")]);
    await run({ complete, onFail, maxTokens: 8000 });
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(onFail.mock.calls[0][0]).toMatchObject({ finishReason: "length" });
    expect(onFail.mock.calls[0][0].error).toMatch(/8000/);
  });

  it("sends a malformed reply straight to repair rather than re-rolling", async () => {
    // Temperature is 0 for these calls, so another roll of the same dice
    // reproduces the same output. Repair is the only thing that can help.
    const { complete, calls } = scripted([ok("not json", "stop"), ok('{"a":1}')]);
    const out = await run({ complete });
    expect(out).toBe('{"a":1}');
    expect(calls.length).toBe(2);
    expect(calls[1].overrides.repair).toBe(true);
  });

  it("still retries a transient server error", async () => {
    // The one case a retry is for.
    const boom = Object.assign(new Error("upstream"), { status: 503 });
    const { complete, calls } = scripted([boom, ok('{"a":1}')]);
    const out = await run({ complete });
    expect(out).toBe('{"a":1}');
    expect(calls.length).toBe(2);
    expect(calls.every((c) => !c.overrides.repair)).toBe(true);
  });
});
