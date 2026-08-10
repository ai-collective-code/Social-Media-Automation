import { readDoc, writeDoc } from "@/lib/doc-store";
import { snapshot } from "@/lib/backup";
import { isDbConfigured } from "@/lib/db";

/**
 * Shared JSON persistence.
 *
 * Now a thin pass-through to `doc-store`, which decides between Postgres and
 * the local filesystem. The two behaviours this layer originally existed to
 * guarantee still hold and are implemented there: writes are atomic, and a
 * parse failure throws rather than reading as "no records" — which would turn
 * one corrupt byte into silent total data loss.
 */

export { dataDir } from "@/lib/app-paths";

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  return readDoc<T>(file, fallback);
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await writeDoc(file, value);

  // File-mode only. On Postgres the database is the durable copy, and
  // snapshotting to a container filesystem that's deleted on deploy would be
  // backing up to the exact place that can't be trusted.
  if (!isDbConfigured()) {
    void snapshot("auto").catch(() => {});
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
