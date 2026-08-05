import Link from "next/link";
import TopBar from "@/components/TopBar";
import { Card, Badge, Button } from "@/components/ui";
import { client, workflowSteps, posts } from "@/lib/mock-data";

const STATUS_META = {
  complete: { icon: "✓", className: "bg-emerald-500 text-slate-950" },
  in_progress: { icon: "…", className: "bg-amber-400 text-slate-950" },
  pending: { icon: "○", className: "bg-slate-700 text-slate-400" },
};

export default function DashboardPage() {
  const approvedCount = posts.filter((p) => p.qc.status === "approved").length;
  const liveCount = posts.filter((p) => p.publish.status === "live").length;

  return (
    <>
      <TopBar title="Dashboard" subtitle={`${client.name} · ${client.industry}`} />

      <div className="space-y-6 p-8">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Current project</p>
              <p className="text-xl font-semibold text-white">{client.name}</p>
              <p className="text-sm text-slate-400">{client.week}</p>
            </div>
            <Badge className="border-sky-500/30 bg-sky-500/10 text-sky-300">
              Week {client.weekNumber} / {client.totalWeeks}
            </Badge>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <p className="mb-4 text-sm font-semibold text-white">Workflow progress</p>
            <ol className="space-y-3">
              {workflowSteps.map((step, idx) => {
                const meta = STATUS_META[step.status];
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
                    {step.detail && (
                      <span className="ml-auto text-xs text-slate-500">{step.detail}</span>
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
              <Stat label="QC approved" value={`${approvedCount} / ${posts.length}`} />
              <Stat label="Live on platforms" value={`${liveCount}`} />
            </div>
          </Card>
        </div>

        <Card>
          <p className="mb-4 text-sm font-semibold text-white">Quick actions</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/calendar">
              <Button variant="secondary">View Content Calendar</Button>
            </Link>
            <Link href="/quality-check">
              <Button variant="primary">Review QC</Button>
            </Link>
            <Link href="/assets">
              <Button variant="secondary">Download Assets</Button>
            </Link>
            <Link href="/reports">
              <Button variant="secondary">Generate Report</Button>
            </Link>
          </div>
        </Card>
      </div>
    </>
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
