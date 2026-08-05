"use server";

import { revalidatePath } from "next/cache";
import { saveDecision, saveChecks, type QCStatus } from "@/lib/qc-store";

export async function decidePost(
  postId: string,
  status: QCStatus,
  feedback?: string
) {
  if (!postId) throw new Error("postId is required");
  await saveDecision({
    postId,
    status,
    feedback: feedback?.trim() || undefined,
    decidedAt: new Date().toISOString(),
  });
  // The dashboard tracker and calendar badges both read QC state.
  revalidatePath("/quality-check");
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function toggleCheck(
  postId: string,
  checkKey: string,
  passed: boolean
) {
  if (!postId || !checkKey) throw new Error("postId and checkKey are required");
  await saveChecks(postId, { [checkKey]: passed });
  revalidatePath("/quality-check");
}
