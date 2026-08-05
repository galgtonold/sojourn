import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

// The one layer this suite never touched.
//
// Everything else runs against `test/helpers/fake-supabase.ts`, which models the
// SHAPE of PostgREST responses — not row-level security, not column grants, not
// EXECUTE privileges on security-definer functions. So the policies in 48
// migrations were verified by reading them, and the project's own history says
// how that goes:
//
//   0036 broke `select=*` for anon. Caught by hand during a backup.
//   0043 broke `comments(count)`. Every post page on the live site rendered as
//        not-found until someone browsed to one.
//   0043 also documents four security defects that had been live for months.
//   0048 fixed a fifth — `reactions` and `comment_likes` still handing out the
//        reader token that 0043 took away from `comments`.
//
// Four of those five would have failed here. Note that two of them are the
// OPPOSITE of a leak: a grant tightened too far, breaking the public site. Both
// directions are asserted below, because both have already happened.
//
// Opt-in, like the live AI suite, because it needs a real Postgres:
//
//   RLS_DATABASE_URL=postgres://postgres:pass@127.0.0.1:5432/postgres npm run test:rls
//
// Point it at a THROWAWAY database with the migrations applied — the all-in-one
// compose stack brings one up. It writes fixtures and deletes them again, but it
// is not something to aim at anything you care about.

const url = process.env.RLS_DATABASE_URL;
const enabled = !!url;

// Fixed ids so cleanup is exact even if a run dies halfway.
const TRIP = "aaaaaaaa-0000-4000-8000-000000000001";
const PUB = "aaaaaaaa-0000-4000-8000-000000000002";
const DRAFT = "aaaaaaaa-0000-4000-8000-000000000003";
const COMMENT = "aaaaaaaa-0000-4000-8000-000000000004";
const MINE = "rls-probe-token-mine";
const THEIRS = "rls-probe-token-theirs";

let sql: postgres.Sql;

/** Run `fn` with the session role dropped to anon, always restoring it. */
async function asAnon<T>(fn: () => Promise<T>): Promise<T> {
  await sql.unsafe("set role anon");
  try {
    return await fn();
  } finally {
    await sql.unsafe("reset role");
  }
}

/** What anon gets when it tries: the rows, or the Postgres error code. */
async function attempt(query: string): Promise<{ rows?: unknown[]; code?: string }> {
  try {
    return { rows: await asAnon(() => sql.unsafe(query)) };
  } catch (e) {
    return { code: (e as { code?: string }).code ?? "unknown" };
  }
}

beforeAll(async () => {
  if (!enabled) return;
  sql = postgres(url!, { max: 1, onnotice: () => {} });
  await cleanup();
  await sql`insert into trips (id, slug, title) values (${TRIP}, 'rls-probe-trip', 'RLS probe')`;
  await sql`
    insert into posts (id, trip_id, slug, title, body, published, published_at)
    values (${PUB}, ${TRIP}, 'rls-probe-published', 'Published probe', 'body', true, now()),
           (${DRAFT}, ${TRIP}, 'rls-probe-draft', 'Unpublished probe', 'secret draft', false, null)`;
  await sql`
    insert into comments (id, post_id, author_name, body, visitor_token)
    values (${COMMENT}, ${PUB}, 'Probe', 'hello', ${THEIRS})`;
  await sql`insert into reactions (post_id, kind, visitor_token) values (${PUB}, 'heart', ${THEIRS})`;
  await sql`insert into comment_likes (comment_id, visitor_token) values (${COMMENT}, ${THEIRS})`;
}, 30_000);

afterAll(async () => {
  if (!enabled) return;
  await cleanup();
  await sql.end();
});

async function cleanup() {
  await sql`delete from comment_likes where visitor_token in (${MINE}, ${THEIRS})`;
  await sql`delete from reactions where visitor_token in (${MINE}, ${THEIRS})`;
  await sql`delete from comments where id = ${COMMENT}`;
  await sql`delete from posts where id in (${PUB}, ${DRAFT})`;
  await sql`delete from trips where id = ${TRIP}`;
}

describe.runIf(enabled)("what anon can read", () => {
  it("reads a published post", async () => {
    // The positive direction, first. 0036 and 0043 were both over-tightening,
    // and both took the public site down rather than leaking anything.
    const r = await attempt(`select id from posts where id = '${PUB}'`);
    expect(r.code).toBeUndefined();
    expect(r.rows).toHaveLength(1);
  });

  it("still answers `select *` on the embedded tables", async () => {
    // Exactly what 0036 broke: a column-scoped grant makes `*` fail outright,
    // because `*` expands to columns the grant does not cover — and POST_SELECT
    // embeds `photos(*)`, `locations(*)` and `tracks(*)`. Narrow any of those
    // three and every post page stops rendering.
    for (const table of ["photos", "locations", "tracks"]) {
      const r = await attempt(`select * from ${table} limit 1`);
      expect(r.code, `select * on ${table} is refused — POST_SELECT embeds it`).toBeUndefined();
    }
  });

  it("keeps posts column-scoped, which is deliberate", async () => {
    // The other half of 0036, asserted so a future blanket re-grant is loud.
    // `posts` carries columns anon has no business reading, so `*` is refused
    // BY DESIGN and the app names its columns. This test first ran asserting
    // the opposite and was wrong; the database said so immediately, which is
    // rather the point of running as a role.
    const r = await attempt(`select * from posts where id = '${PUB}'`);
    expect(r.code, "anon can select * from posts — a column grant went too wide").toBe("42501");
  });

  it("still counts comments on a published post", async () => {
    // 0043's regression: PostgREST compiles `comments(count)` to count(*), and
    // Postgres checks that against a column the grant had stopped covering.
    const r = await attempt(`select count(*) from comments where post_id = '${PUB}'`);
    expect(r.code, "counting comments is refused — this is the 0043 outage").toBeUndefined();
  });

  it("cannot read an unpublished post", async () => {
    const r = await attempt(`select id, body from posts where id = '${DRAFT}'`);
    // RLS filters rather than errors, so the tell is zero rows.
    expect(r.rows ?? []).toHaveLength(0);
  });

  it("cannot read app_secrets at all", async () => {
    const r = await attempt(`select * from app_secrets`);
    expect(r.code ?? "").not.toBe("");
  });
});

describe.runIf(enabled)("the reader token stays private", () => {
  // One `sojourn:vid` per browser, shared by comments, reactions, likes and
  // polls. Readable anywhere, it correlates everything one person has ever done.
  for (const table of ["comments", "reactions", "comment_likes"] as const) {
    it(`is unreadable on ${table}`, async () => {
      const r = await attempt(`select visitor_token from ${table} limit 1`);
      expect(
        r.code,
        `anon read visitor_token from ${table} — this is the 0043/0048 leak`,
      ).toBe("42501");
    });
  }
});

describe.runIf(enabled)("anon holds no direct DML on the token tables", () => {
  it("cannot insert a reaction directly", async () => {
    const r = await attempt(
      `insert into reactions (post_id, kind, visitor_token) values ('${PUB}', 'wow', '${MINE}')`,
    );
    expect(r.code).toBe("42501");
  });

  it("cannot delete someone else's reaction", async () => {
    // 0046: both tables carried `for delete using (true)`, so one loop emptied
    // every reaction on the site.
    const r = await attempt(`delete from reactions where visitor_token = '${THEIRS}'`);
    expect(r.code).toBe("42501");
    const left = await sql`select count(*)::int as n from reactions where visitor_token = ${THEIRS}`;
    expect(left[0].n).toBe(1);
  });

  it("adds and removes its OWN reaction through the functions", async () => {
    const added = await asAnon(
      () => sql`select public.add_reaction(${PUB}::uuid, 'wow', ${MINE}) as n`,
    );
    expect(added[0].n).toBe(1);
    const removed = await asAnon(
      () => sql`select public.remove_reaction(${PUB}::uuid, 'wow', ${MINE}) as n`,
    );
    expect(removed[0].n).toBe(1);
  });

  it("cannot remove another visitor's reaction through the function either", async () => {
    // The function takes the token as an argument, so it can only ever match
    // rows that carry it. This is the property the policy could not express.
    const removed = await asAnon(
      () => sql`select public.remove_reaction(${PUB}::uuid, 'heart', ${MINE}) as n`,
    );
    expect(removed[0].n).toBe(0);
    const left = await sql`select count(*)::int as n from reactions where visitor_token = ${THEIRS}`;
    expect(left[0].n).toBe(1);
  });

  it("refuses a token too short to be one", async () => {
    const added = await asAnon(
      () => sql`select public.add_reaction(${PUB}::uuid, 'wow', 'short') as n`,
    );
    expect(added[0].n).toBe(0);
  });
});

describe.runIf(enabled)("privileged functions are not anon's to call", () => {
  it("cannot spend someone else's rate-limit budget", async () => {
    // 0047 shipped believing `revoke from public` was enough; Supabase's
    // default privileges had already granted EXECUTE to anon by name, and the
    // function came back callable on production.
    const r = await attempt(`select public.check_rate_limit('probe', 1, 60)`);
    expect(r.code).toBe("42501");
  });
});
