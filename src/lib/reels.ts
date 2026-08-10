import { getBucketResult, getCreativeResult } from "@/lib/pipeline-store";
import { getStoryboard, storyboardsForRequest, type Storyboard } from "@/lib/reel-store";
import { isVideoFormat, type Reel, type ReelScene } from "@/lib/reel-types";
import type { BucketPost, CreativeBrief } from "@/lib/pipeline-store";

/**
 * Assembles what the Reels page shows: every video post in a run, with the
 * best storyboard available for it.
 *
 * Precedence is storyboard -> brief -> nothing. A storyboard written on the
 * Reels page wins because it is the more recent, more deliberate decision; the
 * brief's `videoPrompt` is the pipeline's first pass. "Nothing" is a real and
 * common state — a post the creative stage classified as a still — and is
 * reported honestly rather than papered over with placeholder scenes.
 */

function scenesFromBrief(brief: CreativeBrief): ReelScene[] {
  return (brief.videoPrompt?.scenes ?? []).map((scene) => ({
    timing: scene.timing,
    shot: scene.description,
    voiceover: null,
    onScreenText: null,
  }));
}

function toReel(
  post: BucketPost,
  brief: CreativeBrief | undefined,
  storyboard: Storyboard | undefined,
): Reel {
  const briefScenes = brief ? scenesFromBrief(brief) : [];
  const scenes = storyboard?.scenes.length ? storyboard.scenes : briefScenes;

  return {
    postId: post.id,
    cast: storyboard?.cast ?? "",
    day: post.day,
    time: post.time,
    platform: post.platform,
    contentType: post.contentType,
    topic: post.topic,
    conceptName: brief?.conceptName ?? post.topic,
    hook: storyboard?.hook || brief?.copyDirection.hookExamples?.[0] || "",
    caption: brief?.copyDirection.captionExample ?? "",
    hashtags: brief?.copyDirection.hashtags ?? [],
    totalDuration: storyboard?.totalDuration || brief?.videoPrompt?.totalDuration || "",
    overallDirection:
      storyboard?.overallDirection || brief?.videoPrompt?.overallDirection || "",
    scenes,
    source: storyboard?.scenes.length ? "storyboard" : briefScenes.length ? "brief" : "none",
  };
}

export async function getReelsForRequest(requestId: string): Promise<Reel[]> {
  const [bucket, creative, storyboards] = await Promise.all([
    getBucketResult(requestId),
    getCreativeResult(requestId),
    storyboardsForRequest(requestId),
  ]);

  const briefs = new Map((creative?.briefs ?? []).map((b) => [b.postId, b]));

  return (bucket?.posts ?? [])
    .filter((post) => isVideoFormat(post.platform, post.contentType))
    .map((post) => toReel(post, briefs.get(post.id), storyboards[post.id]));
}

/** One reel, resolved the same way — used when generating a single scene frame. */
export async function getReel(requestId: string, postId: string): Promise<Reel | undefined> {
  const [bucket, creative, storyboard] = await Promise.all([
    getBucketResult(requestId),
    getCreativeResult(requestId),
    getStoryboard(requestId, postId),
  ]);

  const post = bucket?.posts.find((p) => p.id === postId);
  if (!post) return undefined;

  return toReel(post, creative?.briefs.find((b) => b.postId === postId), storyboard);
}
