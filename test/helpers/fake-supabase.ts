// A tiny in-memory stand-in for the subset of the Supabase client our AI routes
// use: from(table).select/insert/update/delete with eq/neq/is/order/limit and
// single/maybeSingle, plus auth.getUser(). It is intentionally minimal — just
// enough to drive the real route handlers, materializer, and dossier builder.
import { randomUUID } from "node:crypto";

export type Row = Record<string, unknown>;
type Filter = { kind: "eq" | "neq" | "is" | "in"; col: string; val: unknown };

export type FakeDb = Record<string, Row[]>;

class Query {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private filters: Filter[] = [];
  private orderSpec?: { col: string; ascending: boolean };
  private limitN?: number;
  private singleMode: "one" | "maybe" | null = null;
  private insertRows: Row[] = [];
  private patch: Row = {};

  constructor(
    private store: FakeDb,
    private table: string,
  ) {}

  private rows(): Row[] {
    return (this.store[this.table] ??= []);
  }

  select(): this {
    if (this.op === "select") this.op = "select";
    return this;
  }
  insert(rows: Row | Row[]): this {
    this.op = "insert";
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[]): this {
    this.op = "insert";
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Row): this {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filters.push({ kind: "eq", col, val });
    return this;
  }
  neq(col: string, val: unknown): this {
    this.filters.push({ kind: "neq", col, val });
    return this;
  }
  is(col: string, val: unknown): this {
    this.filters.push({ kind: "is", col, val });
    return this;
  }
  in(col: string, vals: unknown[]): this {
    this.filters.push({ kind: "in", col, val: vals });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderSpec = { col, ascending: opts?.ascending ?? true };
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  single(): this {
    this.singleMode = "one";
    return this;
  }
  maybeSingle(): this {
    this.singleMode = "maybe";
    return this;
  }

  private match(row: Row): boolean {
    return this.filters.every((f) => {
      if (f.kind === "eq") return row[f.col] === f.val;
      if (f.kind === "neq") return row[f.col] !== f.val;
      if (f.kind === "in")
        return Array.isArray(f.val) && f.val.includes(row[f.col]);
      return f.val === null ? row[f.col] == null : row[f.col] === f.val;
    });
  }

  private exec(): { data: unknown; error: null } {
    let result: Row[];
    if (this.op === "insert") {
      const inserted = this.insertRows.map((r) => ({
        id: (r.id as string) ?? randomUUID(),
        ...r,
      }));
      this.rows().push(...inserted);
      result = inserted;
    } else if (this.op === "update") {
      result = this.rows().filter((r) => this.match(r));
      for (const r of result) Object.assign(r, this.patch);
    } else if (this.op === "delete") {
      result = this.rows().filter((r) => this.match(r));
      this.store[this.table] = this.rows().filter((r) => !this.match(r));
    } else {
      result = this.rows().filter((r) => this.match(r));
      if (this.orderSpec) {
        const { col, ascending } = this.orderSpec;
        result = [...result].sort((a, b) => {
          const av = a[col] as number | string;
          const bv = b[col] as number | string;
          const d = av < bv ? -1 : av > bv ? 1 : 0;
          return ascending ? d : -d;
        });
      }
      if (this.limitN != null) result = result.slice(0, this.limitN);
    }
    if (this.singleMode) return { data: result[0] ?? null, error: null };
    return { data: result, error: null };
  }

  // Thenable: `await query` (after any terminal method) runs exec().
  then<R = { data: unknown; error: null }>(
    onfulfilled?: ((v: { data: unknown; error: null }) => R) | null,
  ): Promise<R> {
    return Promise.resolve(this.exec()).then(onfulfilled ?? undefined) as Promise<R>;
  }
}

export type FakeSupabase = ReturnType<typeof makeFakeSupabase>;

export function makeFakeSupabase(seed: FakeDb, userId = "user-1") {
  // Deep-ish clone so each test gets its own mutable store.
  const store: FakeDb = {};
  for (const [k, v] of Object.entries(seed)) store[k] = v.map((r) => ({ ...r }));
  return {
    store,
    from(table: string) {
      return new Query(store, table);
    },
    auth: {
      async getUser() {
        return { data: { user: { id: userId } }, error: null };
      },
    },
  };
}
