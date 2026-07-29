import "server-only";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Wraps a `generateStaticParams` loader so a build without a reachable database
 * still succeeds, prerendering nothing and leaving every page to render on
 * first request (`dynamicParams` stays true, so nothing is lost but warm cache).
 *
 * Building and having a database are separate concerns, and this project keeps
 * insisting they are: `output: "standalone"` and a Dockerfile promise an image
 * you can build anywhere, and CI builds every push with no Supabase project at
 * all. Without this, `docker build` and CI both die in "Collecting page data"
 * with SUPABASE_NOT_CONFIGURED — a failure about credentials, raised while
 * compiling, which reads like a code error and sends you looking in the wrong
 * place. (It is how CI broke the moment .env.production stopped being
 * committed: the credentials had simply moved to the deployment, where they
 * belong, and the build had been quietly relying on them.)
 *
 * A load that throws for some other reason — a real outage mid-build — degrades
 * the same way rather than failing the build, and says so in the log.
 */
export async function prerenderParams<T>(
  what: string,
  load: () => Promise<T[]>,
): Promise<T[]> {
  if (!isSupabaseConfigured) {
    console.warn(
      `[prerender] ${what}: no Supabase configuration at build time — ` +
        `skipping prerender, these pages will render on first request.`,
    );
    return [];
  }
  try {
    return await load();
  } catch (e) {
    console.warn(
      `[prerender] ${what}: could not list pages to prerender ` +
        `(${e instanceof Error ? e.message : e}) — falling back to on-demand.`,
    );
    return [];
  }
}
