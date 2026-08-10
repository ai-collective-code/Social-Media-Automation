import { promises as fs } from "fs";
import path from "path";
import { dataDir } from "@/lib/app-paths";

/**
 * Rolling snapshots of the records directory.
 *
 * The JSON files are the whole database. Atomic writes already prevent a
 * half-written file, but they do nothing about the other ways work disappears:
 * a bad edit, a delete nobody meant, a schema change that mangles a record.
 * Recovering from those needs yesterday's copy, and this is the cheapest
 * possible version of that — the entire dataset is a couple of hundred
 * kilobytes, so a snapshot costs nothing.
 *
 * Throttled rather than per-write: a pipeline run rewrites job files
 * constantly, and snapshotting each time would bury the useful restore points
 * under hundreds of near-identical copies.
 */

const BACKUP_DIR = "backups";
const MIN_INTERVAL_MS = 15 * 60_000;
const KEEP = 20;

/** Skipped work is remembered per process so the throttle needs no disk read. */
let lastSnapshotAt = 0;

function stamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export function backupRoot(): string {
  return path.join(dataDir(), BACKUP_DIR);
}

/**
 * Copy every record file into a timestamped folder.
 *
 * `force` bypasses the throttle for snapshots taken deliberately — before an
 * import or a destructive action — where the whole point is to capture the
 * state at that exact moment.
 */
export async function snapshot(reason: string, force = false): Promise<string | undefined> {
  const now = Date.now();
  if (!force && now - lastSnapshotAt < MIN_INTERVAL_MS) return undefined;
  lastSnapshotAt = now;

  const source = dataDir();
  const target = path.join(backupRoot(), `${stamp(new Date())}_${reason.replace(/[^a-z0-9]+/gi, "-")}`);

  let entries;
  try {
    entries = await fs.readdir(source, { withFileTypes: true });
  } catch {
    return undefined;
  }

  const files = entries.filter((e) => e.isFile() && e.name.endsWith(".json"));
  if (files.length === 0) return undefined;

  await fs.mkdir(target, { recursive: true });
  for (const file of files) {
    await fs.copyFile(path.join(source, file.name), path.join(target, file.name));
  }

  // Pipeline results live in a subdirectory and are expensive to regenerate —
  // they are model output, not derived data.
  const results = path.join(source, "results");
  try {
    const resultFiles = await fs.readdir(results);
    if (resultFiles.length > 0) {
      await fs.mkdir(path.join(target, "results"), { recursive: true });
      for (const name of resultFiles) {
        await fs.copyFile(path.join(results, name), path.join(target, "results", name));
      }
    }
  } catch {
    // No results yet — nothing to preserve.
  }

  await prune();
  return target;
}

/** Keep the most recent snapshots; older ones are noise, not insurance. */
async function prune(): Promise<void> {
  try {
    const all = (await fs.readdir(backupRoot())).sort();
    for (const stale of all.slice(0, Math.max(0, all.length - KEEP))) {
      await fs.rm(path.join(backupRoot(), stale), { recursive: true, force: true });
    }
  } catch {
    // Nothing to prune.
  }
}

export type BackupEntry = { name: string; takenAt: string; reason: string; fileCount: number };

export async function listBackups(): Promise<BackupEntry[]> {
  let names: string[];
  try {
    names = await fs.readdir(backupRoot());
  } catch {
    return [];
  }

  const entries: BackupEntry[] = [];
  for (const name of names.sort().reverse()) {
    const match = name.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})_(.+)$/);
    if (!match) continue;
    const files = await fs.readdir(path.join(backupRoot(), name)).catch(() => []);
    entries.push({
      name,
      takenAt: match[1].replace(/T(\d{2})-(\d{2})-(\d{2})$/, " $1:$2:$3"),
      reason: match[2].replace(/-/g, " "),
      fileCount: files.length,
    });
  }
  return entries;
}

/**
 * Restore a snapshot over the live records.
 *
 * Takes a forced snapshot of the current state first, so restoring the wrong
 * one is itself undoable.
 */
export async function restore(name: string): Promise<void> {
  const source = path.join(backupRoot(), name);
  const stat = await fs.stat(source).catch(() => undefined);
  if (!stat?.isDirectory()) throw new Error(`No backup named "${name}".`);

  await snapshot("before-restore", true);

  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (entry.isFile()) {
      await fs.copyFile(path.join(source, entry.name), path.join(dataDir(), entry.name));
    } else if (entry.isDirectory() && entry.name === "results") {
      const target = path.join(dataDir(), "results");
      await fs.mkdir(target, { recursive: true });
      for (const name2 of await fs.readdir(path.join(source, "results"))) {
        await fs.copyFile(path.join(source, "results", name2), path.join(target, name2));
      }
    }
  }
}
