import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";
import { getRequest, getResult } from "@/lib/research-store";
import {
  getTrendResult,
  getStrategyResult,
  getBucketResult,
  getCreativeResult,
} from "@/lib/pipeline-store";

/**
 * Renders one research request's full pipeline output as a real .docx.
 *
 * Mirrors the research detail page section for section — same order, same
 * fields — so the export reads as "this page, on paper" rather than a
 * separate summary that can drift from what the app actually shows. Later
 * stages (trends, strategy, calendar, creative) are included only when that
 * stage has actually completed for this request, exactly like the page's own
 * conditional rendering; a request that's only finished competitor research
 * gets a one-section document, not five empty headings.
 */

const ACCENT = "4F46E5";
const MUTED = "6B7280";

function h1(text: string) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { after: 160 } });
}
function h2(text: string) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } });
}
function body(text: string, opts: { italic?: boolean; muted?: boolean } = {}) {
  return new Paragraph({
    spacing: { after: 100 },
    children: [
      new TextRun({ text, italics: opts.italic, color: opts.muted ? MUTED : undefined }),
    ],
  });
}
function bullet(text: string) {
  return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 60 } });
}
function meta(text: string) {
  return new Paragraph({
    spacing: { before: 120, after: 200 },
    children: [new TextRun({ text, size: 18, color: MUTED, italics: true })],
  });
}

/** A simple bordered table: bold shaded header row, plain body rows. */
function table(headers: string[], rows: string[][]): Table {
  const borders = {
    top: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
    left: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
    right: { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" },
  };
  const cell = (text: string, header: boolean) =>
    new TableCell({
      borders,
      shading: header ? { fill: "EEF2FF" } : undefined,
      children: [
        new Paragraph({
          children: [new TextRun({ text, bold: header, size: header ? 20 : 20 })],
        }),
      ],
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: headers.map((h) => cell(h, true)) }),
      ...rows.map((r) => new TableRow({ children: r.map((v) => cell(v, false)) })),
    ],
  });
}

export async function renderResearchDocx(requestId: string): Promise<Buffer | null> {
  const request = await getRequest(requestId);
  if (!request) return null;

  const [result, trend, strategy, bucket, creative] = await Promise.all([
    getResult(requestId),
    getTrendResult(requestId),
    getStrategyResult(requestId),
    getBucketResult(requestId),
    getCreativeResult(requestId),
  ]);

  // Matches the page's own empty state — nothing has completed yet.
  if (!result) return null;

  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: request.companyName, bold: true, size: 48, color: ACCENT })],
    }),
    body(`vs. ${request.competitors.map((c) => c.name).join(", ")}`, { muted: true }),
    meta(`Generated ${new Date().toLocaleString()}`),
  );

  // --- Competitor Analysis ---------------------------------------------
  children.push(h1("Competitor Analysis"));

  if (result.keyGaps.length > 0) {
    children.push(h2("Key gaps identified"));
    result.keyGaps.forEach((g) => children.push(bullet(g)));
  }

  for (const c of result.competitors) {
    children.push(h2(c.name));
    if (c.summary) children.push(body(c.summary));
    for (const p of c.platforms) {
      const bits = [
        p.handle ?? null,
        p.followers !== undefined ? `${p.followers.toLocaleString()} followers` : null,
        p.engagementRate !== undefined ? `${p.engagementRate}% engagement` : null,
        p.postingFrequency ?? null,
      ].filter(Boolean);
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({ text: p.platform, bold: true }),
            bits.length ? new TextRun({ text: ` — ${bits.join(", ")}`, color: MUTED }) : new TextRun(""),
          ],
        }),
      );
      if (p.topContentThemes?.length) {
        children.push(body(`Themes: ${p.topContentThemes.join(", ")}`, { muted: true }));
      }
      if (p.gaps?.length) children.push(body(`Gap: ${p.gaps.join("; ")}`, { italic: true }));
    }
  }

  if (result.recommendations.length > 0) {
    children.push(h2("Recommendations"));
    result.recommendations.forEach((r) => children.push(bullet(r)));
  }
  children.push(
    meta(
      `Researched ${new Date(result.researchedAt).toLocaleString()} · Sources: ${result.sources.join(", ")}`,
    ),
  );

  // --- Trend Analysis -----------------------------------------------------
  if (trend) {
    children.push(h1("Trend Analysis"));
    for (const t of trend.trends) {
      children.push(
        new Paragraph({
          spacing: { after: 20 },
          children: [
            new TextRun({ text: t.name, bold: true }),
            new TextRun({ text: `  (${t.growthSignal})`, color: MUTED }),
          ],
        }),
      );
      children.push(body(`Gap: ${t.competitorGap}`, { italic: true }));
      children.push(body(t.opportunity));
    }
    if (trend.recommendedActions.length > 0) {
      children.push(h2("Recommended actions"));
      trend.recommendedActions.forEach((a) => children.push(bullet(a)));
    }
    children.push(
      meta(`Analysed ${new Date(trend.analyzedAt).toLocaleString()} · Sources: ${trend.sources.join(", ")}`),
    );
  }

  // --- Content Strategy -----------------------------------------------------
  if (strategy) {
    children.push(h1("Content Strategy"));
    children.push(h2("Content pillars"));
    for (const p of strategy.pillars) {
      children.push(
        new Paragraph({
          spacing: { after: 20 },
          children: [
            new TextRun({ text: p.name, bold: true }),
            new TextRun({ text: `  ${p.percentage}%`, color: ACCENT, bold: true }),
          ],
        }),
      );
      children.push(body(p.rationale));
    }

    children.push(h2("Buyer journey mapping"));
    children.push(
      table(
        ["Stage", "Pillar", "Posts/week"],
        strategy.buyerJourney.map((j) => [j.stage, j.pillar, String(j.postsPerWeek)]),
      ),
    );

    children.push(h2("Platform strategy"));
    children.push(body(strategy.platformStrategy));

    if (strategy.successMetrics.length > 0) {
      children.push(h2("Success metrics"));
      strategy.successMetrics.forEach((m) => children.push(bullet(m)));
    }
  }

  // --- Content Calendar -----------------------------------------------------
  if (bucket) {
    children.push(h1("Content Calendar"));
    children.push(
      table(
        ["Day", "Time", "Platform", "Pillar", "Topic"],
        bucket.posts.map((p) => [p.day, p.time, p.platform, p.pillar, p.topic]),
      ),
    );
  }

  // --- Creative Briefs -----------------------------------------------------
  if (creative) {
    children.push(h1("Creative Briefs"));
    if (creative.failedPostIds.length > 0) {
      children.push(
        body(`Brief generation failed for: ${creative.failedPostIds.join(", ")}`, { italic: true }),
      );
    }
    for (const b of creative.briefs) {
      children.push(
        new Paragraph({
          spacing: { before: 160, after: 20 },
          children: [
            new TextRun({ text: `${b.postId} — ${b.conceptName}`, bold: true }),
            new TextRun({ text: `  Score ${b.score.toFixed(1)}`, color: ACCENT }),
          ],
        }),
      );
      children.push(body(b.conceptOneSentence));
      children.push(body(`Image prompt: ${b.imagePrompt.detailedPrompt}`, { muted: true }));
      if (b.copyDirection.hookExamples[0]) {
        children.push(body(`“${b.copyDirection.hookExamples[0]}”`, { italic: true }));
      }
      if (b.copyDirection.hashtags.length > 0) {
        children.push(
          body(b.copyDirection.hashtags.slice(0, 10).map((h) => `#${h}`).join(" "), { muted: true }),
        );
      }
    }
  }

  const doc = new Document({
    sections: [{ children }],
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
      },
    },
  });

  return Packer.toBuffer(doc);
}
