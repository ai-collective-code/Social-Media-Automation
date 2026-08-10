import { promises as fs } from "fs";
import path from "path";
import { dataDir } from "@/lib/app-paths";
import { snapshot } from "@/lib/backup";

/**
 * Shared JSON persistence for the newer stores.
 *
 * Two deliberate differences from the older stores in this codebase:
 *
 * 1. Writes go to a temp file and are then renamed. `rename` is atomic on the
 *    same filesystem, so a crash mid-write leaves the previous good file rather
 *    than a truncated one.
 * 2. A parse failure THROWS instead of returning empty. The older stores treat
 *    unreadable JSON as "no records", which turns one corrupt byte into silent
 *    total data loss — the caller can't tell "empty" from "broken".
 *
 * A missing file is still "empty", which is the genuinely correct default.
 */

export { dataDir } from "@/lib/app-paths";

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  const full = path.join(dataDir(), file);
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
    throw new Error(
      `${file} contains invalid JSON and was not overwritten. Inspect or remove data/${file} — ` +
        `refusing to treat it as empty so existing records aren't lost.`,
    );
  }
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
  const full = path.join(dataDir(), file);
  const tmp = `${full}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf-8");
  await fs.rename(tmp, full);

  // Snapshot after the write lands, not before: a failed write leaves the
  // previous file intact and needs no new restore point. Throttled internally,
  // and deliberately not awaited — a backup is insurance, and a slow or failed
  // copy must never make saving a record fail.
  void snapshot("auto").catch(() => {});
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
