import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import { Card, Badge } from "@/components/ui";
import { getRequest, getResult } from "@/lib/research-store";
import { isRunning, jobIdFor } from "@/lib/pipeline/jobs";
import { isLlmConfigured } from "@/lib/llm";
import {
  getTrendResult,
  getStrategyResult,
  getBucketResult,
  getCreativeResult,
} from "@/lib/pipeline-store";
import { latestJobByPostForRequest } from "@/lib/canva-store";
import RunResearch from "./RunResearch";
import RunStage from "./RunStage";
import BriefAssetPanel from "./BriefAssetPanel";
import { startStage, pollStage } from "./stageActions";

export const dynamic = "force-dynamic";

export default async function ResearchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const request = await getRequest(id);
  if (!request) notFound();

  const [
    result,
    running,
    trendResult,
    strategyResult,
    bucketResult,
    creativeResult,
    trendsRunning,
    strategyRunning,
    bucketingRunning,
    creativeRunning,
    imageJobsByPost,
  ] = await Promise.all([
    getResult(id),
    isRunning(id),
    getTrendResult(id),
    getStrategyResult(id),
    getBucketResult(id),
    getCreativeResult(id),
    isRunning(jobIdFor(id, "trends")),
    isRunning(jobIdFor(id, "strategy")),
    isRunning(jobIdFor(id, "bucketing")),
    isRunning(jobIdFor(id, "creative")),
    latestJobByPostForRequest(id),
  ]);
  const llmReady = isLlmConfigured();

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
              <p className="text-xs uppercase tracking-wide text-fg-3">Status</p>
              <p className="text-base font-medium text-fg capitalize">{request.status}</p>
            </div>
            <div className="flex gap-2">
              {request.domain && (
                <Badge className="border-line bg-surface-2 text-fg-2">{request.domain}</Badge>
              )}
              {request.industry && (
                <Badge className="border-line bg-surface-2 text-fg-2">{request.industry}</Badge>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <p className="mb-3 text-sm font-semibold text-fg">
            {result ? "Re-run analysis" : "Run analysis"}
          </p>
          <RunResearch
            requestId={id}
            initiallyRunning={running}
            hasResult={result !== undefined}
            llmReady={llmReady}
          />
        </Card>

        {!result ? (
          <Card>
            <p className="text-sm text-fg-2">No research has been run yet.</p>
            <p className="mt-2 text-sm text-fg-3">
              Press <span className="text-fg-2">Run research now</span> above. The server
              searches the web for {request.companyName} and{" "}
              {request.competitors.map((c) => c.name).join(", ")}, reads the pages it finds, then
              analyses them with the model. No chat session involved.
            </p>
          </Card>
        ) : (
          <>
            <Card>
              <p className="mb-2 text-sm font-semibold text-fg">Key gaps identified</p>
              <ul className="list-inside list-disc space-y-1 text-sm text-fg-2">
                {result.keyGaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </Card>

            {result.competitors.map((c) => (
              <Card key={c.name}>
                <p className="mb-3 text-base font-semibold text-fg">{c.name}</p>
                {c.summary && <p className="mb-4 text-sm text-fg-2">{c.summary}</p>}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {c.platforms.map((p) => (
                    <div
                      key={p.platform}
                      className="rounded-lg border border-line bg-surface-2 p-4"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-medium text-fg">{p.platform}</p>
                        {p.handle && <span className="text-xs text-fg-3">{p.handle}</span>}
                      </div>
                      <div className="space-y-1 text-sm text-fg-2">
                        {p.followers !== undefined && <p>Followers: {p.followers.toLocaleString()}</p>}
                        {p.engagementRate !== undefined && <p>Engagement: {p.engagementRate}%</p>}
                        {p.postingFrequency && <p>Posting: {p.postingFrequency}</p>}
                      </div>
                      {p.topContentThemes && p.topContentThemes.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {p.topContentThemes.map((t) => (
                            <Badge key={t} className="border-run-border bg-run-soft text-run">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {p.gaps && p.gaps.length > 0 && (
                        <p className="mt-2 text-xs text-warn">Gap: {p.gaps.join("; ")}</p>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            ))}

            <Card>
              <p className="mb-2 text-sm font-semibold text-fg">Recommendations</p>
              <ul className="list-inside list-disc space-y-1 text-sm text-fg-2">
                {result.recommendations.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-fg-3">
                Researched {new Date(result.researchedAt).toLocaleString()} · Sources:{" "}
                {result.sources.join(", ")}
              </p>
            </Card>

            {/* Workflow 2 — Trend Analysis. Reads the competitor result above. */}
            <Card>
              <p className="mb-3 text-sm font-semibold text-fg">
                {trendResult ? "Re-run trend analysis" : "Trend analysis"}
              </p>
              <RunStage
                label="Trend analysis"
                initiallyRunning={trendsRunning}
                hasResult={trendResult !== undefined}
                llmReady={llmReady}
                start={startStage.bind(null, id, "trends")}
                poll={pollStage.bind(null, id, "trends")}
              />
            </Card>

            {trendResult && (
              <Card>
                <p className="mb-3 text-base font-semibold text-fg">Trends identified</p>
                <div className="space-y-4">
                  {trendResult.trends.map((t) => (
                    <div key={t.name} className="rounded-lg border border-line bg-surface-2 p-4">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-fg">{t.name}</p>
                        <Badge className="border-run-border bg-run-soft text-run">
                          {t.growthSignal}
                        </Badge>
                      </div>
                      <p className="text-xs text-warn">Gap: {t.competitorGap}</p>
                      <p className="mt-1 text-sm text-fg-2">{t.opportunity}</p>
                    </div>
                  ))}
                </div>
                {trendResult.recommendedActions.length > 0 && (
                  <>
                    <p className="mb-2 mt-5 text-sm font-semibold text-fg">Recommended actions</p>
                    <ul className="list-inside list-disc space-y-1 text-sm text-fg-2">
                      {trendResult.recommendedActions.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="mt-4 text-xs text-fg-3">
                  Analysed {new Date(trendResult.analyzedAt).toLocaleString()} · Sources:{" "}
                  {trendResult.sources.join(", ")}
                </p>
              </Card>
            )}

            {/* Workflow 3 — Content Strategy. Reads competitor + trend results. */}
            {trendResult ? (
              <Card>
                <p className="mb-3 text-sm font-semibold text-fg">
                  {strategyResult ? "Re-run content strategy" : "Content strategy"}
                </p>
                <RunStage
                  label="Content strategy"
                  initiallyRunning={strategyRunning}
                  hasResult={strategyResult !== undefined}
                  llmReady={llmReady}
                  start={startStage.bind(null, id, "strategy")}
                  poll={pollStage.bind(null, id, "strategy")}
                />
              </Card>
            ) : (
              <Card>
                <p className="text-sm text-fg-3">
                  Waiting for Trend Analysis to complete before Content Strategy can run.
                </p>
              </Card>
            )}

            {strategyResult && (
              <Card>
                <p className="mb-3 text-base font-semibold text-fg">Content pillars</p>
                <div className="space-y-3">
                  {strategyResult.pillars.map((p) => (
                    <div key={p.name} className="rounded-lg border border-line bg-surface-2 p-4">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-fg">{p.name}</p>
                        <Badge className="border-good-border bg-good-soft text-good">
                          {p.percentage}%
                        </Badge>
                      </div>
                      <p className="text-sm text-fg-2">{p.rationale}</p>
                    </div>
                  ))}
                </div>

                <p className="mb-2 mt-5 text-sm font-semibold text-fg">Buyer journey mapping</p>
                <table className="w-full text-left text-sm text-fg-2">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-fg-3">
                      <th className="pb-2 pr-4">Stage</th>
                      <th className="pb-2 pr-4">Pillar</th>
                      <th className="pb-2">Posts/week</th>
                    </tr>
                  </thead>
                  <tbody>
                    {strategyResult.buyerJourney.map((j) => (
                      <tr key={j.stage} className="border-t border-line">
                        <td className="py-2 pr-4">{j.stage}</td>
                        <td className="py-2 pr-4">{j.pillar}</td>
                        <td className="py-2">{j.postsPerWeek}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <p className="mb-2 mt-5 text-sm font-semibold text-fg">Platform strategy</p>
                <p className="text-sm text-fg-2">{strategyResult.platformStrategy}</p>

                {strategyResult.successMetrics.length > 0 && (
                  <>
                    <p className="mb-2 mt-5 text-sm font-semibold text-fg">Success metrics</p>
                    <ul className="list-inside list-disc space-y-1 text-sm text-fg-2">
                      {strategyResult.successMetrics.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </>
                )}
              </Card>
            )}

            {/* Workflow 4 — Content Bucketing. Reads the content strategy result. */}
            {strategyResult ? (
              <Card>
                <p className="mb-3 text-sm font-semibold text-fg">
                  {bucketResult ? "Re-run content bucketing" : "Content bucketing"}
                </p>
                <RunStage
                  label="Content bucketing"
                  initiallyRunning={bucketingRunning}
                  hasResult={bucketResult !== undefined}
                  llmReady={llmReady}
                  start={startStage.bind(null, id, "bucketing")}
                  poll={pollStage.bind(null, id, "bucketing")}
                />
              </Card>
            ) : (
              <Card>
                <p className="text-sm text-fg-3">
                  Waiting for Content Strategy to complete before Content Bucketing can run.
                </p>
              </Card>
            )}

            {bucketResult && (
              <Card>
                <p className="mb-3 text-base font-semibold text-fg">Weekly content calendar</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-fg-2">
                    <thead>
                      <tr className="text-xs uppercase tracking-wide text-fg-3">
                        <th className="pb-2 pr-4">Day</th>
                        <th className="pb-2 pr-4">Time</th>
                        <th className="pb-2 pr-4">Platform</th>
                        <th className="pb-2 pr-4">Pillar</th>
                        <th className="pb-2">Topic</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bucketResult.posts.map((p) => (
                        <tr key={p.id} className="border-t border-line">
                          <td className="py-2 pr-4">{p.day}</td>
                          <td className="py-2 pr-4">{p.time}</td>
                          <td className="py-2 pr-4">{p.platform}</td>
                          <td className="py-2 pr-4">{p.pillar}</td>
                          <td className="py-2">{p.topic}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Workflow 4.5 — Creative Director. Reads the content bucketing result. */}
            {bucketResult ? (
              <Card>
                <p className="mb-3 text-sm font-semibold text-fg">
                  {creativeResult ? "Re-run creative director" : "Creative director"}
                </p>
                <RunStage
                  label="Creative director"
                  initiallyRunning={creativeRunning}
                  hasResult={creativeResult !== undefined}
                  llmReady={llmReady}
                  start={startStage.bind(null, id, "creative")}
                  poll={pollStage.bind(null, id, "creative")}
                />
              </Card>
            ) : (
              <Card>
                <p className="text-sm text-fg-3">
                  Waiting for Content Bucketing to complete before Creative Director can run.
                </p>
              </Card>
            )}

            {creativeResult && (
              <Card>
                <p className="mb-3 text-base font-semibold text-fg">Creative briefs</p>
                {creativeResult.failedPostIds.length > 0 && (
                  <p className="mb-4 rounded-lg border border-warn-border bg-warn-soft px-3 py-2 text-xs text-warn">
                    Brief generation failed for: {creativeResult.failedPostIds.join(", ")} — re-run
                    creative director to retry those posts.
                  </p>
                )}
                <div className="space-y-4">
                  {creativeResult.briefs.map((b) => (
                    <div key={b.postId} className="rounded-lg border border-line bg-surface-2 p-4">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-fg">
                          {b.postId} — {b.conceptName}
                        </p>
                        <Badge tone="accent">Score {b.score.toFixed(1)}</Badge>
                      </div>
                      <p className="text-sm text-fg-2">{b.conceptOneSentence}</p>
                      <p className="mt-2 line-clamp-3 text-xs text-fg-3">{b.imagePrompt.detailedPrompt}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {b.copyDirection.hashtags.slice(0, 8).map((h) => (
                          <Badge key={h} className="border-line bg-surface-2 text-fg-2">
                            #{h}
                          </Badge>
                        ))}
                      </div>
                      {b.copyDirection.hookExamples[0] && (
                        <p className="mt-2 text-xs italic text-fg-2">“{b.copyDirection.hookExamples[0]}”</p>
                      )}
                      <BriefAssetPanel
                        requestId={id}
                        postId={b.postId}
                        captionExample={b.copyDirection.captionExample}
                        hashtags={b.copyDirection.hashtags}
                        job={imageJobsByPost[b.postId]}
                      />
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}
