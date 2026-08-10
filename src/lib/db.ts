import { Pool, type QueryResultRow } from "pg";

/**
 * Postgres connection, used when a database URL is configured.
 *
 * The whole reason this exists: Render's web services have an ephemeral
 * filesystem. Every deploy replaces the container, so anything the app wrote
 * to `data/*.json` is gone — which is exactly how a completed brand, its
 * research, and six stages of billed pipeline output were lost twice. A
 * database survives deploys; local files on that platform never will.
 *
 * Deliberately optional. `isDbConfigured()` gates every caller so the app
 * still runs entirely on JSON files when no URL is set — that's the local
 * development path, and breaking it to fix production would be a bad trade.
 *
 * Render exposes several names for the same thing depending on how the
 * database was attached, so several are accepted rather than making the user
 * rename a variable Render generated for them.
 */

function connectionString(): string {
  return (
    process.env.DATABASE_URL ??
    process.env.INTERNAL_db ??
    process.env.INTERNAL_DB ??
    process.env.POSTGRES_URL ??
    ""
  ).trim();
}

export function isDbConfigured(): boolean {
  return connectionString().length > 0;
}

let pool: Pool | undefined;

function getPool(): Pool {
  const url = connectionString();
  if (!url) {
    throw new Error(
      "No database is configured. Set DATABASE_URL (or INTERNAL_db) to use Postgres storage.",
    );
  }

  pool ??= new Pool({
    connectionString: url,
    // Render's external URLs require TLS but present a certificate chain node
    // won't verify by default. Internal URLs inside Render's network don't use
    // TLS at all, so this is scoped to the external case rather than applied
    // blanket — `rejectUnauthorized: false` where it isn't needed is just a
    // weakened default for no benefit.
    ssl: /\brender\.com\b/.test(url) && !/^postgres(ql)?:\/\/[^/]*@[^./]+\//.test(url)
      ? { rejectUnauthorized: false }
      : undefined,
    // A free Render instance sleeps after inactivity; a short cap means the
    // first request after a cold start fails fast and visibly rather than
    // hanging a page render for half a minute.
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    max: 5,
  });

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}

/** First row, or undefined — the common "get one by id" shape. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rows = await query<T>(sql, params);
  return rows[0];
}

/**
 * Run several statements as one transaction.
 *
 * Needed wherever a single logical save spans tables — a storyboard and its
 * scenes, a bucket result and its posts. Writing those without a transaction
 * is how you get a storyboard with half its scenes after a mid-write failure.
 */
export async function transaction<T>(
  work: (run: <R extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) => Promise<R[]>) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(async <R extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) => {
      const r = await client.query<R>(sql, params);
      return r.rows;
    });
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Whether the configured database is actually reachable and migrated. */
export async function dbHealth(): Promise<{ ok: boolean; detail: string }> {
  if (!isDbConfigured()) return { ok: false, detail: "No DATABASE_URL configured" };
  try {
    const rows = await query<{ count: string }>(
      "SELECT count(*)::text AS count FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const tables = Number(rows[0]?.count ?? 0);
    if (tables === 0) {
      return { ok: false, detail: "Connected, but no tables — run db/schema.sql against it" };
    }
    return { ok: true, detail: `Connected, ${tables} tables` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
