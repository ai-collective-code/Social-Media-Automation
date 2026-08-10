"use server";

import { generateBrandDraft, type BrandDraft } from "@/lib/brand-generator";
import { isLlmConfigured } from "@/lib/llm";

export type GenerateState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; companyName: string; draft: BrandDraft };

/**
 * Draft a brand profile from a company name.
 *
 * Returns the draft rather than writing anything — this page hands the user
 * text to copy, it never touches the brand store itself. That's deliberate:
 * a wrong guess here should cost nothing to discard, and nothing here should
 * silently create or overwrite a real brand record.
 */
export async function generateFields(
  _prev: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  const companyName = String(formData.get("companyName") ?? "").trim();
  if (!companyName) {
    return { status: "error", message: "Type a company name first." };
  }

  if (!isLlmConfigured()) {
    return {
      status: "error",
      message:
        "No LLM is configured (checked ANTHROPIC_API_KEY / LLM_API_KEY in .env.local) — nothing can generate a draft.",
    };
  }

  try {
    const draft = await generateBrandDraft(companyName);
    return { status: "done", companyName, draft };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
