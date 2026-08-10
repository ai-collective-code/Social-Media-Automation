import { readJson, writeJson } from "@/lib/json-store";

/**
 * Real video clips uploaded for individual reel scenes.
 *
 * The point of these is that a clip replaces the Ken Burns move: where a scene
 * has one, the assembler uses actual footage instead of panning across a
 * still. That is how output from a tool with no API — Google Flow, a phone
 * camera, stock footage — gets into a reel the platform otherwise builds
 * entirely from generated frames.
 *
 * Keyed by scene asset id ("TUE_001__s2"), the same id the image jobs and
 * prompt overrides use, so a scene's still, its refinement and its clip all
 * line up without a second lookup scheme.
 */

const FILE = "scene-clips.json";

export type SceneClip = {
  requestId: string;
  /** Scene asset id — e.g. "THU_001__s2". */
  assetId: string;
  /** Public path, e.g. /generated/clips/<file>.mp4 */
  localPath: string;
  durationSec: number;
  width: number;
  height: number;
  /** Whether the clip carries sound — Veo output usually does. */
  hasAudio: boolean;
  /** What the user called it, shown back so the card is self-explanatory. */
  originalName: string;
  uploadedAt: string;
};

type Store = Record<string, SceneClip>;

const keyFor = (requestId: string, assetId: string) => `${requestId}::${assetId}`;

const all = () => readJson<Store>(FILE, {});

export async function getSceneClip(
  requestId: string,
  assetId: string,
): Promise<SceneClip | undefined> {
  return (await all())[keyFor(requestId, assetId)];
}

/** Every clip for one run, keyed by scene asset id for direct render lookup. */
export async function clipsForRequest(requestId: string): Promise<Record<string, SceneClip>> {
  const out: Record<string, SceneClip> = {};
  for (const clip of Object.values(await all())) {
    if (clip.requestId === requestId) out[clip.assetId] = clip;
  }
  return out;
}

export async function saveSceneClip(fields: Omit<SceneClip, "uploadedAt">): Promise<SceneClip> {
  const store = await all();
  const saved: SceneClip = { ...fields, uploadedAt: new Date().toISOString() };
  store[keyFor(fields.requestId, fields.assetId)] = saved;
  await writeJson(FILE, store);
  return saved;
}

export async function clearSceneClip(requestId: string, assetId: string): Promise<SceneClip | undefined> {
  const store = await all();
  const key = keyFor(requestId, assetId);
  const existing = store[key];
  if (!existing) return undefined;
  delete store[key];
  await writeJson(FILE, store);
  // Returned so the caller can delete the file it points at — this module
  // owns the record, not the filesystem.
  return existing;
}
