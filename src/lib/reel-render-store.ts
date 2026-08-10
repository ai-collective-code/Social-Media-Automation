import { readJson, writeJson, newId } from "@/lib/json-store";

/**
 * Render jobs for assembled reel videos.
 *
 * A list rather than a keyed map, matching the image-job store: encoding takes
 * long enough that a user can start a second render before the first lands,
 * and keeping every attempt means a failure still shows its error next to the
 * previous good video instead of replacing it.
 */

const FILE = "reel-renders.json";

export type ReelRenderStatus = "rendering" | "complete" | "failed";

export type ReelRender = {
  id: string;
  requestId: string;
  postId: string;
  status: ReelRenderStatus;
  /** Public path, e.g. /generated/reels/<file>.mp4. Set once complete. */
  localPath?: string;
  durationSec?: number;
  sceneCount?: number;
  /** False when captions were requested but no font could be found. */
  textBurned?: boolean;
  error?: string;
  startedAt: string;
  finishedAt?: string;
};

const all = () => readJson<ReelRender[]>(FILE, []);

export async function recordReelRender(
  fields: Omit<ReelRender, "id" | "startedAt" | "status"> & { status?: ReelRenderStatus },
): Promise<ReelRender> {
  const renders = await all();
  const render: ReelRender = {
    id: newId("rr"),
    status: fields.status ?? "rendering",
    startedAt: new Date().toISOString(),
    ...fields,
  };
  renders.push(render);
  await writeJson(FILE, renders);
  return render;
}

export async function updateReelRender(
  id: string,
  patch: Partial<Omit<ReelRender, "id">>,
): Promise<void> {
  const renders = await all();
  const index = renders.findIndex((r) => r.id === id);
  if (index === -1) return;
  renders[index] = { ...renders[index], ...patch, finishedAt: new Date().toISOString() };
  await writeJson(FILE, renders);
}

/** Newest render per post for one run, so a page render is a single read. */
export async function latestRenderByPostForRequest(
  requestId: string,
): Promise<Record<string, ReelRender>> {
  const out: Record<string, ReelRender> = {};
  for (const render of await all()) {
    if (render.requestId !== requestId) continue;
    const current = out[render.postId];
    if (!current || render.startedAt >= current.startedAt) out[render.postId] = render;
  }
  return out;
}
