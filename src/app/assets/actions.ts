"use server";

import { revalidatePath } from "next/cache";
import { latestJobByPostForRequest } from "@/lib/canva-store";
import { getBucketResult } from "@/lib/pipeline-store";
import { getRequest } from "@/lib/research-store";
import {
  generateImageForPost,
  activeImageProvider,
  providerSpacingMs,
  resolveAssetSubject,
} from "@/lib/image-generation";
import { refineImagePrompt } from "@/lib/art-director";
import {
  getPromptOverride,
  savePromptOverride,
  clearPromptOverride,
} from "@/lib/prompt-override-store";

/** Generate one post's image from the Asset Library. */
export async function generateOneImage(formData: FormData) {
  const requestId = String(formData.get("requestId") ?? "").trim();
  const postId = String(formData.get("postId") ?? "").trim();
  if (!requestId || !postId) throw new Error("requestId and postId are required");

  await generateImageForPost(requestId, postId);

  revalidatePath("/assets");
  revalidatePath("/reels");
  revalidatePath(`/research/${requestId}`);
}

/**
 * Result of a refinement, surfaced inline on the card.
 *
 * Returned rather than thrown: this action makes two network calls to
 * third-party services, so failure is routine — a timeout or a rate limit must
 * land as a message on the one card, not as an error boundary that replaces
 * the whole Asset Library.
 */
export type RefineState = { ok: boolean; message: string } | null;

/**
 * Ask the AI art director to rework one post's image, then re-render it.
 *
 * The refinement is saved before the image is generated. If generation then
 * fails, the user's direction still survives and plain "Regenerate" retries it
 * — losing their note because a free image host returned 429 would be the
 * worse failure.
 */
export async function refineImage(
  _prev: RefineState,
  formData: FormData,
): Promise<RefineState> {
  const requestId = String(formData.get("requestId") ?? "").trim();
  const postId = String(formData.get("postId") ?? "").trim();
  const instruction = String(formData.get("instruction") ?? "").trim();
  if (!requestId || !postId) {
    return { ok: false, message: "Missing post reference — reload the page and try again." };
  }

  try {
    const [subject, request, override] = await Promise.all([
      resolveAssetSubject(requestId, postId),
      getRequest(requestId),
      getPromptOverride(requestId, postId),
    ]);

    if (!subject) {
      return { ok: false, message: "This post has nothing to refine yet." };
    }

    const refinement = await refineImagePrompt({
      brandName: request?.companyName ?? "the brand",
      topic: subject.topic,
      // Start from the last refinement if there is one, so repeated passes
      // build on each other instead of each reverting to the original.
      currentPrompt: override?.prompt ?? subject.basePrompt,
      instruction,
    });

    await savePromptOverride({
      requestId,
      postId,
      prompt: refinement.prompt,
      instruction,
      note: refinement.note,
    });

    const outcome = await generateImageForPost(requestId, postId);

    revalidatePath("/assets");
    revalidatePath("/reels");
    revalidatePath(`/research/${requestId}`);

    if (outcome.kind === "failed") {
      return {
        ok: false,
        message: `Direction saved, but the image failed: ${outcome.error}. Press Regenerate to retry.`,
      };
    }
    if (outcome.kind === "queued") {
      return { ok: true, message: `${refinement.note} Queued for Canva.` };
    }
    return { ok: true, message: refinement.note };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Drop a post's refinements and go back to the original creative brief. */
export async function resetImagePrompt(
  _prev: RefineState,
  formData: FormData,
): Promise<RefineState> {
  const requestId = String(formData.get("requestId") ?? "").trim();
  const postId = String(formData.get("postId") ?? "").trim();
  if (!requestId || !postId) {
    return { ok: false, message: "Missing post reference — reload the page and try again." };
  }

  try {
    await clearPromptOverride(requestId, postId);
    const outcome = await generateImageForPost(requestId, postId);

    revalidatePath("/assets");
    revalidatePath("/reels");
    revalidatePath(`/research/${requestId}`);

    if (outcome.kind === "failed") {
      return { ok: false, message: `Reverted, but the image failed: ${outcome.error}` };
    }
    return { ok: true, message: "Back to the original brief." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Generate every post that doesn't already have a finished image.
 *
 * Deliberately fire-and-forget, and deliberately sequential. The free
 * provider allows one image per 15 seconds, so a seven-post week takes
 * around two minutes — far too long to hold a form submission open, and
 * firing them in parallel just earns a batch of 429s. Each job is written to
 * disk as it progresses, so refreshing the page shows real progress instead
 * of an opaque wait.
 */
export async function generateAllImages(formData: FormData) {
  const requestId = String(formData.get("requestId") ?? "").trim();
  if (!requestId) throw new Error("requestId is required");

  const [bucket, existing] = await Promise.all([
    getBucketResult(requestId),
    latestJobByPostForRequest(requestId),
  ]);

  const targets = (bucket?.posts ?? []).filter((post) => {
    const job = existing[post.id];
    // Skip anything already done or actively being worked on; retry failures.
    return job?.status !== "complete" && job?.status !== "generating";
  });

  if (targets.length === 0) {
    revalidatePath("/assets");
    return;
  }

  const spacing = providerSpacingMs(activeImageProvider());

  // Not awaited: this outlives the request. Errors are recorded on each job
  // rather than thrown into a response nobody is listening to any more.
  void (async () => {
    for (const [index, post] of targets.entries()) {
      if (index > 0) {
        await new Promise((resolve) => setTimeout(resolve, spacing));
      }
      try {
        await generateImageForPost(requestId, post.id);
      } catch {
        // generateImageForPost already records failures on the job itself;
        // one bad post must not abort the rest of the batch.
      }
    }
  })();

  revalidatePath("/assets");
}
