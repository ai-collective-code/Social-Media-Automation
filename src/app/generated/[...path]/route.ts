import { createReadStream } from "fs";
import { promises as fs } from "fs";
import { Readable } from "stream";
import { mediaPathFor } from "@/lib/app-paths";

/**
 * Serves generated media — images, reel videos, uploaded clips.
 *
 * In development these files live under `public/generated` and Next serves
 * them statically, so this route never runs. In the packaged desktop app they
 * can't live there: the install directory is read-only, so media is written to
 * the user's profile instead and this route is what makes the same
 * `/generated/...` URLs keep working. Storing a URL rather than a filesystem
 * path in the job records is what lets both modes share one representation.
 *
 * Range requests are implemented deliberately — without them a `<video>`
 * element can load a clip but cannot seek within it, which would break
 * scrubbing on every reel.
 */

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
};

function contentTypeFor(file: string): string {
  const dot = file.lastIndexOf(".");
  return (dot === -1 ? "" : CONTENT_TYPES[file.slice(dot).toLowerCase()]) ?? "application/octet-stream";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;

  let file: string;
  try {
    file = mediaPathFor(segments.join("/"));
  } catch {
    return new Response("Not found", { status: 404 });
  }

  let size: number;
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) return new Response("Not found", { status: 404 });
    size = stat.size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const type = contentTypeFor(file);
  const headers = new Headers({
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    // Filenames already carry a timestamp and are never rewritten in place,
    // so a long cache is safe and keeps re-renders from refetching media.
    "Cache-Control": "public, max-age=31536000, immutable",
  });

  const range = request.headers.get("range");
  const match = range?.match(/^bytes=(\d*)-(\d*)$/);

  if (match) {
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      return new Response("Range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }

    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    const stream = Readable.toWeb(
      createReadStream(file, { start, end }),
    ) as unknown as ReadableStream;
    return new Response(stream, { status: 206, headers });
  }

  headers.set("Content-Length", String(size));
  const stream = Readable.toWeb(createReadStream(file)) as unknown as ReadableStream;
  return new Response(stream, { status: 200, headers });
}
