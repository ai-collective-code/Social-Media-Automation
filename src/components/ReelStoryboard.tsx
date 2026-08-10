"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { Badge, Button, Card, Dot, SectionHeading, Spinner, Textarea } from "@/components/ui";
import RefinePanel from "@/components/RefinePanel";
import ReelEditor from "@/components/ReelEditor";
import { sceneAssetId } from "@/lib/reel-types";
import type { Reel, ReelScene } from "@/lib/reel-types";
import type { SceneEdit } from "@/lib/reel-edit-store";
import type { ReelRender } from "@/lib/reel-render-store";
import {
  writeStoryboard,
  generateAllFrames,
  saveCast,
  uploadSceneClip,
  removeSceneClip,
  type StoryboardState,
  type ClipState,
} from "@/app/reels/actions";
import type { SceneClip } from "@/lib/scene-clip-store";
import { generateOneImage } from "@/app/assets/actions";
import type { ImageJob } from "@/lib/canva-store";
import type { PromptOverride } from "@/lib/prompt-override-store";

/**
 * One reel: its storyboard, and a still frame per scene.
 *
 * The frames are the point. A reel brief written as prose is impossible to
 * judge — you cannot tell whether the cut works until you see the shots next
 * to each other in order. Rendering each scene as a vertical still turns the
 * storyboard into something you can actually critique, and gives whoever
 * shoots it a reference per beat.
 */
export default function ReelStoryboard({
  requestId,
  reel,
  jobs,
  overrides,
  clips,
  canGenerate,
  edit,
  render,
}: {
  requestId: string;
  reel: Reel;
  /** Image jobs for this run, keyed by scene asset id. */
  jobs: Record<string, ImageJob>;
  overrides: Record<string, PromptOverride>;
  /** Uploaded footage for this run, keyed by scene asset id. */
  clips: Record<string, SceneClip>;
  /** False when no image provider is configured. */
  canGenerate: boolean;
  /** Edit settings in force, defaults already filled in. */
  edit: { transitionSec: number; burnText: boolean; scenes: SceneEdit[] };
  render?: ReelRender;
}) {
  const [state, write] = useActionState<StoryboardState, FormData>(writeStoryboard, null);

  const sceneJobs = reel.scenes.map((_, i) => jobs[sceneAssetId(reel.postId, i)]);
  const sceneClips = reel.scenes.map((_, i) => clips[sceneAssetId(reel.postId, i)]);
  // A scene with uploaded footage needs no still — the clip replaces it.
  const missing = sceneJobs.filter(
    (j, i) => !sceneClips[i] && j?.status !== "complete" && j?.status !== "generating",
  ).length;
  const ready = reel.scenes.filter(
    (_, i) => sceneClips[i] || sceneJobs[i]?.status === "complete",
  ).length;
  const busy = sceneJobs.some((j) => j?.status === "generating");

  return (
    <Card>
      <SectionHeading
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {reel.conceptName}
            <Badge tone={reel.source === "none" ? "warn" : "good"}>
              <Dot tone={reel.source === "none" ? "warn" : "good"} />
              {reel.source === "storyboard"
                ? "AI storyboard"
                : reel.source === "brief"
                  ? "From brief"
                  : "No storyboard"}
            </Badge>
            {reel.totalDuration && <Badge tone="neutral">{reel.totalDuration}</Badge>}
          </span>
        }
        subtitle={`${reel.day} · ${reel.time} — ${reel.platform} · ${reel.contentType}`}
        action={
          reel.scenes.length > 0 && canGenerate && missing > 0 ? (
            <form action={generateAllFrames}>
              <input type="hidden" name="requestId" value={requestId} />
              <input type="hidden" name="postId" value={reel.postId} />
              <FramesButton count={missing} />
            </form>
          ) : null
        }
      />

      <p className="mt-3 text-sm text-fg-2">{reel.topic}</p>

      {reel.hook && (
        <p className="mt-3 rounded-lg border border-accent-border bg-accent-soft px-3 py-2 text-sm font-medium text-fg">
          <span className="text-fg-3">Hook · </span>
          {reel.hook}
        </p>
      )}

      {busy && (
        <p className="mt-3 flex items-center gap-2 text-xs text-fg-2">
          <Spinner className="h-3.5 w-3.5 text-accent" />
          Rendering frames — the free tier does one every 15 seconds. Refresh to see progress.
        </p>
      )}

      {/* --- casting --------------------------------------------------------- */}
      {reel.scenes.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer select-none text-xs font-medium text-fg-2">
            🎭 Cast — the person in every scene
            {!reel.cast && (
              <span className="ml-2 align-middle">
                <Badge tone="warn">not locked</Badge>
              </span>
            )}
          </summary>
          <form action={saveCast} className="mt-2 space-y-2">
            <input type="hidden" name="requestId" value={requestId} />
            <input type="hidden" name="postId" value={reel.postId} />
            <Textarea
              name="cast"
              rows={3}
              className="text-[12px]"
              defaultValue={reel.cast}
              placeholder="e.g. A woman in her mid-thirties, medium build, brown skin, shoulder-length black hair tied back, small scar above her left eyebrow, wearing a faded olive riding jacket over a grey tee throughout."
            />
            <p className="text-[11px] text-fg-3">
              Every frame is a separate image call with no memory of the others, so without this
              each scene invents a new person. This text is repeated into every scene&apos;s prompt.
              Regenerate the frames after changing it.
            </p>
            <CastButton />
          </form>
        </details>
      )}

      {/* --- scenes ---------------------------------------------------------- */}
      {reel.scenes.length === 0 ? (
        <p className="mt-4 rounded-lg border border-line bg-surface-2 px-3 py-3 text-sm text-fg-2">
          This post is a video format, but the creative stage wrote it up as a still, so it has
          no scene direction. Write a storyboard below to give it one.
        </p>
      ) : (
        <div className="mt-4 flex snap-x gap-3 overflow-x-auto pb-2">
          {reel.scenes.map((scene, index) => (
            <SceneCard
              key={index}
              requestId={requestId}
              assetId={sceneAssetId(reel.postId, index)}
              index={index}
              scene={scene}
              job={jobs[sceneAssetId(reel.postId, index)]}
              override={overrides[sceneAssetId(reel.postId, index)]}
              clip={clips[sceneAssetId(reel.postId, index)]}
              canGenerate={canGenerate}
            />
          ))}
        </div>
      )}

      {reel.overallDirection && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer select-none text-xs font-medium text-fg-2">
            Direction — look, pace, sound
          </summary>
          <p className="mt-2 whitespace-pre-line leading-relaxed text-fg-2">
            {reel.overallDirection}
          </p>
        </details>
      )}

      {reel.caption && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer select-none text-xs font-medium text-fg-2">
            Caption &amp; hashtags
          </summary>
          <p className="mt-2 whitespace-pre-line leading-relaxed text-fg-2">{reel.caption}</p>
          {reel.hashtags.length > 0 && (
            <p className="mt-2 text-sm text-accent">
              {reel.hashtags.map((h) => `#${h}`).join(" ")}
            </p>
          )}
        </details>
      )}

      {reel.scenes.length > 0 && canGenerate && (
        <ReelEditor
          requestId={requestId}
          reel={reel}
          edit={edit}
          render={render}
          framesReady={ready}
        />
      )}

      {/* --- AI reel director ------------------------------------------------ */}
      <details className="mt-4 border-t border-line pt-3">
        <summary className="cursor-pointer select-none text-xs font-medium text-fg-2">
          🎬 {reel.scenes.length > 0 ? "Rewrite storyboard with AI" : "Write storyboard with AI"}
        </summary>
        <form action={write} className="mt-2 space-y-2">
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="postId" value={reel.postId} />
          <Textarea
            name="instruction"
            rows={2}
            className="text-[12px]"
            placeholder="Optional direction — e.g. 'open on the rider, not the bike', 'keep it under 30 seconds', 'no voiceover, text only'."
          />
          <StoryboardButton rewrite={reel.scenes.length > 0} />
        </form>
        {reel.scenes.length > 0 && (
          <p className="mt-1.5 text-[11px] text-fg-3">
            Rewriting replaces the scenes. Frames already rendered stay until you regenerate them.
          </p>
        )}
      </details>

      {state && (
        <p className={`mt-2 text-xs ${state.ok ? "text-good" : "text-bad"}`}>{state.message}</p>
      )}
    </Card>
  );
}

function SceneCard({
  requestId,
  assetId,
  index,
  scene,
  job,
  override,
  clip,
  canGenerate,
}: {
  requestId: string;
  assetId: string;
  index: number;
  scene: ReelScene;
  job?: ImageJob;
  override?: PromptOverride;
  clip?: SceneClip;
  canGenerate: boolean;
}) {
  const done = job?.status === "complete" && job.result;

  return (
    <div className="w-56 shrink-0 snap-start rounded-xl border border-line bg-canvas-raised">
      {/* 9:16 — the frame reels are actually shot and watched in. */}
      <div className="relative flex aspect-[9/16] items-center justify-center overflow-hidden rounded-t-xl bg-surface-2">
        {clip ? (
          // Real footage wins the preview: it is what the render will use.
          <video
            key={clip.localPath}
            src={clip.localPath}
            controls
            playsInline
            muted
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : done ? (
          <Image
            src={job.result!.localPath}
            alt={`Scene ${index + 1}`}
            width={job.result!.width}
            height={job.result!.height}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : job?.status === "generating" ? (
          <Spinner className="h-5 w-5 text-accent" />
        ) : job?.status === "failed" ? (
          <div className="px-3 text-center">
            <Badge tone="bad">Failed</Badge>
            {job.error && <p className="mt-1 line-clamp-3 text-[10px] text-fg-3">{job.error}</p>}
          </div>
        ) : (
          <span className="px-3 text-center text-[11px] text-fg-3">No frame yet</span>
        )}

        <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {index + 1}
          {scene.timing ? ` · ${scene.timing}` : ""}
        </span>

        {clip && (
          <span className="absolute right-1.5 top-1.5 rounded bg-good/85 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            🎥 {clip.durationSec.toFixed(1)}s{clip.hasAudio ? " ♪" : ""}
          </span>
        )}

        {/* On-screen text is shown OVER the frame because that is where it ends
            up in the edit — but it is never sent to the image model, which
            would render it as gibberish. */}
        {scene.onScreenText && (
          <span className="absolute inset-x-1.5 bottom-1.5 rounded bg-black/65 px-1.5 py-1 text-center text-[10px] font-semibold uppercase leading-tight tracking-wide text-white">
            {scene.onScreenText}
          </span>
        )}
      </div>

      <div className="space-y-1.5 p-2.5">
        <p className="line-clamp-4 text-[11px] leading-snug text-fg-2">{scene.shot}</p>

        {scene.voiceover && (
          <p className="line-clamp-3 border-l-2 border-line pl-2 text-[11px] italic leading-snug text-fg-3">
            “{scene.voiceover}”
          </p>
        )}

        {canGenerate && !clip && (
          <>
            <form action={generateOneImage}>
              <input type="hidden" name="requestId" value={requestId} />
              <input type="hidden" name="postId" value={assetId} />
              <FrameButton done={Boolean(done)} />
            </form>
            <RefinePanel
              requestId={requestId}
              postId={assetId}
              override={override}
              disabled={job?.status === "generating"}
            />
          </>
        )}

        <SceneClipPanel requestId={requestId} assetId={assetId} clip={clip} />
      </div>
    </div>
  );
}

/**
 * Attach real footage to one scene.
 *
 * Sits on every scene because the tools that produce the best video — Google
 * Flow among them — have no API to call. Generating there and dropping the
 * file here is the whole bridge, and it costs nothing.
 */
function SceneClipPanel({
  requestId,
  assetId,
  clip,
}: {
  requestId: string;
  assetId: string;
  clip?: SceneClip;
}) {
  const [uploadState, upload] = useActionState<ClipState, FormData>(uploadSceneClip, null);
  const [removeState, remove] = useActionState<ClipState, FormData>(removeSceneClip, null);
  const status = uploadState ?? removeState;

  return (
    <div className="border-t border-line pt-1.5">
      <details className="group">
        <summary className="cursor-pointer list-none text-[11px] font-medium text-fg-2 transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
          {clip ? "🎥 Footage — replace" : "🎥 Use real video"}
        </summary>

        <div className="mt-1.5 space-y-1.5">
          {clip && (
            <p className="truncate text-[10px] text-fg-3" title={clip.originalName}>
              {clip.originalName}
            </p>
          )}

          <form action={upload} className="space-y-1.5">
            <input type="hidden" name="requestId" value={requestId} />
            <input type="hidden" name="assetId" value={assetId} />
            <input
              type="file"
              name="clip"
              accept="video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm,.m4v"
              required
              className="w-full text-[10px] text-fg-3 file:mr-1.5 file:rounded file:border file:border-line file:bg-surface-2 file:px-1.5 file:py-0.5 file:text-[10px] file:text-fg-2"
            />
            <ClipUploadButton hasClip={Boolean(clip)} />
          </form>

          {clip && (
            <form action={remove}>
              <input type="hidden" name="requestId" value={requestId} />
              <input type="hidden" name="assetId" value={assetId} />
              <ClipRemoveButton />
            </form>
          )}

          <p className="text-[10px] leading-snug text-fg-3">
            Replaces this scene&apos;s still and its camera move. Generate it in Google Flow
            (your plan includes credits), then drop the file here.
          </p>
        </div>
      </details>

      {status && (
        <p className={`mt-1 text-[10px] leading-snug ${status.ok ? "text-good" : "text-bad"}`}>
          {status.message}
        </p>
      )}
    </div>
  );
}

/* Each submit button is its own component because `useFormStatus` only reports
   the nearest enclosing <form> — read from the component that renders the
   form, it never leaves `pending: false`. */

function ClipUploadButton({ hasClip }: { hasClip: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" className="w-full" loading={pending}>
      {pending ? "Uploading…" : hasClip ? "Replace footage" : "Attach footage"}
    </Button>
  );
}

function ClipRemoveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" size="sm" className="w-full" loading={pending}>
      {pending ? "Removing…" : "Remove footage"}
    </Button>
  );
}

function CastButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" loading={pending}>
      {pending ? "Saving…" : "Lock cast"}
    </Button>
  );
}

function FramesButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" loading={pending}>
      {pending ? "Starting…" : `Generate ${count} frame${count > 1 ? "s" : ""}`}
    </Button>
  );
}

function FrameButton({ done }: { done: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" className="w-full" loading={pending}>
      {pending ? "Rendering…" : done ? "Regenerate" : "Generate frame"}
    </Button>
  );
}

function StoryboardButton({ rewrite }: { rewrite: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" loading={pending}>
      {pending ? "Directing…" : rewrite ? "Rewrite storyboard" : "Write storyboard"}
    </Button>
  );
}
