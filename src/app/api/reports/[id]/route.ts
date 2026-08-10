import { renderReport, type ReportId } from "@/lib/reports";

const VALID: ReportId[] = [
  "competitor-analysis",
  "quality-check",
  "asset-log",
  "trend-analysis",
  "content-strategy",
  "content-bucketing",
  "creative-director",
  "publishing-log",
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Validate against the allowlist before touching the filesystem — `id` is
  // user-controlled and feeds a filename below.
  if (!VALID.includes(id as ReportId)) {
    return new Response("Unknown report", { status: 404 });
  }

  const body = await renderReport(id as ReportId);
  if (body === null) {
    return new Response(
      "This report has no data yet. Run the workflow that produces it first.",
      { status: 409 }
    );
  }

  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${id}-${date}.md"`,
      "Cache-Control": "no-store",
    },
  });
}
