"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Badge, Button, Select, Spinner } from "@/components/ui";
import { MOTION_OPTIONS } from "@/lib/reel-types";
import type { Reel } from "@/lib/reel-types";
import type { SceneEdit } from "@/lib/reel-edit-store";
import type { ReelRender } from "@/lib/reel-render-store";
import { renderReel, saveReelSettings, type RenderState } from "@/app/reels/actions";

/**
 * The cutting room for one reel: pacing, camera moves, and the assembled video.
 *
 * Settings and rendering are two separate forms on purpose. Encoding takes
 * far longer than adjusting a duration, so tuning the edit stays instant and
 * you spend the render only when you actually want to watch it back.
 */
export default function ReelEditor({
  requestId,
  reel,
  edit,
  render,
  framesReady,
}: {
  requestId: string;
  reel: Reel;
  /** Settings in force, defaults already filled in. */
  edit: { transitionSec: number; burnText: boolean; scenes: SceneEdit[] };
  render?: ReelRender;
  /** How many scenes have a rendered still. */
  framesReady: number;
}) {
  const [state, startRender] = useActionState<RenderState, FormData>(renderReel, null);

  const allFramesReady = framesReady === reel.scenes.length && reel.scenes.length > 0;
  const rendering = render?.status === "rendering";
  const runtime = edit.scenes.reduce((sum, s) => sum + s.durationSec, 0) -
    Math.max(0, reel.scenes.length - 1) * edit.transitionSec;

  return (
    <details className="mt-4 border-t border-line pt-3">
      <summary className="cursor-pointer select-none text-xs font-medium text-fg-2">
        🎞️ Edit &amp; render video
        {render?.status === "complete" && (
          <span className="ml-2 align-middle">
            <Badge tone="good">Video ready</Badge>
          </span>
        )}
      </summary>

      {/* --- the rendered video ------------------------------------------- */}
      {render?.status === "complete" && render.localPath && (
        <div className="mt-3 flex flex-wrap items-start gap-3">
          <video
            key={render.localPath}
            src={render.localPath}
            controls
            playsInline
            preload="metadata"
            className="w-40 shrink-0 rounded-lg border border-line bg-black"
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-xs text-fg-2">
              {render.durationSec ? `${render.durationSec.toFixed(1)}s` : ""} ·{" "}
              {render.sceneCount} scenes · 1080×1920
            </p>
            {render.textBurned === false && edit.burnText && (
              <p className="text-[11px] text-warn">
                Captions were skipped — no font file was found. Set REEL_FONT_PATH to burn them.
              </p>
            )}
            <a
              href={render.localPath}
              download
              className="inline-flex items-center rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-fg-2 transition-colors hover:border-accent hover:text-fg"
            >
              ⬇ Download MP4
            </a>
            <p className="text-[11px] text-fg-3">
              Download it, then post to the brand account by hand.
            </p>
          </div>
        </div>
      )}

      {rendering && (
        <p className="mt-3 flex items-center gap-2 text-xs text-fg-2">
          <Spinner className="h-3.5 w-3.5 text-accent" />
          Encoding — usually under a minute. Refresh to see it.
        </p>
      )}

      {render?.status === "failed" && (
        <p className="mt-3 text-xs text-bad">Render failed: {render.error}</p>
      )}

      {/* --- pacing and camera moves --------------------------------------- */}
      <form action={saveReelSettings} className="mt-3 space-y-2">
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="postId" value={reel.postId} />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[380px] text-xs">
            <thead>
              <tr className="text-left text-fg-3">
                <th className="pb-1 font-medium">Scene</th>
                <th className="pb-1 font-medium">Seconds</th>
                <th className="pb-1 font-medium">Camera</th>
              </tr>
            </thead>
            <tbody>
              {edit.scenes.map((scene, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-1.5 pr-2 align-middle text-fg-2">
                    {i + 1}
                    <span className="ml-1.5 text-fg-3">{reel.scenes[i]?.timing}</span>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      type="number"
                      name={`duration_${i}`}
                      defaultValue={scene.durationSec}
                      min={1}
                      max={15}
                      step={0.5}
                      className="w-16 rounded-md border border-line bg-surface-2 px-1.5 py-1 text-xs text-fg focus:border-accent focus:outline-none"
                    />
                  </td>
                  <td className="py-1.5">
                    <Select
                      name={`motion_${i}`}
                      defaultValue={scene.motion}
                      className="py-1 text-xs"
                    >
                      {MOTION_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-fg-2">
            Crossfade
            <input
              type="number"
              name="transitionSec"
              defaultValue={edit.transitionSec}
              min={0}
              max={2}
              step={0.1}
              className="w-16 rounded-md border border-line bg-surface-2 px-1.5 py-1 text-xs text-fg focus:border-accent focus:outline-none"
            />
            s
          </label>

          <label className="flex items-center gap-1.5 text-xs text-fg-2">
            <input
              type="checkbox"
              name="burnText"
              defaultChecked={edit.burnText}
              className="h-3.5 w-3.5 accent-current"
            />
            Burn on-screen text
          </label>

          <span className="text-xs text-fg-3">Runtime ≈ {runtime.toFixed(1)}s</span>

          <SaveButton />
        </div>
      </form>

      {/* --- render -------------------------------------------------------- */}
      <form action={startRender} className="mt-3">
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="postId" value={reel.postId} />
        <RenderButton
          disabled={!allFramesReady || rendering}
          hasVideo={render?.status === "complete"}
        />
      </form>

      {!allFramesReady && reel.scenes.length > 0 && (
        <p className="mt-1.5 text-[11px] text-fg-3">
          {framesReady} of {reel.scenes.length} frames rendered — generate the rest before
          assembling the video.
        </p>
      )}

      {state && (
        <p className={`mt-2 text-xs ${state.ok ? "text-good" : "text-bad"}`}>{state.message}</p>
      )}
    </details>
  );
}

/* Own components because `useFormStatus` only reports the nearest enclosing
   <form> — read from the component that renders the form, it never leaves
   `pending: false`. */

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" loading={pending}>
      {pending ? "Saving…" : "Save edit"}
    </Button>
  );
}

function RenderButton({ disabled, hasVideo }: { disabled: boolean; hasVideo: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" loading={pending} disabled={disabled}>
      {pending ? "Starting…" : hasVideo ? "🎬 Re-render video" : "🎬 Assemble video"}
    </Button>
  );
}
