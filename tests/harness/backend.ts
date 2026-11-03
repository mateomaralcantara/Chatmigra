// Harness family: backend. An in-memory stand-in for Supabase (auth + tables)
// with just enough of the query-builder API used by the /api handlers.

type Row = Record<string, any>;
type Result = { data: any; error: { message: string } | null };

export interface FakeUser {
  id: string;
  email: string;
}

class Query implements PromiseLike<Result> {
  private filters: Array<[string, unknown]> = [];
  private max = Infinity;
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: Row | Row[] | null = null;

  constructor(private readonly db: FakeBackend, private readonly table: string) {}

  select(_columns?: string) {
    if (this.op === 'insert') return this;
    this.op = 'select';
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = 'update';
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.max = 1;
    return this.then((r) => ({ ...r, data: r.data?.[0] ?? null }));
  }
  single() {
    return this.maybeSingle();
  }

  private run(): Result {
    const failure = this.db.failures.get(`${this.table}:${this.op}`);
    if (failure) return { data: null, error: { message: failure } };

    const rows = this.db.table(this.table);
    const matches = (row: Row) => this.filters.every(([k, v]) => row[k] === v);

    switch (this.op) {
      case 'select':
        return { data: rows.filter(matches).slice(0, this.max), error: null };
      case 'insert': {
        const items = Array.isArray(this.payload) ? this.payload : [this.payload!];
        for (const item of items) {
          const violation = this.db.uniqueViolation(this.table, item);
          if (violation) return { data: null, error: { message: violation } };
        }
        const created = items.map((item) => ({ id: `${this.table}-${++this.db.sequence}`, ...item }));
        rows.push(...created);
        return { data: created, error: null };
      }
      case 'update': {
        const changed = rows.filter(matches);
        changed.forEach((row) => Object.assign(row, this.payload));
        return { data: changed, error: null };
      }
      case 'delete': {
        const kept = rows.filter((r) => !matches(r));
        const removed = rows.length - kept.length;
        rows.splice(0, rows.length, ...kept);
        return { data: removed, error: null };
      }
    }
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export class FakeBackend {
  readonly tables = new Map<string, Row[]>();
  readonly users = new Map<string, FakeUser>();
  /** "table:op" -> error message, to simulate database outages. */
  readonly failures = new Map<string, string>();
  /** table -> unique columns, mirroring constraints in supabase/migrations. */
  readonly unique = new Map<string, string[]>([['payments', ['provider_capture_id']]]);
  sequence = 0;
  adminConfigured = true;

  table(name: string): Row[] {
    if (!this.tables.has(name)) this.tables.set(name, []);
    return this.tables.get(name)!;
  }

  uniqueViolation(table: string, item: Row): string | null {
    for (const column of this.unique.get(table) ?? []) {
      if (item[column] == null) continue;
      if (this.table(table).some((row) => row[column] === item[column])) {
        return `duplicate key value violates unique constraint "${table}_${column}_key"`;
      }
    }
    return null;
  }

  /** Registers a signed-in user and returns its bearer token. */
  signIn(user: FakeUser): string {
    const token = `token-${user.id}`;
    this.users.set(token, user);
    return token;
  }

  client() {
    return {
      from: (table: string) => new Query(this, table),
      rpc: async () => ({ data: null, error: { message: 'rpc not simulated' } }),
    };
  }

  reset() {
    this.tables.clear();
    this.users.clear();
    this.failures.clear();
    this.sequence = 0;
    this.adminConfigured = true;
  }
}

export const backend = new FakeBackend();
