import { readJson, writeJson } from "@/lib/json-store";

/**
 * Per-post image prompts rewritten by the AI art director.
 *
 * Deliberately stored apart from the creative brief. A brief is the record of
 * what the strategy stage decided; a refinement is the user iterating on one
 * picture. Folding refinements back into the brief would quietly rewrite that
 * record, and would be wiped the moment the creative stage is re-run. Kept
 * separate, an override layers on top of the brief and can be cleared to fall
 * straight back to it.
 */

const FILE = "prompt-overrides.json";

export type PromptOverride = {
  requestId: string;
  postId: string;
  /** Scene description handed to the image model, art-director rewritten. */
  prompt: string;
  /** What the user asked for, verbatim — shown back so the card explains itself. */
  instruction: string;
  /** The art director's one-line summary of what it changed. */
  note: string;
  /** How many refinements deep this post is, starting at 1. */
  revision: number;
  updatedAt: string;
};

type Store = Record<string, PromptOverride>;

/**
 * Scoped by request as well as post: bucket ids like "MON_001" repeat across
 * brands, so a bare postId would leak one brand's refinement into another's.
 */
const keyFor = (requestId: string, postId: string) => `${requestId}::${postId}`;

const all = () => readJson<Store>(FILE, {});

export async function getPromptOverride(
  requestId: string,
  postId: string,
): Promise<PromptOverride | undefined> {
  return (await all())[keyFor(requestId, postId)];
}

/** Every override for one run, keyed by postId for direct lookup in a render. */
export async function overridesForRequest(
  requestId: string,
): Promise<Record<string, PromptOverride>> {
  const out: Record<string, PromptOverride> = {};
  for (const override of Object.values(await all())) {
    if (override.requestId === requestId) out[override.postId] = override;
  }
  return out;
}

export async function savePromptOverride(
  fields: Omit<PromptOverride, "updatedAt" | "revision">,
): Promise<PromptOverride> {
  const store = await all();
  const key = keyFor(fields.requestId, fields.postId);
  const saved: PromptOverride = {
    ...fields,
    revision: (store[key]?.revision ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  store[key] = saved;
  await writeJson(FILE, store);
  return saved;
}

export async function clearPromptOverride(requestId: string, postId: string): Promise<void> {
  const store = await all();
  const key = keyFor(requestId, postId);
  if (!(key in store)) return;
  delete store[key];
  await writeJson(FILE, store);
}
