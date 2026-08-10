"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createBrand,
  updateBrand,
  deleteBrand,
  getBrand,
  PLATFORM_OPTIONS,
  type BrandInput,
} from "@/lib/brand-store";
import { enqueueRun, getRun, queuePosition, listRunsForBrand } from "@/lib/run-store";
import { tickQueue } from "@/lib/pipeline/orchestrator";
import { isLlmConfigured } from "@/lib/llm";

export type BrandFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

function readForm(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const platforms = PLATFORM_OPTIONS.filter((p) => formData.get(`platform:${p}`) === "on");
  return {
    name: get("name"),
    domain: get("domain"),
    industry: get("industry"),
    description: get("description"),
    audience: get("audience"),
    voice: get("voice"),
    neverSay: get("neverSay"),
    markets: get("markets"),
    avoidVisuals: get("avoidVisuals"),
    language: get("language"),
    imageSeed: get("imageSeed"),
    platforms,
  };
}

/**
 * Expected validation failures are returned, not thrown — a missing brand name
 * should re-render the form with a message, not trip the error boundary.
 */
export async function saveBrand(
  _prev: BrandFormState,
  formData: FormData,
): Promise<BrandFormState> {
  const brandId = String(formData.get("brandId") ?? "").trim();
  const input = readForm(formData);

  const fieldErrors: Record<string, string> = {};
  if (!input.name) fieldErrors.name = "Give the brand a name so you can find it later.";
  if (!input.industry && !input.description) {
    fieldErrors.industry =
      "Add an industry or a description — competitor discovery uses both to target its search.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    const values = Object.fromEntries(
      Object.entries(input).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v]),
    );
    return { fieldErrors, values };
  }

  const payload: BrandInput = {
    name: input.name,
    domain: input.domain || undefined,
    industry: input.industry || undefined,
    description: input.description || undefined,
    audience: input.audience || undefined,
    voice: input.voice || undefined,
    neverSay: input.neverSay || undefined,
    markets: input.markets || undefined,
    avoidVisuals: input.avoidVisuals || undefined,
    language: input.language || undefined,
    // Blank means "vary freely"; only a real number pins the look.
    imageSeed: /^\d+$/.test(input.imageSeed) ? Number(input.imageSeed) : undefined,
    platforms: input.platforms.length > 0 ? [...input.platforms] : undefined,
  };

  const brand = brandId ? await updateBrand(brandId, payload) : await createBrand(payload);
  if (!brand) return { error: "That brand no longer exists." };

  revalidatePath("/brands");
  revalidatePath(`/brands/${brand.id}`);
  redirect(`/brands/${brand.id}`);
}

export async function startRun(brandId: string) {
  const brand = await getBrand(brandId);
  if (!brand) throw new Error("That brand no longer exists.");

  if (!isLlmConfigured()) {
    return {
      started: false as const,
      reason: "LLM_API_KEY is not set — add it to web/.env.local before starting a run.",
    };
  }

  // One queued-or-running run per brand: a second concurrent run for the same
  // brand would duplicate ~25 minutes of billed work for the same output.
  const existing = await listRunsForBrand(brandId);
  if (existing.some((r) => r.status === "queued" || r.status === "running")) {
    return { started: false as const, reason: "This brand already has a run in progress." };
  }

  const run = await enqueueRun(brandId, brand.name);
  await tickQueue();

  revalidatePath(`/brands/${brandId}`);
  revalidatePath("/brands");
  return { started: true as const, runId: run.id };
}

export async function pollRun(runId: string) {
  // Also nudges the queue: if a previous run's process died, this is what lets
  // a waiting run start without the user having to do anything.
  await tickQueue();

  const run = await getRun(runId);
  if (!run) return null;
  return {
    status: run.status,
    stage: run.stage ?? null,
    completedStages: run.completedStages,
    message: run.message,
    error: run.error ?? null,
    requestId: run.requestId ?? null,
    competitors: run.competitors ?? null,
    queuePosition: run.status === "queued" ? await queuePosition(runId) : null,
  };
}

export async function removeBrand(brandId: string) {
  await deleteBrand(brandId);
  revalidatePath("/brands");
  redirect("/brands");
}
