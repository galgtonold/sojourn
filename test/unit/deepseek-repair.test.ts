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

  it("runs one repair pass after the retries and returns the repaired JSON", async () => {
    const onFail = vi.fn();
    const { complete, calls } = scripted([
      ok("nope"),
      ok("nope"),
      ok("nope"),
      ok('{"a":1}'),
    ]);
    const out = await run({ complete, onFail });
    expect(out).toBe('{"a":1}');
    expect(calls.length).toBe(4); // 3 attempts + 1 repair
    expect(calls[3].overrides.repair).toBe(true);
    expect(onFail).not.toHaveBeenCalled();
  });

  it("records a 'malformed' failure and returns raw when repair also fails", async () => {
    const onFail = vi.fn();
    const { complete } = scripted([
      ok("bad1"),
      ok("bad2"),
      ok("bad3"),
      ok("still bad"),
    ]);
    const out = await run({ complete, onFail });
    expect(out).toBe("still bad");
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(onFail.mock.calls[0][0].error).toMatch(/unparseable/);
  });

  it("doubles the cap after a 'length' finish, so the retry is a real second chance", async () => {
    const { complete, calls } = scripted([
      ok("trunc", "length"),
      ok("trunc", "length"),
      ok('{"a":1}'),
    ]);
    const out = await run({ complete, maxTokens: 8000 });
    expect(out).toBe('{"a":1}');
    expect(calls.map((c) => c.overrides.maxTokens)).toEqual([8000, 16000, 32000]);
  });

  it("does NOT raise the cap for output that merely failed to parse", async () => {
    const { complete, calls } = scripted([ok("nope"), ok("nope"), ok('{"a":1}')]);
    await run({ complete, maxTokens: 8000 });
    expect(calls.map((c) => c.overrides.maxTokens)).toEqual([8000, 8000, 8000]);
  });

  it("records a 'truncated at the cap' failure naming the cap it gave up at", async () => {
    const onFail = vi.fn();
    const { complete, calls } = scripted([
      ok("bad", "length"),
      ok("bad", "length"),
      ok("bad", "length"),
      ok("still bad", "length"),
    ]);
    await run({ complete, onFail, maxTokens: 8000 });
    // 8000 → 16000 → 32000, then held at the ceiling for the repair pass.
    expect(calls.map((c) => c.overrides.maxTokens)).toEqual([
      8000, 16000, 32000, 32000,
    ]);
    expect(onFail.mock.calls[0][0].error).toMatch(/truncated at the 32000-token cap/);
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
    const { complete, calls } = scripted([ok(""), ok(""), ok("")]);
    const out = await run({ complete, onFail });
    expect(out).toBe("");
    expect(calls.length).toBe(3); // no repair call — nothing to repair
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  // The reasoning-cap failure in full: the model spends the whole budget on
  // reasoning_content and returns EMPTY content, so there is no text for the
  // repair pass to work on. Buying room on the retry is the only way out.
  it("buys room for an empty, cap-truncated answer instead of re-rolling it", async () => {
    const onFail = vi.fn();
    const { complete, calls } = scripted([
      ok("", "length"),
      ok("", "length"),
      ok('{"questions":[]}'),
    ]);
    const out = await run({ complete, onFail, maxTokens: 1200 });
    expect(out).toBe('{"questions":[]}');
    expect(calls.map((c) => c.overrides.maxTokens)).toEqual([1200, 2400, 4800]);
    expect(onFail).not.toHaveBeenCalled();
  });
});
