import { spawn } from "child_process";

/**
 * Thin wrapper around the ffmpeg binary.
 *
 * Arguments are passed as an array and spawned without a shell, so paths
 * containing spaces — which this project's own directory does — never need
 * quoting and can't be re-parsed as extra arguments.
 */

export function ffmpegPath(): string {
  return (process.env.FFMPEG_PATH ?? "").trim() || "ffmpeg";
}

/** Whether an ffmpeg binary can actually be launched, checked once per process. */
let ffmpegAvailable: Promise<boolean> | undefined;

export function hasFfmpeg(): Promise<boolean> {
  ffmpegAvailable ??= new Promise<boolean>((resolve) => {
    const probe = spawn(ffmpegPath(), ["-version"], { windowsHide: true });
    probe.on("error", () => resolve(false));
    probe.on("close", (code) => resolve(code === 0));
  });
  return ffmpegAvailable;
}

export function ffprobePath(): string {
  const configured = (process.env.FFMPEG_PATH ?? "").trim();
  // ffprobe ships beside ffmpeg, so derive it from an explicit FFMPEG_PATH
  // rather than making the user set a second variable for the same install.
  if (configured) return configured.replace(/ffmpeg(\.exe)?$/i, (m) => m.replace(/ffmpeg/i, "ffprobe"));
  return "ffprobe";
}

export type MediaInfo = {
  durationSec: number;
  width: number;
  height: number;
  hasAudio: boolean;
};

/**
 * Read a media file's shape with ffprobe.
 *
 * Used on upload so the app knows a clip's real duration and whether it
 * carries sound, rather than trusting the browser or guessing from the
 * extension.
 */
export async function probeMedia(file: string): Promise<MediaInfo> {
  const json = await new Promise<string>((resolve, reject) => {
    const child = spawn(
      ffprobePath(),
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,width,height",
        "-of",
        "json",
        file,
      ],
      { windowsHide: true },
    );

    let out = "";
    let err = "";
    child.stdout.on("data", (c: Buffer) => (out += c.toString()));
    child.stderr.on("data", (c: Buffer) => (err = (err + c.toString()).slice(-2000)));
    child.on("error", (e) => reject(new FfmpegError(`Could not run ffprobe: ${e.message}`, err)));
    child.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new FfmpegError(`ffprobe exited ${code}`, err)),
    );
  });

  const parsed = JSON.parse(json) as {
    format?: { duration?: string };
    streams?: { codec_type?: string; width?: number; height?: number }[];
  };

  const streams = parsed.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  if (!video) throw new FfmpegError("That file has no video stream.", "");

  const duration = Number(parsed.format?.duration);
  return {
    durationSec: Number.isFinite(duration) ? duration : 0,
    width: video.width ?? 0,
    height: video.height ?? 0,
    hasAudio: streams.some((s) => s.codec_type === "audio"),
  };
}

export class FfmpegError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "FfmpegError";
  }
}

/**
 * Run ffmpeg to completion.
 *
 * Only the tail of stderr is kept. ffmpeg is extremely chatty and a failed
 * encode can emit megabytes; the last few lines are where the actual cause is,
 * and they are what ends up on the job record the user sees.
 */
export async function runFfmpeg(args: string[], timeoutMs = 10 * 60_000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath(), args, { windowsHide: true });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new FfmpegError(`ffmpeg timed out after ${Math.round(timeoutMs / 1000)}s`, stderr));
    }, timeoutMs);

    child.on("error", (e) => {
      clearTimeout(timer);
      reject(
        new FfmpegError(
          `Could not run ffmpeg (${ffmpegPath()}): ${e.message}. Install it, or set FFMPEG_PATH.`,
          stderr,
        ),
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      const tail = stderr.trim().split("\n").slice(-4).join(" ").slice(0, 400);
      reject(new FfmpegError(`ffmpeg exited with code ${code}: ${tail}`, stderr));
    });
  });
}
