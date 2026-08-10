import { promises as fs } from "fs";
import path from "path";
import { dataDir } from "@/lib/app-paths";
import { isDbConfigured, query } from "@/lib/db";

/**
 * One place that decides where a JSON document lives.
 *
 * Postgres when a database URL is configured, the local filesystem otherwise.
 * That split is the whole point: Render's web services have an ephemeral
 * filesystem, so every deploy deletes data/*.json — which is how two brands'
 * completed research and six stages of billed pipeline output were lost. A
 * database survives deploys. Local files are still the right default for
 * development, where a Postgres dependency would be pure friction.
 *
 * Keys are the store's own relative paths ("brands.json",
 * "results/req_x.trends.json"), so nothing above this layer needs a second
 * naming scheme.
 */

/** A parse failure is never treated as "empty" — see readDoc. */
function corrupt(key: string): Error {
  return new Error(
    `${key} contains invalid JSON and was not overwritten. Inspect or remove it — ` +
      `refusing to treat it as empty so existing records aren't lost.`,
  );
}

export async function readDoc<T>(key: string, fallback: T): Promise<T> {
  if (isDbConfigured()) {
    const rows = await query<{ value: T }>(
      "SELECT value FROM json_documents WHERE key = $1",
      [key],
    );
    // A missing row is genuinely "nothing saved yet"; jsonb is already parsed.
    return rows.length > 0 ? rows[0].value : fallback;
  }

  const full = path.join(dataDir(), key);
  let raw: string;
  try {
    raw = await fs.readFile(full, "utf-8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
  if (raw.trim() === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Deliberately loud. Returning `fallback` here would let one corrupt byte
    // read as "no records" and then be overwritten by the next save.
    throw corrupt(key);
  }
}

export async function writeDoc(key: string, value: unknown): Promise<void> {
  if (isDbConfigured()) {
    await query(
      `INSERT INTO json_documents (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, JSON.stringify(value)],
    );
    return;
  }

  const full = path.join(dataDir(), key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  // Write-then-rename: rename is atomic on one filesystem, so a crash
  // mid-write leaves the previous good file rather than a truncated one.
  const tmp = `${full}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf-8");
  await fs.rename(tmp, full);
}

/** Whether a document exists — cheaper than reading a large result blob. */
export async function docExists(key: string): Promise<boolean> {
  if (isDbConfigured()) {
    const rows = await query("SELECT 1 FROM json_documents WHERE key = $1", [key]);
    return rows.length > 0;
  }
  try {
    await fs.access(path.join(dataDir(), key));
    return true;
  } catch {
    return false;
  }
}
