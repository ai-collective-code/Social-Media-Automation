import { posts } from "@/lib/mock-data";
import { listRequests, getResult } from "@/lib/research-store";
import {
  getTrendResult,
  getStrategyResult,
  getBucketResult,
  getCreativeResult,
} from "@/lib/pipeline-store";
import { listImageJobs } from "@/lib/canva-store";
import { listDecisions } from "@/lib/qc-store";

/**
 * Report generation from real on-disk data.
 *
 * A report is only offered for download when the data behind it actually
 * exists. Everything else is reported as unavailable with the reason, rather
 * than handing the user a button that silently produces nothing.
 */

export type ReportId =
  | "competitor-analysis"
  | "quality-check"
  | "asset-log"
  | "trend-analysis"
  | "content-strategy"
  | "content-bucketing"
  | "creative-director"
  | "publishing-log";

export type ReportMeta = {
  id: ReportId;
  name: string;
  /** Why it can't be generated yet — undefined means it's ready. */
  blockedReason?: string;
  updated?: string;
};

function fmt(iso?: string) {
  return iso ? new Date(iso).toLocaleString() : undefined;
}

/** Which reports have real data right now. */
export async function listReports(): Promise<ReportMeta[]> {
  const [requests, jobs, decisions] = await Promise.all([
    listRequests(),
    listImageJobs(),
    listDecisions(),
  ]);

  const completedResearch = [];
  const completedTrends = [];
  const completedStrategy = [];
  const completedBucketing = [];
  const completedCreative = [];
  for (const r of requests) {
    if ((await getResult(r.id)) !== undefined) completedResearch.push(r);
    if ((await getTrendResult(r.id)) !== undefined) completedTrends.push(r);
    if ((await getStrategyResult(r.id)) !== undefined) completedStrategy.push(r);
    if ((await getBucketResult(r.id)) !== undefined) completedBucketing.push(r);
    if ((await getCreativeResult(r.id)) !== undefined) completedCreative.push(r);
  }

  const doneJobs = jobs.filter((j) => j.status === "complete");
  const decisionList = Object.values(decisions);

  return [
    {
      id: "competitor-analysis",
      name: "Competitor Analysis Report",
      blockedReason:
        completedResearch.length === 0
          ? "No completed research yet — submit a request on Competitor Research, then ask Claude to run it"
          : undefined,
      updated: fmt(completedResearch[0]?.createdAt),
    },
    {
      id: "quality-check",
      name: "Quality Check Report",
      blockedReason:
        decisionList.length === 0
          ? "No QC decisions recorded yet — approve or request revision on any post"
          : undefined,
      updated: fmt(
        decisionList.map((d) => d.decidedAt).sort().reverse()[0]
      ),
    },
    {
      id: "asset-log",
      name: "Asset Generation Log",
      blockedReason:
        doneJobs.length === 0
          ? "No assets generated yet — use Generate with Canva on the Asset Library"
          : undefined,
      updated: fmt(doneJobs[0]?.result?.exportedAt),
    },
    {
      id: "trend-analysis",
      name: "Trend Analysis Report",
      blockedReason:
        completedTrends.length === 0
          ? "No completed trend analysis yet — run it from a research request's detail page"
          : undefined,
      updated: fmt(completedTrends[0]?.createdAt),
    },
    {
      id: "content-strategy",
      name: "Content Strategy Report",
      blockedReason:
        completedStrategy.length === 0
          ? "No completed content strategy yet — run Trend Analysis then Content Strategy from a research request's detail page"
          : undefined,
      updated: fmt(completedStrategy[0]?.createdAt),
    },
    {
      id: "content-bucketing",
      name: "Content Bucketing Report",
      blockedReason:
        completedBucketing.length === 0
          ? "No completed content bucketing yet — run Content Strategy then Content Bucketing from a research request's detail page"
          : undefined,
      updated: fmt(completedBucketing[0]?.createdAt),
    },
    {
      id: "creative-director",
      name: "Creative Director Briefs",
      blockedReason:
        completedCreative.length === 0
          ? "No completed creative briefs yet — run Content Bucketing then Creative Director from a research request's detail page"
          : undefined,
      updated: fmt(completedCreative[0]?.createdAt),
    },
    {
      id: "publishing-log",
      name: "Publishing Log",
      blockedReason: "Requires workflow 7 — needs platform credentials",
    },
  ];
}

/** Build the markdown body for a report. Returns null when unavailable. */
export async function renderReport(id: ReportId): Promise<string | null> {
  const stamp = new Date().toISOString();

  if (id === "competitor-analysis") {
    const requests = await listRequests();
    const lines: string[] = ["# Competitor Analysis Report", "", `Generated: ${stamp}`, ""];
    let any = false;

    for (const req of requests) {
      const result = await getResult(req.id);
      if (!result) continue;
      any = true;
      lines.push(`## ${req.companyName}`, "");
      if (req.industry) lines.push(`- Category: ${req.industry}`);
      if (req.domain) lines.push(`- Domain: ${req.domain}`);
      lines.push(`- Competitors analysed: ${req.competitors.map((c) => c.name).join(", ")}`, "");

      if (result.keyGaps?.length) {
        lines.push("### Key gaps identified", "");
        result.keyGaps.forEach((g) => lines.push(`- ${g}`));
        lines.push("");
      }

      for (const c of result.competitors ?? []) {
        lines.push(`### ${c.name}`, "");
        if (c.summary) lines.push(c.summary, "");
        for (const p of c.platforms ?? []) {
          const bits = [
            p.followers !== undefined ? `${p.followers.toLocaleString()} followers` : null,
            p.engagementRate !== undefined ? `${p.engagementRate}% engagement` : null,
            p.postingFrequency ?? null,
          ].filter(Boolean);
          lines.push(`- **${p.platform}**${bits.length ? ` — ${bits.join(", ")}` : ""}`);
          if (p.gaps?.length) lines.push(`  - Gap: ${p.gaps.join("; ")}`);
        }
        lines.push("");
      }

      if (result.recommendations?.length) {
        lines.push("### Recommendations", "");
        result.recommendations.forEach((r) => lines.push(`- ${r}`));
        lines.push("");
      }
      if (result.sources?.length) lines.push(`Sources: ${result.sources.join(", ")}`, "");
    }

    return any ? lines.join("\n") : null;
  }

  if (id === "quality-check") {
    const decisions = await listDecisions();
    const entries = Object.values(decisions);
    if (entries.length === 0) return null;

    const lines = ["# Quality Check Report", "", `Generated: ${stamp}`, ""];
    const byStatus = (s: string) => entries.filter((d) => d.status === s).length;
    lines.push(
      `Covers the ${entries.length} of ${posts.length} posts with a reviewer decision on`,
      `record. Posts nobody has reviewed are omitted rather than counted either way.`,
      "",
      `- Approved: ${byStatus("approved")}`,
      `- Revision requested: ${byStatus("revision_requested")}`,
      `- Awaiting review: ${posts.length - entries.length}`,
      ""
    );

    lines.push("| Post | Day | Status | Feedback |", "|---|---|---|---|");
    for (const post of posts) {
      const d = decisions[post.id];
      if (!d) continue;
      lines.push(
        `| ${post.id} | ${post.day} | ${d.status} | ${(d.feedback ?? "").replace(/\|/g, "\\|") || "—"} |`
      );
    }
    return lines.join("\n");
  }

  if (id === "asset-log") {
    const jobs = (await listImageJobs()).filter((j) => j.status === "complete");
    if (jobs.length === 0) return null;

    const lines = ["# Asset Generation Log", "", `Generated: ${stamp}`, ""];
    for (const j of jobs) {
      lines.push(
        `## ${j.day} — ${j.topic}`,
        "",
        `- Design ID: ${j.result?.designId}`,
        `- Title: ${j.result?.title}`,
        `- Local file: ${j.result?.localPath}`,
        `- Dimensions: ${j.result?.width}x${j.result?.height}`,
        `- Exported: ${j.result?.exportedAt}`,
        `- Edit in Canva: ${j.result?.editUrl}`,
        "",
        "Prompt used:",
        "",
        "> " + j.prompt.replace(/\n/g, "\n> "),
        ""
      );
    }
    return lines.join("\n");
  }

  if (id === "trend-analysis") {
    const requests = await listRequests();
    const lines: string[] = ["# Trend Analysis Report", "", `Generated: ${stamp}`, ""];
    let any = false;

    for (const req of requests) {
      const result = await getTrendResult(req.id);
      if (!result) continue;
      any = true;
      lines.push(`## ${req.companyName}`, "");

      for (const t of result.trends) {
        lines.push(
          `### ${t.name}`,
          "",
          `- Growth signal: ${t.growthSignal}`,
          `- Competitor gap: ${t.competitorGap}`,
          `- Opportunity: ${t.opportunity}`,
          ""
        );
      }

      if (result.recommendedActions.length) {
        lines.push("### Recommended actions", "");
        result.recommendedActions.forEach((a) => lines.push(`- ${a}`));
        lines.push("");
      }
      if (result.sources.length) lines.push(`Sources: ${result.sources.join(", ")}`, "");
    }

    return any ? lines.join("\n") : null;
  }

  if (id === "content-strategy") {
    const requests = await listRequests();
    const lines: string[] = ["# Content Strategy Report", "", `Generated: ${stamp}`, ""];
    let any = false;

    for (const req of requests) {
      const result = await getStrategyResult(req.id);
      if (!result) continue;
      any = true;
      lines.push(`## ${req.companyName}`, "");

      lines.push("### Content pillars", "");
      for (const p of result.pillars) {
        lines.push(`- **${p.name}** (${p.percentage}%) — ${p.rationale}`);
      }
      lines.push("");

      lines.push("### Buyer journey mapping", "");
      lines.push("| Stage | Pillar | Posts/week |", "|---|---|---|");
      for (const j of result.buyerJourney) {
        lines.push(`| ${j.stage} | ${j.pillar} | ${j.postsPerWeek} |`);
      }
      lines.push("");

      lines.push("### Platform strategy", "", result.platformStrategy, "");

      if (result.successMetrics.length) {
        lines.push("### Success metrics", "");
        result.successMetrics.forEach((m) => lines.push(`- ${m}`));
        lines.push("");
      }
    }

    return any ? lines.join("\n") : null;
  }

  if (id === "content-bucketing") {
    const requests = await listRequests();
    const lines: string[] = ["# Content Bucketing Report", "", `Generated: ${stamp}`, ""];
    let any = false;

    for (const req of requests) {
      const result = await getBucketResult(req.id);
      if (!result) continue;
      any = true;
      lines.push(`## ${req.companyName}`, "");
      lines.push(
        "| Day | Time | Platform | Pillar | Topic | Why |",
        "|---|---|---|---|---|---|"
      );
      for (const p of result.posts) {
        lines.push(
          `| ${p.day} | ${p.time} | ${p.platform} | ${p.pillar} | ${p.topic} | ${p.whyThisPost.replace(/\|/g, "\\|")} |`
        );
      }
      lines.push("");
    }

    return any ? lines.join("\n") : null;
  }

  if (id === "creative-director") {
    const requests = await listRequests();
    const lines: string[] = ["# Creative Director Briefs", "", `Generated: ${stamp}`, ""];
    let any = false;

    for (const req of requests) {
      const result = await getCreativeResult(req.id);
      if (!result) continue;
      any = true;
      lines.push(`## ${req.companyName}`, "");
      if (result.failedPostIds.length) {
        lines.push(`Brief generation failed for: ${result.failedPostIds.join(", ")}`, "");
      }

      for (const b of result.briefs) {
        lines.push(
          `### ${b.postId} — ${b.conceptName} (score ${b.score.toFixed(1)})`,
          "",
          b.conceptOneSentence,
          "",
          `- Insight: ${b.insight}`,
          `- Emotional tone: ${b.emotionalTone}`,
          `- Visual: ${b.visualDirection.aesthetic} (${b.visualDirection.palette.join(", ")})`,
          "",
          "**Image prompt:**",
          "",
          "> " + b.imagePrompt.detailedPrompt.replace(/\n/g, "\n> "),
          ""
        );
        if (b.videoPrompt) {
          lines.push(
            `**Video prompt** (${b.videoPrompt.totalDuration}):`,
            "",
            ...b.videoPrompt.scenes.map((s) => `- ${s.timing}: ${s.description}`),
            ""
          );
        }
        lines.push(
          "**Copy direction:**",
          "",
          `- Hooks: ${b.copyDirection.hookExamples.join(" / ")}`,
          `- Tone: ${b.copyDirection.tone}`,
          `- Hashtags: ${b.copyDirection.hashtags.map((h) => `#${h}`).join(" ")}`,
          "",
          b.copyDirection.captionExample,
          ""
        );
      }
    }

    return any ? lines.join("\n") : null;
  }

  return null;
}
