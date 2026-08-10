import { readJson, writeJson } from "@/lib/json-store";
import {
  DEFAULT_SCENE_SECONDS,
  DEFAULT_TRANSITION_SECONDS,
  defaultMotion,
  type MotionKind,
} from "@/lib/reel-types";

/**
 * Timing and camera-move settings for one reel's edit.
 *
 * Stored separately from the storyboard so re-directing the scenes doesn't
 * throw away pacing the user has already tuned, and so a reel that has never
 * been edited needs no record at all — `reelEditFor` synthesises sensible
 * defaults instead of writing rows nobody asked for.
 */

const FILE = "reel-edits.json";

export type SceneEdit = {
  durationSec: number;
  motion: MotionKind;
};

export type ReelEdit = {
  requestId: string;
  postId: string;
  transitionSec: number;
  /** Burn each scene's on-screen text into the video. */
  burnText: boolean;
  scenes: SceneEdit[];
  updatedAt: string;
};

type Store = Record<string, ReelEdit>;

const keyFor = (requestId: string, postId: string) => `${requestId}::${postId}`;

const all = () => readJson<Store>(FILE, {});

export async function getReelEdit(
  requestId: string,
  postId: string,
): Promise<ReelEdit | undefined> {
  return (await all())[keyFor(requestId, postId)];
}

export async function editsForRequest(requestId: string): Promise<Record<string, ReelEdit>> {
  const out: Record<string, ReelEdit> = {};
  for (const edit of Object.values(await all())) {
    if (edit.requestId === requestId) out[edit.postId] = edit;
  }
  return out;
}

export async function saveReelEdit(fields: Omit<ReelEdit, "updatedAt">): Promise<ReelEdit> {
  const store = await all();
  const saved: ReelEdit = { ...fields, updatedAt: new Date().toISOString() };
  store[keyFor(fields.requestId, fields.postId)] = saved;
  await writeJson(FILE, store);
  return saved;
}

/**
 * The settings actually in force for a reel, defaults filled in.
 *
 * Also reconciles length: a storyboard rewrite can change the scene count
 * under a saved edit, so extra entries are dropped and new scenes pick up
 * defaults rather than reading `undefined` into the encoder.
 */
export function reelEditFor(sceneCount: number, saved?: ReelEdit): Omit<ReelEdit, "updatedAt"> {
  return {
    requestId: saved?.requestId ?? "",
    postId: saved?.postId ?? "",
    transitionSec: saved?.transitionSec ?? DEFAULT_TRANSITION_SECONDS,
    burnText: saved?.burnText ?? true,
    scenes: Array.from({ length: sceneCount }, (_, i) => ({
      durationSec: saved?.scenes[i]?.durationSec ?? DEFAULT_SCENE_SECONDS,
      motion: saved?.scenes[i]?.motion ?? defaultMotion(i),
    })),
  };
}
