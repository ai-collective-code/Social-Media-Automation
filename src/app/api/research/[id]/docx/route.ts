import { renderResearchDocx } from "@/lib/research-docx";
import { getRequest } from "@/lib/research-store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const request = await getRequest(id);
  if (!request) {
    return new Response("No research request with that id.", { status: 404 });
  }

  const buffer = await renderResearchDocx(id);
  if (!buffer) {
    return new Response(
      "This request has no completed research yet — run it first, then export.",
      { status: 409 },
    );
  }

  const stem = request.companyName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "research";
  const date = new Date().toISOString().slice(0, 10);

  // `Response` wants a Web-standard BodyInit; Node's Buffer type doesn't
  // structurally satisfy it under this project's TS lib config even though
  // it's a Uint8Array at runtime — a plain view sidesteps the mismatch.
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${stem}-research-${date}.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
