import Image from "next/image";
import { Badge, Dot, Spinner } from "@/components/ui";
import type { ImageJob } from "@/lib/canva-store";

/**
 * A post rendered the way it will actually look on Instagram.
 *
 * The point is review, not decoration: seeing the image cropped to Instagram's
 * 4:5 feed ratio, directly above the caption and hashtags that ship with it,
 * is what tells you whether a post works. A bare thumbnail grid hides exactly
 * the problems worth catching — text cropped out of frame, a caption that
 * doesn't match the image, a first line that gets truncated.
 */

/** Instagram truncates the caption after roughly this much, behind "more". */
const CAPTION_PREVIEW_CHARS = 125;

function handleFor(brandName: string): string {
  return brandName.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export type InstagramPostData = {
  id: string;
  day: string;
  time: string;
  platform: string;
  topic: string;
  caption?: string;
  hashtags?: string[];
  isVideo?: boolean;
};

export default function InstagramPost({
  brandName,
  post,
  job,
  action,
  refine,
}: {
  brandName: string;
  post: InstagramPostData;
  job?: ImageJob;
  /** Generate / regenerate control, supplied by the page. */
  action?: React.ReactNode;
  /** AI art-director controls, supplied by the page. Optional so this stays a
   *  pure preview component for callers that only want to look. */
  refine?: React.ReactNode;
}) {
  const done = job?.status === "complete" && job.result;
  const isFreePreview = job?.result?.provider === "pollinations";
  const caption = post.caption ?? "";
  const needsTruncation = caption.length > CAPTION_PREVIEW_CHARS;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-line bg-canvas-raised">
      {/* --- post header --------------------------------------------------- */}
      <header className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-warn via-bad to-accent p-[2px]">
          <span className="flex h-full w-full items-center justify-center rounded-full bg-canvas-raised text-[10px] font-semibold text-fg">
            {initials(brandName)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-fg">
            {handleFor(brandName)}
          </p>
          <p className="truncate text-[11px] leading-tight text-fg-3">
            {post.day} · {post.time}
          </p>
        </div>
        <span aria-hidden className="px-1 text-fg-3">
          ⋯
        </span>
      </header>

      {/* --- media --------------------------------------------------------- */}
      <div className="relative flex aspect-[4/5] items-center justify-center bg-surface-2">
        {done ? (
          <Image
            src={job.result!.localPath}
            alt={post.topic}
            width={job.result!.width}
            height={job.result!.height}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : job?.status === "generating" ? (
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <Spinner className="h-5 w-5 text-accent" />
            <p className="text-xs text-fg-2">Generating…</p>
          </div>
        ) : job?.status === "pending" ? (
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <Badge tone="warn">
              <Dot tone="warn" pulse />
              Queued
            </Badge>
            <p className="text-[11px] text-fg-3">Waiting on a Claude session for Canva.</p>
          </div>
        ) : job?.status === "failed" ? (
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <Badge tone="bad">Failed</Badge>
            {job.error && <p className="line-clamp-3 text-[11px] text-fg-3">{job.error}</p>}
          </div>
        ) : (
          <span className="px-3 text-center text-xs text-fg-3">No image yet</span>
        )}

        {isFreePreview && (
          <span
            title="Free tier, watermarked — for testing the pipeline, not for posting."
            className="absolute left-2 top-2"
          >
            <Badge tone="warn">Free preview</Badge>
          </span>
        )}

        {post.isVideo && (
          <span
            aria-label="Video post"
            title="This post's brief specifies a video treatment"
            className="absolute right-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] text-white"
          >
            ▶
          </span>
        )}
      </div>

      {/* --- action bar ---------------------------------------------------- */}
      <div className="flex items-center gap-3.5 px-3 pt-2.5 text-fg" aria-hidden>
        <HeartIcon />
        <CommentIcon />
        <ShareIcon />
        <span className="ml-auto">
          <BookmarkIcon />
        </span>
      </div>

      {/* --- caption ------------------------------------------------------- */}
      <div className="flex flex-1 flex-col gap-1.5 px-3 pb-3 pt-2">
        {caption ? (
          <details className="group text-[13px] leading-snug text-fg">
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <span className="font-semibold">{handleFor(brandName)}</span>{" "}
              <span className="text-fg-2 group-open:hidden">
                {needsTruncation ? `${caption.slice(0, CAPTION_PREVIEW_CHARS).trimEnd()}… ` : caption}
                {needsTruncation && <span className="text-fg-3">more</span>}
              </span>
              <span className="hidden whitespace-pre-line text-fg-2 group-open:inline">
                {caption}
              </span>
            </summary>
          </details>
        ) : (
          <p className="text-[13px] text-fg-3">
            No caption yet — generated by the creative-brief stage.
          </p>
        )}

        {post.hashtags && post.hashtags.length > 0 && (
          <p className="text-[13px] leading-snug text-accent">
            {post.hashtags.map((tag) => `#${tag}`).join(" ")}
          </p>
        )}

        <p className="mt-0.5 text-[11px] uppercase tracking-wide text-fg-3">{post.platform}</p>

        {(action || refine) && (
          <div className="mt-auto pt-2">
            {action}
            {refine}
          </div>
        )}
      </div>
    </article>
  );
}

/* Instagram's own glyphs are trademarked; these are neutral equivalents in
   the same positions, at the same weight, so the layout reads correctly
   without copying their iconography. */

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 20s-7-4.35-7-9a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 4.65-7 9-7 9Z"
      />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 11.5a8 8 0 0 1-11.6 7.14L4 20l1.4-4.2A8 8 0 1 1 21 11.5Z"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 4 3 10.5l7 2.5 2.5 7L21 4Z" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 4h12v16l-6-4.5L6 20V4Z" />
    </svg>
  );
}
