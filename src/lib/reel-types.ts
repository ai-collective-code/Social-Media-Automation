/**
 * Reel shapes and the scene-asset id scheme.
 *
 * Import-free on purpose: the reels UI is a Client Component and needs
 * `sceneAssetId` as a runtime value. Importing that from a module that reaches
 * `fs` would drag the filesystem into the browser bundle — a failure that
 * typechecks cleanly and only appears as a 500 at runtime.
 */

/**
 * Formats that are actually video.
 *
 * Broader than the regex the creative stage originally shipped with
 * (`/reel|video|tiktok/i`), which silently missed "YouTube Shorts",
 * "YouTube Long-Form" and "Route Documentary (Long-Form Film)" — so genuinely
 * video posts were written up as stills and got no scene direction at all.
 */
const VIDEO_SIGNALS =
  /\b(reels?|video|tiktok|shorts?|film|documentary|vlog|youtube|igtv|live)\b/i;

export function isVideoFormat(...parts: (string | undefined)[]): boolean {
  return parts.some((part) => Boolean(part) && VIDEO_SIGNALS.test(part!));
}

/**
 * How a still frame moves during its scene.
 *
 * A reel assembled from motionless stills reads as a slideshow, not a video.
 * A slow push or drift is what makes a generated frame feel filmed — the same
 * trick documentary editors use on photographs.
 */
export type MotionKind = "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "still";

export const MOTION_OPTIONS: { value: MotionKind; label: string }[] = [
  { value: "zoom-in", label: "Push in" },
  { value: "zoom-out", label: "Pull out" },
  { value: "pan-left", label: "Drift left" },
  { value: "pan-right", label: "Drift right" },
  { value: "still", label: "Hold still" },
];

/**
 * Alternating default so a reel has rhythm without anyone choosing per scene.
 * Consecutive scenes never share a move, which is what makes cuts read.
 */
const MOTION_CYCLE: MotionKind[] = ["zoom-in", "pan-right", "zoom-out", "pan-left"];

export function defaultMotion(sceneIndex: number): MotionKind {
  return MOTION_CYCLE[sceneIndex % MOTION_CYCLE.length];
}

/** Seconds a scene holds when nothing has been set — a typical reel beat. */
export const DEFAULT_SCENE_SECONDS = 4;
/** Crossfade length between scenes. */
export const DEFAULT_TRANSITION_SECONDS = 0.5;

export type ReelScene = {
  /** e.g. "0:00–0:04". Display only; nothing parses it. */
  timing: string;
  /** What the camera sees. Doubles as the seed for this scene's still frame. */
  shot: string;
  /** What is said over this scene, if anything. */
  voiceover?: string | null;
  /**
   * Text burned onto the frame. Held apart from `shot` for the same reason
   * `CreativeBrief.imagePrompt.textOverlay` is: an image model renders
   * lettering as gibberish, so it must never reach the generation prompt.
   */
  onScreenText?: string | null;
};

/**
 * A locked physical description of whoever recurs across a reel's scenes.
 *
 * Text-to-image models have no memory between calls, so each scene invents a
 * new person unless the same concrete description is repeated in every prompt.
 * That is the whole reason a reel of generated stills reads as four different
 * people wearing four different outfits. Specific, unchanging details —
 * approximate age, build, hair, face, exact clothing — are what pull the
 * frames back towards one character.
 */
export type ReelCast = string;

export type Reel = {
  postId: string;
  /** Empty when the storyboard predates casting, or has no recurring person. */
  cast: ReelCast;
  day: string;
  time: string;
  platform: string;
  contentType: string;
  topic: string;
  conceptName: string;
  hook: string;
  caption: string;
  hashtags: string[];
  totalDuration: string;
  overallDirection: string;
  scenes: ReelScene[];
  /** Where the storyboard came from — the pipeline, or the reels page itself. */
  source: "brief" | "storyboard" | "none";
};

/**
 * Scene frames reuse the image-job machinery by taking an id of their own.
 *
 * Only `_` and digits are added, so the id stays safe in a filename and a URL,
 * and every existing lookup keyed by post id keeps working unchanged.
 */
const SCENE_SEPARATOR = "__s";

export function sceneAssetId(postId: string, sceneIndex: number): string {
  return `${postId}${SCENE_SEPARATOR}${sceneIndex}`;
}

export function parseAssetId(assetId: string): { postId: string; sceneIndex?: number } {
  const at = assetId.lastIndexOf(SCENE_SEPARATOR);
  if (at === -1) return { postId: assetId };
  const suffix = assetId.slice(at + SCENE_SEPARATOR.length);
  if (!/^\d+$/.test(suffix)) return { postId: assetId };
  return { postId: assetId.slice(0, at), sceneIndex: Number(suffix) };
}
