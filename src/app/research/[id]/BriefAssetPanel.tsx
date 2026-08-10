"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { queueBriefImage } from "./assetActions";
import { Badge, Button, Dot } from "@/components/ui";
import type { ImageJob } from "@/lib/canva-store";

/**
 * Turns one creative brief into something you can actually post: a real
 * generated image (OpenAI, when configured) or a queued Canva job, plus the
 * brief's own caption + hashtags ready to copy.
 */
export default function BriefAssetPanel({
  requestId,
  postId,
  captionExample,
  hashtags,
  job,
}: {
  requestId: string;
  postId: string;
  captionExample: string;
  hashtags: string[];
  job?: ImageJob;
}) {
  const [copied, setCopied] = useState(false);

  const done = job?.status === "complete" && job.result;
  // Only a Canva-produced result has anywhere to send you to edit it.
  const canEdit = done && job.result?.provider !== "openai" && job.result?.editUrl;

  async function copyCaption() {
    const text = `${captionExample}\n\n${hashtags.map((h) => `#${h}`).join(" ")}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (insecure context, denied
      // permission) — surfacing nothing is worse than a visible failure.
      window.prompt("Copy this caption:", text);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
      {done ? (
        canEdit ? (
          <a
            href={job.result!.editUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-line bg-canvas-raised px-2 py-1.5 transition-colors hover:border-line-strong"
          >
            <Image
              src={job.result!.localPath}
              alt=""
              width={36}
              height={45}
              className="rounded object-cover"
            />
            <span className="text-xs font-medium text-accent">Edit in Canva →</span>
          </a>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas-raised px-2 py-1.5">
            <Image
              src={job.result!.localPath}
              alt=""
              width={36}
              height={45}
              className="rounded object-cover"
            />
            {job.result?.provider === "pollinations" ? (
              <span title="Free tier, watermarked — for testing the pipeline, not for posting.">
                <Badge tone="warn">
                  <Dot tone="warn" />
                  Free preview
                </Badge>
              </span>
            ) : (
              <Badge tone="good">
                <Dot tone="good" />
                Generated
              </Badge>
            )}
          </div>
        )
      ) : job?.status === "pending" ? (
        <Badge tone="warn">
          <Dot tone="warn" pulse />
          Queued for Canva
        </Badge>
      ) : job?.status === "failed" ? (
        <span title={job.error}>
          <Badge tone="bad">Image failed</Badge>
        </span>
      ) : null}

      {/* A real <form> rather than a client onClick + startTransition: this is
          the same progressive-enhancement pattern used elsewhere in the app,
          and it works even before the client bundle finishes hydrating. */}
      <form action={queueBriefImage}>
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="postId" value={postId} />
        <GenerateButton done={Boolean(done)} queued={job?.status === "pending"} />
      </form>

      <Button variant="secondary" size="sm" onClick={copyCaption}>
        {copied ? "Copied ✓" : "Copy caption"}
      </Button>
    </div>
  );
}

/**
 * Its own component because `useFormStatus` only reports the status of the
 * nearest enclosing `<form>` — read from the component that renders the form
 * itself, it never leaves `pending: false`.
 */
function GenerateButton({ done, queued }: { done: boolean; queued: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" loading={pending}>
      {pending
        ? "Generating…"
        : done
          ? "Regenerate image"
          : queued
            ? "Re-queue image"
            : "Generate image"}
    </Button>
  );
}
