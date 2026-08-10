import TopBar from "@/components/TopBar";
import { Callout, EmptyState, StatTile } from "@/components/ui";
import ReelStoryboard from "@/components/ReelStoryboard";
import { latestJobByPostForRequest } from "@/lib/canva-store";
import { getActiveCycle } from "@/lib/active-brand";
import { activeImageProvider } from "@/lib/image-generation";
import { overridesForRequest } from "@/lib/prompt-override-store";
import { getReelsForRequest } from "@/lib/reels";
import { sceneAssetId, type Reel } from "@/lib/reel-types";
import { editsForRequest, reelEditFor, type ReelEdit } from "@/lib/reel-edit-store";
import { latestRenderByPostForRequest, type ReelRender } from "@/lib/reel-render-store";
import { clipsForRequest, type SceneClip } from "@/lib/scene-clip-store";
import { hasFfmpeg } from "@/lib/video/ffmpeg";
import type { ImageJob } from "@/lib/canva-store";
import type { PromptOverride } from "@/lib/prompt-override-store";

export const dynamic = "force-dynamic";

export default async function ReelsPage() {
  const cycle = await getActiveCycle();
  const requestId = cycle?.requestId ?? "";

  const [reels, jobs, overrides, edits, renders, clips] = requestId
    ? await Promise.all([
        getReelsForRequest(requestId),
        latestJobByPostForRequest(requestId),
        overridesForRequest(requestId),
        editsForRequest(requestId),
        latestRenderByPostForRequest(requestId),
        clipsForRequest(requestId),
      ])
    : ([[], {}, {}, {}, {}, {}] as [
        Reel[],
        Record<string, ImageJob>,
        Record<string, PromptOverride>,
        Record<string, ReelEdit>,
        Record<string, ReelRender>,
        Record<string, SceneClip>,
      ]);

  const provider = activeImageProvider();
  const canGenerate = provider !== "canva";

  const sceneIds = reels.flatMap((reel) =>
    reel.scenes.map((_, index) => sceneAssetId(reel.postId, index)),
  );
  // Uploaded footage counts as ready — it replaces the still it would need.
  const framesReady = sceneIds.filter(
    (id) => clips[id] || jobs[id]?.status === "complete",
  ).length;
  const clipCount = sceneIds.filter((id) => clips[id]).length;
  const withoutStoryboard = reels.filter((reel) => reel.scenes.length === 0).length;
  const videosReady = Object.values(renders).filter((r) => r.status === "complete").length;
  const ffmpegReady = await hasFfmpeg();

  return (
    <>
      <TopBar
        title="Reels"
        subtitle={cycle ? `${cycle.brand.name} — video storyboards` : "No brand selected"}
      />

      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Video posts" value={reels.length} hint="This week's plan" />
          <StatTile label="Scenes" value={sceneIds.length} hint="Across all reels" />
          <StatTile
            label="Scenes ready"
            value={framesReady}
            tone={framesReady > 0 ? "good" : "neutral"}
            hint={clipCount > 0 ? `${clipCount} real clip${clipCount > 1 ? "s" : ""}` : "Rendered stills"}
          />
          <StatTile
            label="Videos rendered"
            value={videosReady}
            tone={videosReady > 0 ? "good" : "neutral"}
            hint={withoutStoryboard > 0 ? `${withoutStoryboard} need a storyboard` : "Ready to post"}
          />
        </div>

        {ffmpegReady ? (
          <Callout tone="neutral" title="How a reel gets made here">
            AI writes the storyboard, generates a still for every scene, then the editor assembles
            them into a real 1080×1920 MP4 — camera move per scene, crossfades, and the on-screen
            text burned in. Download it and post to the brand account by hand. The motion is
            camera movement over generated stills, not a generated video model; adding
            <code className="mx-1 rounded bg-surface-2 px-1 py-0.5 text-[11px]">VIDEO_PROVIDER</code>
            would turn each still into a live clip instead.
          </Callout>
        ) : (
          <Callout tone="warn" title="ffmpeg not found — video can't be assembled">
            Storyboards and scene frames still work, but rendering an MP4 needs ffmpeg on this
            machine. Install it, or point
            <code className="mx-1 rounded bg-surface-2 px-1 py-0.5 text-[11px]">FFMPEG_PATH</code>
            at the binary in <code className="rounded bg-surface-2 px-1 py-0.5 text-[11px]">.env.local</code>.
          </Callout>
        )}

        {!canGenerate && reels.length > 0 && (
          <Callout tone="warn" title="No image provider configured">
            Storyboards still work, but scene frames need an image provider — set
            <code className="mx-1 rounded bg-surface-2 px-1 py-0.5 text-[11px]">
              POLLINATIONS_ENABLED=true
            </code>
            for the free tier, or an OpenAI key for unwatermarked output.
          </Callout>
        )}

        {reels.length === 0 ? (
          <EmptyState title="No video posts this week">
            {cycle
              ? `${cycle.brand.name}'s current calendar has no reel, Short or film formats. Re-run content bucketing to plan some, or switch brands.`
              : "Add a brand and run the full process to plan some video posts."}
          </EmptyState>
        ) : (
          <div className="space-y-5">
            {reels.map((reel) => (
              <ReelStoryboard
                key={reel.postId}
                requestId={requestId}
                reel={reel}
                jobs={jobs}
                overrides={overrides}
                clips={clips}
                canGenerate={canGenerate}
                edit={reelEditFor(reel.scenes.length, edits[reel.postId])}
                render={renders[reel.postId]}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
