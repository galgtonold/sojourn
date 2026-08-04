import "server-only";
import { after } from "next/server";
import { logError } from "@/lib/log";

// Work that has to outlive the response.
//
// A notification should never make the visitor wait: they posted a comment,
// and whether the author's phone buzzes is not their problem. So the send has
// to happen after the response goes out. The tempting way to write that is a
// floating promise —
//
//     notifyComment(...).catch(logError);
//     return NextResponse.json(...);
//
// — and on Vercel that quietly loses most of them. The instance is FROZEN the
// moment the response is flushed; anything still in flight is suspended where
// it stands. If another request happens to land on the same instance it thaws
// and continues, which is why this looked fine every single time it was
// tested: testing means clicking around, and clicking around keeps the
// instance warm. One comment arriving on a quiet site at 23:10 gets no such
// traffic, and the send is discarded when the instance is recycled.
//
// The tell was in the data. `notifyComment` awaits a `notifications` insert
// first, and that one is dispatched BEFORE the response — 9 of 9 on
// production, every one inside 0.6s. The pushes run three or four round-trips
// further on, after the response, and those are the ones that went missing.
//
// `after()` is the framework's answer: it hands the callback to the platform's
// waitUntil, so the instance is kept alive until the work settles.
//
// The app already knew this — @/lib/ai/translate dispatches translation exactly
// this way, and has since it stopped using an Edge Function. Notifications were
// simply never converted. This is that same dispatch, factored out with the
// error handling notifications need, so the next piece of post-response work
// has one obvious thing to reach for.

/**
 * Run `work` once the response has been sent, without the platform freezing it
 * halfway.
 *
 * Failures are logged against `scope` and never propagate — a push that cannot
 * be delivered must not turn a visitor's successful comment into a 500, and
 * one dead subscription must not take the rest of the batch down with it.
 */
export function afterResponse(scope: string, work: () => unknown): void {
  const guarded = async () => {
    try {
      await work();
    } catch (err) {
      logError(scope, err);
    }
  };

  try {
    after(guarded);
  } catch {
    // No request scope. Self-hosted Sojourn is a long-lived Node server where
    // nothing freezes, so running it loose is genuinely correct there; scripts
    // and unit tests arrive here too. Dropping the work is the one outcome
    // that would be wrong.
    void guarded();
  }
}
