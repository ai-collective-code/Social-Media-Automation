"use server";

import { promises as fs } from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import { latestJobByPostForRequest } from "@/lib/canva-store";
import { getBucketResult, getCreativeResult } from "@/lib/pipeline-store";
import { getRequest } from "@/lib/research-store";
import {
  generateImageForPost,
  activeImageProvider,
  providerSpacingMs,
} from "@/lib/image-generation";
import { generateStoryboard } from "@/lib/reel-director";
import { saveStoryboard, getStoryboard } from "@/lib/reel-store";
import { getReel } from "@/lib/reels";
import { sceneAssetId, parseAssetId, MOTION_OPTIONS, type MotionKind } from "@/lib/reel-types";
import { getReelEdit, saveReelEdit, reelEditFor } from "@/lib/reel-edit-store";
import { recordReelRender, updateReelRender } from "@/lib/reel-render-store";
import { clipsForRequest, saveSceneClip, clearSceneClip } from "@/lib/scene-clip-store";
import { hasFfmpeg, probeMedia } from "@/lib/video/ffmpeg";
import { mediaDir, mediaPathFor } from "@/lib/app-paths";
import { renderReelVideo, reelDuration } from "@/lib/video/reel-video";

/** Returned rather than thrown, so an LLM timeout lands on the one reel card. */
export type StoryboardState = { ok: boolean; message: string } | null;

/**
 * Save pacing and camera moves for one reel.
 *
 * Scene fields arrive as `duration_<i>` / `motion_<i>` rather than repeated
 * names, so a scene whose control the browser omits keeps its default instead
 * of silently shifting every later scene's settings up by one.
 */
export async function saveReelSettings(formData: FormData): Promise<void> {
  const requestId = String(formData.get("requestId") ?? "").trim();
  const postId = String(formData.get("postId") ?? "").trim();
  if (!requestId || !postId) throw new Error("requestId and postId are required");

  const reel = await getReel(requestId, postId);
  if (!reel) return;

  const current = reelEditFor(reel.scenes.length, await getReelEdit(requestId, postId));

  await saveReelEdit({
    requestId,
    postId,
    transitionSec: clamp(Number(formData.get("transitionSec")), 0, 2, current.transitionSec),
    burnText: formData.get("burnText") === "on",
    scenes: current.scenes.map((scene, i) => ({
      durationSec: clamp(Number(formData.get(`duration_${i}`)), 1, 15, scene.durationSec),
      motion: (MOTION_OPTIONS.find((m) => m.value === formData.get(`motion_${i}`))?.value ??
        scene.motion) as MotionKind,
    })),
  });

  revalidatePath("/reels");
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/**
 * Change the locked character description by hand.
 *
 * Editable rather than AI-only because casting is a taste decision — the model
 * writes a plausible person, but only the user knows whether that is the
 * person the brand wants on screen. Existing frames are left alone; they are
 * regenerated on demand so a wording tweak doesn't silently spend the image
 * budget for a whole reel.
 */
export async function saveCast(formData: FormData): Promise<void> {
  const requestId = String(formData.get("requestId") ?? "").trim();
  const postId = String(formData.get("postId") ?? "").trim();
  const cast = String(formData.get("cast") ?? "").trim();
  if (!requestId || !postId) throw new Error("requestId and postId are required");

  const existing = await getStoryboard(requestId, postId);
  if (!existing) {
    // Nothing to attach a cast to: the scenes live on the creative brief, and
    // rewriting that from here would overwrite the pipeline's own record.
    return;
  }

  await saveStoryboard({ ...existing, cast });
  revalidatePath("/reels");
}

export type ClipState = { ok: boolean; message: string } | null;

/** Roughly a 30-second 1080x1920 clip; well under the Server Action ceiling. */
const MAX_CLIP_BYTES = 48 * 1024 * 1024;
const CLIP_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v"]);

/**
 * Attach real footage to one scene.
 *
 * This is the bridge for video tools that have no API — Google Flow, a phone,
 * stock footage. Generate the clip wherever you like, drop it on the scene,
 * and the assembler uses it in place of the Ken Burns move on the still.
 *
 * The scene's duration is snapped to the clip's own length so the cut matches
 * the footage rather than silently truncating it; the user can still override
 * that afterwards in the edit table.
 */
export async function uploadSceneClip(
  _prev: ClipState,
  formData: FormData,
): Promise<ClipState> {
  const requestId = String(formData.get("requestId") ?? "").trim();
  const assetId = String(formData.get("assetId") ?? "").trim();
  const file = formData.get("clip");

  if (!requestId || !assetId) {
    return { ok: false, message: "Missing scene reference — reload and try again." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a video file first." };
  }
  if (file.size > MAX_CLIP_BYTES) {
    return {
      ok: false,
      message: `That clip is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is ${MAX_CLIP_BYTES / 1024 / 1024}MB. Trim it or export at a lower bitrate.`,
    };
  }

  const extension = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!CLIP_EXTENSIONS.has(extension)) {
    return { ok: false, message: `Unsupported file type ".${extension}" — use mp4, mov or webm.` };
  }

  try {
    const clipsDir = path.join(mediaDir(), "clips");
    await fs.mkdir(clipsDir, { recursive: true });

    const stem = `${requestId}_${assetId}`;
    const fileName = `${stem}_${Date.now()}.${extension}`;
    const absolute = path.join(clipsDir, fileName);
    await fs.writeFile(absolute, Buffer.from(await file.arrayBuffer()));

    // Probe before recording: a file that ffprobe can't read would fail much
    // later, mid-render, with a far less obvious message.
    let info;
    try {
      info = await probeMedia(absolute);
    } catch {
      await fs.rm(absolute, { force: true });
      return { ok: false, message: "That file isn't readable as video — try re-exporting it." };
    }

    // Drop this scene's previous clip, same bare-timestamp rule the image and
    // reel renderers use so one scene can't delete another's file.
    const prefix = `${stem}_`;
    for (const existing of await fs.readdir(clipsDir).catch(() => [])) {
      if (
        existing !== fileName &&
        existing.startsWith(prefix) &&
        /^\d+\.[a-z0-9]+$/i.test(existing.slice(prefix.length))
      ) {
        await fs.rm(path.join(clipsDir, existing), { force: true });
      }
    }

    await saveSceneClip({
      requestId,
      assetId,
      localPath: `/generated/clips/${fileName}`,
      durationSec: info.durationSec,
      width: info.width,
      height: info.height,
      hasAudio: info.hasAudio,
      originalName: file.name,
    });

    // Snap the scene's slot to the footage, capped to the editor's own range.
    const { postId, sceneIndex } = parseAssetId(assetId);
    if (sceneIndex !== undefined) {
      const reel = await getReel(requestId, postId);
      if (reel) {
        const current = reelEditFor(reel.scenes.length, await getReelEdit(requestId, postId));
        current.scenes[sceneIndex] = {
          ...current.scenes[sceneIndex],
          durationSec: clamp(info.durationSec, 1, 15, current.scenes[sceneIndex].durationSec),
        };
        await saveReelEdit({ ...current, requestId, postId });
      }
    }

    revalidatePath("/reels");
    return {
      ok: true,
      message: `Added ${info.durationSec.toFixed(1)}s of footage${info.hasAudio ? " with sound" : ""}. Re-render to see it.`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Detach a scene's footage and fall back to its generated still. */
export async function removeSceneClip(
  _prev: ClipState,
  formData: FormData,
): Promise<ClipState> {
  const requestId = String(formData.get("requestId") ?? "").trim();
  const assetId = String(formData.get("assetId") ?? "").trim();
  if (!requestId || !assetId) {
    return { ok: false, message: "Missing scene reference — reload and try again." };
  }

  try {
    const removed = await clearSceneClip(requestId, assetId);
    if (removed) {
      await fs.rm(
        mediaPathFor(removed.localPath),
        { force: true },
      );
    }
    revalidatePath("/reels");
    return { ok: true, message: "Back to the generated still." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export type RenderState = { ok: boolean; message: string } | null;

/**
 * Assemble one reel's frames into an MP4.
 *
 * Validation happens inline so the user is told immediately why a render can't
 * start — a missing frame, no ffmpeg — but the encode itself is
 * fire-and-forget. A 30-second reel takes far longer to encode than a form
 * submission should stay open, and progress is visible via the job record.
 */
export async function renderReel(
  _prev: RenderState,
  formData: FormData,
): Promise<RenderState> {
  const requestId = String(formData.get("requestId") ?? "").trim();
  const postId = String(formData.get("postId") ?? "").trim();
  if (!requestId || !postId) {
    return { ok: false, message: "Missing reel reference — reload the page and try again." };
  }

  if (!(await hasFfmpeg())) {
    return {
      ok: false,
      message:
        "ffmpeg isn't available on this machine, so video can't be assembled. Install it, or set FFMPEG_PATH in .env.local.",
    };
  }

  const [reel, jobs, savedEdit, clips] = await Promise.all([
    getReel(requestId, postId),
    latestJobByPostForRequest(requestId),
    getReelEdit(requestId, postId),
    clipsForRequest(requestId),
  ]);

  if (!reel || reel.scenes.length === 0) {
    return { ok: false, message: "This reel has no storyboard yet — write one first." };
  }

  const toAbsolute = (publicPath: string) =>
    mediaPathFor(publicPath);

  // Every scene needs something to show — uploaded footage, or a generated
  // still. Rendering a partial reel would quietly ship a video missing its
  // middle, which is worse than refusing.
  const missing: number[] = [];
  const sources = reel.scenes.map((_, i) => {
    const assetId = sceneAssetId(postId, i);
    const clip = clips[assetId];
    if (clip) return { imagePath: "", clip };

    const job = jobs[assetId];
    if (job?.status !== "complete" || !job.result?.localPath) {
      missing.push(i + 1);
      return { imagePath: "", clip: undefined };
    }
    return { imagePath: toAbsolute(job.result.localPath), clip: undefined };
  });

  if (missing.length > 0) {
    return {
      ok: false,
      message: `Scene${missing.length > 1 ? "s" : ""} ${missing.join(", ")} ${
        missing.length > 1 ? "have" : "has"
      } no frame or clip yet. Generate the frames first, or upload footage.`,
    };
  }

  const edit = reelEditFor(reel.scenes.length, savedEdit);
  const scenes = reel.scenes.map((scene, i) => ({
    imagePath: sources[i].imagePath,
    durationSec: edit.scenes[i].durationSec,
    motion: edit.scenes[i].motion,
    text: scene.onScreenText,
    clip: sources[i].clip
      ? {
          path: toAbsolute(sources[i].clip!.localPath),
          durationSec: sources[i].clip!.durationSec,
          hasAudio: sources[i].clip!.hasAudio,
        }
      : null,
  }));

  const stem = `${requestId}_${postId}`;
  const fileName = `${stem}_${Date.now()}.mp4`;
  const reelsDir = path.join(mediaDir(), "reels");
  const duration = reelDuration(scenes, edit.transitionSec);

  const job = await recordReelRender({
    requestId,
    postId,
    sceneCount: scenes.length,
    durationSec: duration,
  });

  void (async () => {
    try {
      const result = await renderReelVideo({
        scenes,
        transitionSec: edit.transitionSec,
        outputPath: path.join(reelsDir, fileName),
        burnText: edit.burnText,
      });

      // Drop this reel's previous videos. Same rule as the image renderer: the
      // tail must be a bare timestamp so one reel can't delete another's file.
      const prefix = `${stem}_`;
      for (const existing of await fs.readdir(reelsDir).catch(() => [])) {
        if (
          existing !== fileName &&
          existing.startsWith(prefix) &&
          /^\d+\.mp4$/.test(existing.slice(prefix.length))
        ) {
          await fs.rm(path.join(reelsDir, existing), { force: true });
        }
      }

      await updateReelRender(job.id, {
        status: "complete",
        localPath: `/generated/reels/${fileName}`,
        durationSec: result.durationSec,
        textBurned: result.textBurned,
      });
    } catch (e) {
      await updateReelRender(job.id, {
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      });
    }
    revalidatePath("/reels");
  })();

  revalidatePath("/reels");
  return {
    ok: true,
    message: `Rendering ${scenes.length} scenes — about ${Math.round(duration)}s of video. Refresh in a moment.`,
  };
}

/**
 * Write (or rewrite) one reel's storyboard with the AI reel director.
 *
 * Deliberately does not generate frames as a side effect. A storyboard is
 * cheap and fast; seven frames at the free provider's one-per-15-seconds is
 * two minutes of waiting. Keeping them separate lets the user read the scenes
 * and re-direct before spending that time.
 */
export async function writeStoryboard(
  _prev: StoryboardState,
  formData: FormData,
): Promise<StoryboardState> {
  const requestId = String(formData.get("requestId") ?? "").trim();
  const postId = String(formData.get("postId") ?? "").trim();
  const instruction = String(formData.get("instruction") ?? "").trim();
  if (!requestId || !postId) {
    return { ok: false, message: "Missing reel reference — reload the page and try again." };
  }

  try {
    const [bucket, creative, request] = await Promise.all([
      getBucketResult(requestId),
      getCreativeResult(requestId),
      getRequest(requestId),
    ]);

    const post = bucket?.posts.find((p) => p.id === postId);
    if (!post) {
      return { ok: false, message: "This post is no longer in the current calendar." };
    }
    const brief = creative?.briefs.find((b) => b.postId === postId);

    const board = await generateStoryboard({
      brandName: request?.companyName ?? "the brand",
      industry: request?.industry,
      topic: post.topic,
      platform: post.platform,
      contentType: post.contentType,
      conceptName: brief?.conceptName,
      insight: brief?.insight,
      emotionalTone: brief?.emotionalTone,
      aesthetic: brief?.visualDirection.aesthetic,
      whyThisPost: post.whyThisPost,
      instruction,
    });

    await saveStoryboard({ requestId, postId, ...board });

    revalidatePath("/reels");
    return {
      ok: true,
      message: `${board.scenes.length} scenes, ${board.totalDuration}. Generate the frames to see it.`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Render a still frame for every scene of one reel that doesn't have one.
 *
 * Same fire-and-forget, paced-sequential shape as the Asset Library's
 * generate-all, and for the same reason: the free provider allows one image
 * per 15 seconds, which is far longer than a form submission should be held
 * open. Progress is written to each job as it lands, so a refresh shows it.
 */
export async function generateAllFrames(formData: FormData) {
  const requestId = String(formData.get("requestId") ?? "").trim();
  const postId = String(formData.get("postId") ?? "").trim();
  if (!requestId || !postId) throw new Error("requestId and postId are required");

  const [reel, existing, clips] = await Promise.all([
    getReel(requestId, postId),
    latestJobByPostForRequest(requestId),
    clipsForRequest(requestId),
  ]);

  const targets = (reel?.scenes ?? [])
    .map((_, index) => sceneAssetId(postId, index))
    .filter((assetId) => {
      // A scene with uploaded footage doesn't need a still — generating one
      // would spend a rate-limited slot on an image nothing will render.
      if (clips[assetId]) return false;
      const job = existing[assetId];
      // Skip finished and in-flight frames; retry failures.
      return job?.status !== "complete" && job?.status !== "generating";
    });

  if (targets.length === 0) {
    revalidatePath("/reels");
    return;
  }

  const spacing = providerSpacingMs(activeImageProvider());

  void (async () => {
    for (const [index, assetId] of targets.entries()) {
      if (index > 0) {
        await new Promise((resolve) => setTimeout(resolve, spacing));
      }
      try {
        await generateImageForPost(requestId, assetId);
      } catch {
        // Failures are recorded on the job itself; one bad frame must not
        // abort the rest of the reel.
      }
    }
  })();

  revalidatePath("/reels");
}
