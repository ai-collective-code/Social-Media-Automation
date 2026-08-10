import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { runFfmpeg } from "@/lib/video/ffmpeg";
import type { MotionKind } from "@/lib/reel-types";

/**
 * Assembles generated scene stills into a real, postable reel.
 *
 * Each still is given a slow camera move and the scenes are crossfaded
 * together — the documentary trick for making photographs feel filmed. Without
 * it a reel of AI stills reads as a slideshow no matter how good the frames
 * are. On-screen text is burned in here rather than baked into the images,
 * because an image model renders lettering as gibberish while ffmpeg renders
 * it exactly.
 */

/** Instagram/TikTok/Shorts native frame. */
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

/**
 * zoompan works in integer steps, so zooming a frame that is only just large
 * enough makes the image visibly judder. Feeding it a frame twice the output
 * size gives the rounding somewhere to hide.
 */
const SUPERSAMPLE = 2;

export type RenderScene = {
  /** Absolute path to the still for this scene. */
  imagePath: string;
  durationSec: number;
  motion: MotionKind;
  /** Burned onto the frame. Null or empty leaves the frame clean. */
  text?: string | null;
  /**
   * Real footage for this scene, if the user uploaded any.
   *
   * When present it replaces the still entirely — and with it the Ken Burns
   * move, since the clip already has its own motion. Panning across footage
   * that is already moving reads as a mistake.
   */
  clip?: {
    /** Absolute path to the uploaded video. */
    path: string;
    durationSec: number;
    hasAudio: boolean;
  } | null;
};

export function reelDuration(scenes: { durationSec: number }[], transitionSec: number): number {
  const total = scenes.reduce((sum, s) => sum + s.durationSec, 0);
  // Every crossfade overlaps two scenes, so it is paid for once out of the sum.
  return Math.max(0.1, total - Math.max(0, scenes.length - 1) * transitionSec);
}

/* --------------------------------- text ---------------------------------- */

/**
 * Overlay text reaches drawtext via `textfile=`, never inline `text=`.
 *
 * Inline text crosses TWO escape layers (the filtergraph parser, then
 * drawtext's own), and they disagree: a line break survived one layer but not
 * the other, shipping a literal "n" into the frame - verified in a real
 * render as "Heavy low,nforward". A file has no escape layers; its bytes are
 * the text, real newlines included. Only PERCENT still needs stripping,
 * because drawtext expands its {...} expansion sequences even from a file.
 */
function sanitizeDrawtext(raw: string): string {
  return raw.replace(/%/g, "").replace(/[ ]+/g, " ").trim();
}

/** drawtext does not wrap, so lines are broken here and capped at three. */
function wrapText(text: string, maxChars = 28, maxLines = 3): string {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (!line) line = word;
    else if ((line + " " + word).length <= maxChars) line += " " + word;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out.slice(0, maxLines).join(String.fromCharCode(10));
}

/** Windows drive colons read as option separators unless escaped. */
function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

const FONT_CANDIDATES = [
  "C:/Windows/Fonts/arialbd.ttf",
  "C:/Windows/Fonts/segoeuib.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
];

let cachedFont: string | null | undefined;

/**
 * Locate a bold font for burned captions.
 *
 * Returns null when none is found, and the caller renders the reel without
 * text rather than failing the whole encode — a reel missing its captions is
 * far more useful than no reel at all.
 */
export async function resolveFontFile(): Promise<string | null> {
  if (cachedFont !== undefined) return cachedFont;

  const configured = (process.env.REEL_FONT_PATH ?? "").trim();
  for (const candidate of configured ? [configured, ...FONT_CANDIDATES] : FONT_CANDIDATES) {
    try {
      await fs.access(candidate);
      cachedFont = candidate;
      return cachedFont;
    } catch {
      // try the next one
    }
  }
  cachedFont = null;
  return cachedFont;
}

/* -------------------------------- motion --------------------------------- */

/**
 * zoompan expressions for one scene.
 *
 * Driven by `on` (the output frame index) against the scene's own frame count
 * rather than by incrementing `zoom`, so the move always lands exactly at its
 * end value regardless of duration and never drifts.
 */
function motionExpressions(motion: MotionKind, frames: number) {
  const span = Math.max(1, frames - 1);
  const centreX = "iw/2-(iw/zoom/2)";
  const centreY = "ih/2-(ih/zoom/2)";

  switch (motion) {
    case "zoom-in":
      return { z: `1+0.15*on/${span}`, x: centreX, y: centreY };
    case "zoom-out":
      return { z: `1.15-0.15*on/${span}`, x: centreX, y: centreY };
    case "pan-right":
      return { z: "1.12", x: `(iw-iw/zoom)*on/${span}`, y: centreY };
    case "pan-left":
      return { z: "1.12", x: `(iw-iw/zoom)*(1-on/${span})`, y: centreY };
    case "still":
    default:
      return { z: "1", x: centreX, y: centreY };
  }
}

function sceneFilter(
  index: number,
  scene: RenderScene,
  fontFile: string | null,
  /** Path of the pre-written text file for this scene, if it has text. */
  textFile: string | undefined,
): string {
  const frames = Math.max(1, Math.round(scene.durationSec * FPS));
  const bigW = WIDTH * SUPERSAMPLE;
  const bigH = HEIGHT * SUPERSAMPLE;

  const steps = scene.clip
    ? [
        // Real footage: trim to the scene's slot and reset timestamps so the
        // clip starts at zero wherever it lands in the timeline.
        `trim=0:${scene.durationSec.toFixed(3)}`,
        "setpts=PTS-STARTPTS",
        `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase`,
        `crop=${WIDTH}:${HEIGHT}`,
        `fps=${FPS}`,
        // A clip shorter than its slot would end the scene early and desync
        // every later crossfade; freezing the last frame keeps the timeline
        // exact. Harmless when the clip is long enough — there is nothing to pad.
        `tpad=stop_mode=clone:stop_duration=${Math.max(
          0,
          scene.durationSec - scene.clip.durationSec,
        ).toFixed(3)}`,
        "setsar=1",
      ]
    : (() => {
        const { z, x, y } = motionExpressions(scene.motion, frames);
        return [
          `scale=${bigW}:${bigH}:force_original_aspect_ratio=increase`,
          `crop=${bigW}:${bigH}`,
          `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}`,
          "setsar=1",
        ];
      })();

  if (textFile && fontFile) {
    steps.push(
      [
        `drawtext=fontfile='${escapeFilterPath(fontFile)}'`,
        `textfile='${escapeFilterPath(textFile)}'`,
        "fontcolor=white",
        "fontsize=52",
        "line_spacing=10",
        "box=1",
        "boxcolor=black@0.55",
        "boxborderw=20",
        "x=(w-text_w)/2",
        // Clear of Instagram's own caption and action overlays.
        "y=h-380",
      ].join(":"),
    );
  }

  return `[${index}:v]${steps.join(",")}[v${index}]`;
}

/* -------------------------------- render --------------------------------- */

export type RenderResult = { durationSec: number; textBurned: boolean };

export async function renderReelVideo(opts: {
  scenes: RenderScene[];
  transitionSec: number;
  /** Absolute path of the .mp4 to write. */
  outputPath: string;
  burnText: boolean;
}): Promise<RenderResult> {
  const { scenes, transitionSec, outputPath, burnText } = opts;
  if (scenes.length === 0) throw new Error("A reel needs at least one rendered frame.");

  const fontFile = await resolveFontFile();
  const duration = reelDuration(scenes, transitionSec);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  // Each scene's overlay text is written to a real file and referenced via
  // drawtext's `textfile=`. Files carry the text byte-for-byte — real
  // newlines included — where inline `text=` must survive two disagreeing
  // escape layers (see sanitizeDrawtext).
  const textDir = await fs.mkdtemp(path.join(os.tmpdir(), "reel-text-"));
  const textFiles: (string | undefined)[] = [];
  for (const [i, scene] of scenes.entries()) {
    const text = burnText && scene.text ? sanitizeDrawtext(scene.text) : "";
    if (text) {
      const file = path.join(textDir, `s${i}.txt`);
      await fs.writeFile(file, wrapText(text), "utf-8");
      textFiles[i] = file;
    }
  }

  const args: string[] = ["-y", "-loglevel", "error"];
  for (const scene of scenes) {
    if (scene.clip) {
      args.push("-i", scene.clip.path);
    } else {
      args.push("-loop", "1", "-t", scene.durationSec.toFixed(3), "-i", scene.imagePath);
    }
  }
  // A silent bed under everything: several platforms treat a video with no
  // audio stream as malformed, and it also gives amix a track to sit on when
  // no clip brings sound of its own.
  args.push(
    "-f",
    "lavfi",
    "-t",
    duration.toFixed(3),
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
  );
  const silentBed = scenes.length;

  const parts = scenes.map((scene, i) => sceneFilter(i, scene, fontFile, textFiles[i]));

  // Each scene's start on the OUTPUT timeline. Crossfades overlap two scenes,
  // so every scene after the first begins one transition earlier than the
  // running total of durations. Used for both the xfade offsets and, below,
  // to place each clip's audio.
  const sceneStarts: number[] = [];
  let elapsed = 0;
  for (const [i, scene] of scenes.entries()) {
    sceneStarts[i] = elapsed;
    elapsed += scene.durationSec - (i < scenes.length - 1 ? transitionSec : 0);
  }

  if (scenes.length === 1) {
    parts.push("[v0]null[vout]");
  } else {
    let previous = "v0";
    for (let i = 1; i < scenes.length; i += 1) {
      const label = i === scenes.length - 1 ? "vout" : `x${i}`;
      parts.push(
        `[${previous}][v${i}]xfade=transition=fade:duration=${transitionSec.toFixed(3)}:offset=${sceneStarts[i].toFixed(3)}[${label}]`,
      );
      previous = label;
    }
  }

  // Uploaded footage keeps its own sound — Veo output usually has some, and a
  // silently-muted clip would throw away half of what the user generated.
  // Each is trimmed to its slot, delayed to where the scene starts, and mixed
  // over the silent bed.
  const audioLabels: string[] = [`${silentBed}:a`];
  scenes.forEach((scene, i) => {
    if (!scene.clip?.hasAudio) return;
    const delayMs = Math.round(sceneStarts[i] * 1000);
    parts.push(
      `[${i}:a]atrim=0:${scene.durationSec.toFixed(3)},asetpts=PTS-STARTPTS,` +
        `afade=t=in:st=0:d=0.03,afade=t=out:st=${Math.max(0, scene.durationSec - 0.03).toFixed(3)}:d=0.03,` +
        `adelay=${delayMs}|${delayMs}[a${i}]`,
    );
    audioLabels.push(`a${i}`);
  });

  if (audioLabels.length > 1) {
    parts.push(
      `${audioLabels.map((l) => `[${l}]`).join("")}amix=inputs=${audioLabels.length}:duration=longest:normalize=0[aout]`,
    );
  }
  const audioMap = audioLabels.length > 1 ? "[aout]" : `${silentBed}:a`;

  args.push(
    "-filter_complex",
    parts.join(";"),
    "-map",
    "[vout]",
    "-map",
    audioMap,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(FPS),
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    // Pinned rather than relying on -shortest, which rounds up to the audio
    // track and leaves a frozen tail frame after the last crossfade.
    "-t",
    duration.toFixed(3),
    outputPath,
  );

  try {
    await runFfmpeg(args);
  } finally {
    await fs.rm(textDir, { recursive: true, force: true });
  }

  return {
    durationSec: duration,
    textBurned: burnText && Boolean(fontFile) && scenes.some((s) => Boolean(s.text)),
  };
}
