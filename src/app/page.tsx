import Link from "next/link";
import TopBar from "@/components/TopBar";
import { Card, Badge } from "@/components/ui";
import { client, workflowSteps, posts } from "@/lib/mock-data";
import { qcSummary } from "@/lib/qc-store";
import { listImageJobs } from "@/lib/canva-store";
import { isLlmConfigured } from "@/lib/llm";

export const dynamic = "force-dynamic";

const STATUS_META = {
  complete: { icon: "✓", className: "bg-emerald-500 text-slate-950" },
  in_progress: { icon: "…", className: "bg-amber-400 text-slate-950" },
  pending: { icon: "○", className: "bg-slate-700 text-slate-400" },
};

export default async function DashboardPage() {
  const [qc, jobs] = await Promise.all([
    qcSummary(posts.map((p) => ({ id: p.id, status: p.qc.status }))),
    listImageJobs(),
  ]);
  const generatedAssets = jobs.filter((j) => j.status === "complete").length;
  const llmReady = isLlmConfigured();

  return (
    <>
      <TopBar title="Dashboard" subtitle={`${client.name} · ${client.industry}`} />

      <div className="space-y-6 p-8">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Current project</p>
              <p className="text-xl font-semibold text-white">{client.name}</p>
              <p className="text-sm text-slate-400">{client.week}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="border-sky-500/30 bg-sky-500/10 text-sky-300">
                Week {client.weekNumber} / {client.totalWeeks}
              </Badge>
              <Badge
                className={
                  llmReady
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                }
              >
                {llmReady ? "LLM connected" : "LLM key missing"}
              </Badge>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <p className="mb-4 text-sm font-semibold text-white">Workflow progress</p>
            <ol className="space-y-3">
              {workflowSteps.map((step, idx) => {
                const meta = STATUS_META[step.status];
                // The QC row's detail is computed from real saved decisions
                // rather than the static string in mock data.
                const detail =
                  step.id === "quality_check"
                    ? `${qc.approved} approved · ${qc.revision} revision · ${qc.pending} pending`
                    : step.detail;
                return (
                  <li key={step.id} className="flex items-center gap-3">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${meta.className}`}
                    >
                      {meta.icon}
                    </span>
                    <span className="text-sm text-slate-200">
                      Step {idx + 1}: {step.label}
                    </span>
                    {detail && (
                      <span className="ml-auto text-right text-xs text-slate-500">{detail}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </Card>

          <Card>
            <p className="mb-4 text-sm font-semibold text-white">This week at a glance</p>
            <div className="space-y-4">
              <Stat label="Posts scheduled" value={`${posts.length}`} />
              <Stat label="QC approved" value={`${qc.approved} / ${qc.total}`} />
              <Stat label="Images generated" value={`${generatedAssets}`} />
            </div>
          </Card>
        </div>

        <Card>
          <p className="mb-4 text-sm font-semibold text-white">Quick actions</p>
          <div className="flex flex-wrap gap-3">
            <QuickAction href="/research" label="New competitor research" primary />
            <QuickAction href="/calendar" label="View content calendar" />
            <QuickAction href="/quality-check" label="Review QC" />
            <QuickAction href="/assets" label="Asset library" />
            <QuickAction href="/reports" label="Download reports" />
          </div>
        </Card>
      </div>
    </>
  );
}

/**
 * A link styled as a button. Deliberately not <Link><Button/></Link> — nesting
 * a <button> inside an <a> is invalid HTML and breaks keyboard semantics.
 */
function QuickAction({
  href,
  label,
  primary,
}: {
  href: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
        primary
          ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
          : "bg-white/10 text-white hover:bg-white/15"
      }`}
    >
      {label}
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 pb-3 last:border-0 last:pb-0">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-lg font-semibold text-white">{value}</span>
    </div>
  );
}
