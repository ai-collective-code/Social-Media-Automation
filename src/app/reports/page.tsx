import TopBar from "@/components/TopBar";
import { Card, Badge } from "@/components/ui";
import { listReports } from "@/lib/reports";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const reports = await listReports();
  const ready = reports.filter((r) => !r.blockedReason);

  return (
    <>
      <TopBar title="Reports" subtitle="Generated from real pipeline data" />

      <div className="space-y-6 p-8">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">
              Available reports
              <span className="ml-2 font-normal text-slate-500">
                {ready.length} of {reports.length} ready
              </span>
            </p>
          </div>

          <div className="divide-y divide-white/10">
            {reports.map((report) => (
              <div
                key={report.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{report.name}</p>
                  {report.blockedReason ? (
                    <p className="mt-0.5 text-xs text-slate-500">{report.blockedReason}</p>
                  ) : (
                    <p className="mt-0.5 text-xs text-slate-500">
                      Markdown{report.updated ? ` · updated ${report.updated}` : ""}
                    </p>
                  )}
                </div>

                {report.blockedReason ? (
                  <Badge className="border-slate-500/30 bg-slate-500/10 text-slate-400">
                    Not available yet
                  </Badge>
                ) : (
                  <a
                    href={`/api/reports/${report.id}`}
                    download
                    className="rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-emerald-400"
                  >
                    Download .md
                  </a>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-white">How these work</p>
          <p className="mt-2 text-sm text-slate-400">
            Each report is generated on request from the data actually on disk — competitor
            research results, QC decisions, and the Canva asset log. A report only offers a
            download when its underlying workflow has produced something; the rest state what
            they&apos;re waiting on rather than downloading an empty file.
          </p>
        </Card>
      </div>
    </>
  );
}
