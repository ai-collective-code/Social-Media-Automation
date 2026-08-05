"use server";

import { revalidatePath } from "next/cache";
import { createImageJob } from "@/lib/canva-store";
import { getPostById } from "@/lib/mock-data";

/**
 * Build the Canva prompt from a post's creative brief.
 *
 * This is the "image prompt extraction" step described in
 * CONTENT_EXECUTION_WORKFLOW_FINAL.md (Stream A, Step 1).
 */
function buildPrompt(topic: string, pillar: string, hook: string): string {
  return [
    `An Instagram post for a clean-beauty skincare brand called "Glow & Grace Skincare",`,
    `aimed at busy working professionals.`,
    `Topic: ${topic}.`,
    `Content pillar: ${pillar}.`,
    `Headline should reflect the hook: "${hook}".`,
    `Visual style: calm, minimal, editorial, generous white space, soft sage green and cream`,
    `palette, elegant modern typography, subtle botanical accents.`,
    `Mood: confident, effortless, professional.`,
    `Keep the layout uncluttered so text stays highly readable on a phone screen,`,
    `and keep each line of text short enough that it does not wrap awkwardly.`,
  ].join(" ");
}

export async function queueImageGeneration(formData: FormData) {
  const postId = String(formData.get("postId") ?? "").trim();
  if (!postId) throw new Error("postId is required");

  const post = getPostById(postId);
  if (!post) throw new Error(`Unknown post: ${postId}`);

  await createImageJob({
    postId: post.id,
    day: post.day,
    topic: post.topic,
    prompt: buildPrompt(post.topic, post.pillar, post.hook),
    designType: "instagram_post",
  });

  revalidatePath("/assets");
}
