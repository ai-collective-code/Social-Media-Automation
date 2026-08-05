import Link from "next/link";
import TopBar from "@/components/TopBar";
import { Card, Badge } from "@/components/ui";
import { posts, pillarColors, qcStatusMeta } from "@/lib/mock-data";

export default function CalendarPage() {
  return (
    <>
      <TopBar title="Content Calendar" subtitle="Publishing schedule — Week 1" />

      <div className="space-y-4 p-8">
        {posts.map((post) => {
          const qc = qcStatusMeta[post.qc.status];
          return (
            <Card key={post.id} className="hover:border-white/20 transition-colors">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm text-slate-400">
                    <span className="font-semibold text-white">{post.day}</span>
                    <span>·</span>
                    <span>{post.date}</span>
                    <span>·</span>
                    <span>{post.time}</span>
                    <span>·</span>
                    <span>{post.platform}</span>
                  </div>
                  <p className="text-base font-medium text-white">{post.topic}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge className={pillarColors[post.pillar]}>{post.pillar}</Badge>
                    <Badge className="border-white/10 bg-white/5 text-slate-300">
                      {post.buyerStage}
                    </Badge>
                    <Badge className={qc.className}>{qc.label}</Badge>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="text-xs text-slate-500">
                    Predicted engagement: {post.expectedEngagement}
                  </span>
                  <Link
                    href="/quality-check"
                    className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/15"
                  >
                    Review
                  </Link>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
