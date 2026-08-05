"use server";

import { redirect } from "next/navigation";
import { createRequest, type Competitor } from "@/lib/research-store";

export async function submitResearchRequest(formData: FormData) {
  const companyName = String(formData.get("companyName") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim();

  if (!companyName) {
    throw new Error("Company name is required");
  }

  const competitors: Competitor[] = [];
  for (let i = 1; i <= 5; i++) {
    const name = String(formData.get(`competitor${i}Name`) ?? "").trim();
    const url = String(formData.get(`competitor${i}Url`) ?? "").trim();
    if (name) {
      competitors.push({ name, url: url || undefined });
    }
  }

  if (competitors.length === 0) {
    throw new Error("At least one competitor is required");
  }

  const request = await createRequest({
    companyName,
    domain: domain || undefined,
    industry: industry || undefined,
    competitors,
  });

  redirect(`/research/${request.id}`);
}
