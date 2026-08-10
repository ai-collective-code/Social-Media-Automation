import TopBar from "@/components/TopBar";
import { Badge, Card, Dot, SectionHeading } from "@/components/ui";
import { listReports } from "@/lib/reports";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const reports = await listReports();
  const ready = reports.filter((r) => !r.blockedReason);

  return (
    <>
      <TopBar title="Reports" subtitle="Generated from real pipeline data" />

      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <Card>
          <SectionHeading
            title="Available reports"
            subtitle={
              <span className="tabular">
                {ready.length} of {reports.length} ready
              </span>
            }
          />

          <div className="mt-4 divide-y divide-line">
            {reports.map((report) => (
              <div
                key={report.id}
                className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-sm font-medium text-fg">{report.name}</p>
                  {report.blockedReason ? (
                    <p className="mt-1 text-xs leading-relaxed text-fg-3">
                      {report.blockedReason}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-fg-3">
                      Markdown
                      {report.updated && (
                        <>
                          {" · updated "}
                          <span className="tabular">{report.updated}</span>
                        </>
                      )}
                    </p>
                  )}
                </div>

                <div className="shrink-0">
                  {report.blockedReason ? (
                    <Badge tone="warn">
                      <Dot tone="warn" />
                      Not available yet
                    </Badge>
                  ) : (
                    <a
                      href={`/api/reports/${report.id}`}
                      download
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
                    >
                      Download .md
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeading title="How these work" />
          <p className="mt-2 text-sm leading-relaxed text-fg-2">
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
