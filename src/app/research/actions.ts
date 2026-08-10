"use server";

import { redirect } from "next/navigation";
import { createRequest, type Competitor } from "@/lib/research-store";
import { discoverCompetitors } from "@/lib/pipeline/discovery";
import { isLlmConfigured } from "@/lib/llm";

export async function submitResearchRequest(formData: FormData) {
  const companyName = String(formData.get("companyName") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim();

  if (!companyName) {
    throw new Error("Company name is required");
  }

  const manual: Competitor[] = [];
  for (let i = 1; i <= 5; i++) {
    const name = String(formData.get(`competitor${i}Name`) ?? "").trim();
    const url = String(formData.get(`competitor${i}Url`) ?? "").trim();
    if (name) manual.push({ name, url: url || undefined });
  }

  // Manual entry, when given, always wins — it's the explicit override. Only
  // fall back to discovery when the fields were left blank.
  let competitors = manual;
  if (competitors.length === 0) {
    if (!isLlmConfigured()) {
      throw new Error(
        "No competitors entered, and automatic discovery needs a configured model — " +
          "add an API key in web/.env.local, or enter at least one competitor manually.",
      );
    }
    // No progress callback: this form has no polling UI to report to, unlike
    // the Brand flow's queued run. The wait is the one downside of a single
    // blocking call — a few searches plus one model call, then it redirects.
    competitors = await discoverCompetitors({
      name: companyName,
      domain: domain || undefined,
      industry: industry || undefined,
    });
  }

  const request = await createRequest({
    companyName,
    domain: domain || undefined,
    industry: industry || undefined,
    competitors,
  });

  redirect(`/research/${request.id}`);
}
