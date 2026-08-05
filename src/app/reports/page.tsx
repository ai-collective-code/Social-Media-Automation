import TopBar from "@/components/TopBar";
import { Card, Button, Badge } from "@/components/ui";
import { reports } from "@/lib/mock-data";

export default function ReportsPage() {
  return (
    <>
      <TopBar title="Reports" subtitle="Workflow reports & analytics" />

      <div className="space-y-6 p-8">
        <Card>
          <div className="divide-y divide-white/10">
            {reports.map((report) => (
              <div
                key={report.name}
                className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-medium text-white">{report.name}</p>
                  <p className="text-xs text-slate-500">Updated {report.updated}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className="border-white/10 bg-white/5 text-slate-300">
                    {report.format}
                  </Badge>
                  <Button variant="secondary">
                    {report.format === "Live Dashboard" ? "Open" : "Download"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary">Generate all reports</Button>
            <Button variant="secondary">Schedule report email</Button>
          </div>
        </Card>
      </div>
    </>
  );
}
