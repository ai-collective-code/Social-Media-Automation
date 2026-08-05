import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import { Card, Badge } from "@/components/ui";
import { getRequest, getResult } from "@/lib/research-store";

export const dynamic = "force-dynamic";

export default async function ResearchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const request = await getRequest(id);
  if (!request) notFound();

  const result = await getResult(id);

  return (
    <>
      <TopBar
        title={request.companyName}
        subtitle={`vs. ${request.competitors.map((c) => c.name).join(", ")}`}
      />

      <div className="space-y-6 p-8">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
              <p className="text-base font-medium text-white capitalize">{request.status}</p>
            </div>
            <div className="flex gap-2">
              {request.domain && (
                <Badge className="border-white/10 bg-white/5 text-slate-300">{request.domain}</Badge>
              )}
              {request.industry && (
                <Badge className="border-white/10 bg-white/5 text-slate-300">{request.industry}</Badge>
              )}
            </div>
          </div>
        </Card>

        {!result ? (
          <Card>
            <p className="text-sm text-slate-300">
              No research has been run yet for this request.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Go to chat and ask Claude to &ldquo;run the competitor research for {request.companyName}&rdquo;.
              It will use real browser research (not mock data) on:{" "}
              {request.competitors.map((c) => c.name).join(", ")}, then this page will show the
              findings.
            </p>
          </Card>
        ) : (
          <>
            <Card>
              <p className="mb-2 text-sm font-semibold text-white">Key gaps identified</p>
              <ul className="list-inside list-disc space-y-1 text-sm text-slate-300">
                {result.keyGaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </Card>

            {result.competitors.map((c) => (
              <Card key={c.name}>
                <p className="mb-3 text-base font-semibold text-white">{c.name}</p>
                {c.summary && <p className="mb-4 text-sm text-slate-400">{c.summary}</p>}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {c.platforms.map((p) => (
                    <div
                      key={p.platform}
                      className="rounded-lg border border-white/10 bg-white/[0.02] p-4"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-medium text-white">{p.platform}</p>
                        {p.handle && <span className="text-xs text-slate-500">{p.handle}</span>}
                      </div>
                      <div className="space-y-1 text-sm text-slate-300">
                        {p.followers !== undefined && <p>Followers: {p.followers.toLocaleString()}</p>}
                        {p.engagementRate !== undefined && <p>Engagement: {p.engagementRate}%</p>}
                        {p.postingFrequency && <p>Posting: {p.postingFrequency}</p>}
                      </div>
                      {p.topContentThemes && p.topContentThemes.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {p.topContentThemes.map((t) => (
                            <Badge key={t} className="border-sky-500/30 bg-sky-500/10 text-sky-300">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {p.gaps && p.gaps.length > 0 && (
                        <p className="mt-2 text-xs text-amber-300">Gap: {p.gaps.join("; ")}</p>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            ))}

            <Card>
              <p className="mb-2 text-sm font-semibold text-white">Recommendations</p>
              <ul className="list-inside list-disc space-y-1 text-sm text-slate-300">
                {result.recommendations.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-slate-600">
                Researched {new Date(result.researchedAt).toLocaleString()} · Sources:{" "}
                {result.sources.join(", ")}
              </p>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
