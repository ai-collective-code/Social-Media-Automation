import Link from "next/link";
import TopBar from "@/components/TopBar";
import {
  Badge,
  Card,
  Dot,
  Label,
  ProgressBar,
  SectionHeading,
  StatTile,
  cx,
} from "@/components/ui";
import { workflowSteps } from "@/lib/mock-data";
import { qcSummary } from "@/lib/qc-store";
import { listImageJobs } from "@/lib/canva-store";
import { isLlmConfigured } from "@/lib/llm";
import { getActiveCycle } from "@/lib/active-brand";

export const dynamic = "force-dynamic";

/**
 * Step state is encoded three ways — a glyph, a tone, and a written label — so
 * the tracker is readable without relying on hue alone.
 */
const STATUS_META = {
  complete: {
    icon: "✓",
    label: "Complete",
    tone: "good",
    chip: "border-good-border bg-good-soft text-good",
  },
  in_progress: {
    icon: "▶",
    label: "In progress",
    tone: "run",
    chip: "border-run-border bg-run-soft text-run",
  },
  pending: {
    icon: "○",
    label: "Pending",
    tone: "neutral",
    chip: "border-line-strong bg-surface-3 text-fg-3",
  },
} as const;

export default async function DashboardPage() {
  const cycle = await getActiveCycle();
  const cyclePosts = cycle?.posts ?? [];

  const [qc, jobs] = await Promise.all([
    // Scoped to the active brand's own posts, keyed the same way the QC page
    // stores them, so the tracker can't count another brand's decisions.
    qcSummary(
      cyclePosts.map((p) => ({
        id: cycle?.requestId ? `${cycle.requestId}:${p.id}` : p.id,
        status: p.qcStatus,
      })),
    ),
    listImageJobs(),
  ]);
  const generatedAssets = cycle?.requestId
    ? jobs.filter((j) => j.status === "complete" && j.requestId === cycle.requestId).length
    : 0;
  const llmReady = isLlmConfigured();

  const stepsComplete = workflowSteps.filter((s) => s.status === "complete").length;
  const stepsPct = Math.round((stepsComplete / workflowSteps.length) * 100);

  return (
    <>
      <TopBar
        title="Dashboard"
        subtitle={
          cycle ? `${cycle.brand.name}${cycle.brand.industry ? ` · ${cycle.brand.industry}` : ""}` : "No brand selected"
        }
      />

      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <Label>Current brand</Label>
              <p className="mt-1 truncate text-xl font-semibold text-fg">
                {cycle?.brand.name ?? "No brand yet"}
              </p>
              <p className="mt-0.5 text-sm text-fg-2">
                {cyclePosts.length > 0
                  ? `${cyclePosts.length} posts from the latest run`
                  : "No generated content yet — run the full process from the brand page"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={cyclePosts.length > 0 ? "good" : "neutral"}>
                <span className="tabular">{cyclePosts.length} posts</span>
              </Badge>
              <Badge tone={llmReady ? "good" : "warn"}>
                <Dot tone={llmReady ? "good" : "warn"} />
                {llmReady ? "LLM connected" : "LLM key missing"}
              </Badge>
            </div>
          </div>
        </Card>

        <Card>
          <SectionHeading
            title="Workflow progress"
            subtitle={`${stepsComplete} of ${workflowSteps.length} steps complete`}
            action={
              <span className="tabular text-xs font-semibold text-fg-2">{stepsPct}%</span>
            }
          />
          <ProgressBar
            className="mt-3"
            value={stepsPct}
            label={`Workflow progress: ${stepsComplete} of ${workflowSteps.length} steps complete`}
          />

          <ol className="mt-4 space-y-2">
            {workflowSteps.map((step, idx) => {
              const meta = STATUS_META[step.status];
              // The QC row's detail is computed from real saved decisions
              // rather than the static string in mock data.
              const detail =
                step.id === "quality_check"
                  ? `${qc.approved} approved · ${qc.revision} revision · ${qc.pending} pending`
                  : step.detail;
              return (
                <li
                  key={step.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5"
                >
                  <span
                    aria-hidden
                    className={cx(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                      meta.chip,
                    )}
                  >
                    {meta.icon}
                  </span>

                  <div className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span className="tabular shrink-0 font-mono text-[10px] text-fg-3">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="truncate text-sm font-medium text-fg">{step.label}</span>
                  </div>

                  {detail && (
                    <span className="order-last w-full text-xs text-fg-3 sm:order-none sm:w-auto sm:text-right">
                      {detail}
                    </span>
                  )}

                  <Badge tone={meta.tone} className="shrink-0">
                    {meta.label}
                  </Badge>
                </li>
              );
            })}
          </ol>
        </Card>

        <section className="space-y-3">
          <SectionHeading
            title="This week at a glance"
            subtitle={cycle?.brand.name ?? "No brand selected"}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatTile
              label="Posts scheduled"
              value={cyclePosts.length}
              hint={cyclePosts.length > 0 ? "From the latest completed run" : "No run yet"}
            />
            <StatTile
              label="QC approved"
              value={`${qc.approved} / ${qc.total}`}
              hint={`${qc.revision} revision · ${qc.pending} pending`}
              tone={qc.approved === qc.total ? "good" : "warn"}
            />
            <StatTile
              label="Images generated"
              value={generatedAssets}
              hint={`${jobs.length} image job${jobs.length === 1 ? "" : "s"} total`}
            />
          </div>
        </section>

        <Card>
          <SectionHeading title="Quick actions" />
          <div className="mt-3 flex flex-wrap gap-2.5">
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
      className={cx(
        "group inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
        primary
          ? "bg-accent text-accent-fg hover:bg-accent-hover"
          : "border border-line bg-surface-2 text-fg-2 hover:bg-surface-3 hover:text-fg",
      )}
    >
      {label}
      <span
        aria-hidden
        className="transition-transform duration-150 group-hover:translate-x-0.5"
      >
        →
      </span>
    </Link>
  );
}
