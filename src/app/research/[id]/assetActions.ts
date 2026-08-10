"use server";

import { revalidatePath } from "next/cache";
import { generateImageForPost } from "@/lib/image-generation";

/**
 * Generate the image for one creative brief.
 *
 * The work itself lives in `@/lib/image-generation` so this and the Asset
 * Library's generate-all share one provider precedence and one prompt
 * construction — they used to be separate copies that could drift.
 */
export async function queueBriefImage(formData: FormData) {
  const requestId = String(formData.get("requestId") ?? "").trim();
  const postId = String(formData.get("postId") ?? "").trim();
  if (!requestId || !postId) throw new Error("requestId and postId are required");

  await generateImageForPost(requestId, postId);

  revalidatePath(`/research/${requestId}`);
  revalidatePath("/assets");
}
