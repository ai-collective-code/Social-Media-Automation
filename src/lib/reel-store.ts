import { readJson, writeJson } from "@/lib/json-store";
import type { ReelScene } from "@/lib/reel-types";

/**
 * Storyboards written on the Reels page.
 *
 * Kept apart from the creative brief for the same reason prompt overrides are:
 * the brief records what the pipeline decided, and a storyboard the user
 * generated or reworked on the Reels page is theirs. It also covers the case
 * the brief can't — a video post the creative stage wrote up as a still,
 * because its old format detection missed "YouTube Shorts" and friends.
 */

const FILE = "reel-storyboards.json";

export type Storyboard = {
  requestId: string;
  postId: string;
  totalDuration: string;
  overallDirection: string;
  hook: string;
  /** Locked description of the recurring person, repeated into every frame. */
  cast?: string;
  scenes: ReelScene[];
  updatedAt: string;
};

type Store = Record<string, Storyboard>;

/** Scoped by request as well as post — bucket ids repeat across brands. */
const keyFor = (requestId: string, postId: string) => `${requestId}::${postId}`;

const all = () => readJson<Store>(FILE, {});

export async function getStoryboard(
  requestId: string,
  postId: string,
): Promise<Storyboard | undefined> {
  return (await all())[keyFor(requestId, postId)];
}

export async function storyboardsForRequest(
  requestId: string,
): Promise<Record<string, Storyboard>> {
  const out: Record<string, Storyboard> = {};
  for (const board of Object.values(await all())) {
    if (board.requestId === requestId) out[board.postId] = board;
  }
  return out;
}

export async function saveStoryboard(
  fields: Omit<Storyboard, "updatedAt">,
): Promise<Storyboard> {
  const store = await all();
  const saved: Storyboard = { ...fields, updatedAt: new Date().toISOString() };
  store[keyFor(fields.requestId, fields.postId)] = saved;
  await writeJson(FILE, store);
  return saved;
}
