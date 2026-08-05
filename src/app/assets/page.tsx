import Image from "next/image";
import TopBar from "@/components/TopBar";
import { Card, Button, Badge } from "@/components/ui";
import { posts, assets } from "@/lib/mock-data";
import { latestJobByPost, type ImageJob } from "@/lib/canva-store";
import { queueImageGeneration } from "./actions";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const jobsByPost = await latestJobByPost();
  const completed = Object.values(jobsByPost).filter((j) => j.status === "complete");
  const pending = Object.values(jobsByPost).filter((j) => j.status === "pending");

  return (
    <>
      <TopBar title="Asset Library" subtitle="Week 1 — images, videos & captions" />

      <div className="space-y-6 p-8">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">
                Static images — Canva{" "}
                <Badge className="ml-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                  live
                </Badge>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {completed.length} generated · {pending.length} queued · {posts.length} posts total
              </p>
            </div>
          </div>

          {pending.length > 0 && (
            <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {pending.length} job{pending.length > 1 ? "s" : ""} queued. Canva runs through the
              MCP connector in a Claude session — ask Claude to &ldquo;run the queued Canva
              jobs&rdquo; and the images will appear here.
            </p>
          )}

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <ImageSlot key={post.id} postId={post.id} day={post.day} topic={post.topic} job={jobsByPost[post.id]} />
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">
                Videos{" "}
                <Badge className="ml-1 border-slate-500/30 bg-slate-500/10 text-slate-400">
                  not wired up
                </Badge>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Needs a video key (Higgsfield / Runway / Kling). Filenames below are placeholders
                from the plan — no video files exist yet.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {assets.videos.map((v) => (
              <Badge key={v.name} className="border-white/10 bg-white/5 text-slate-400">
                {v.name}
              </Badge>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">
                Captions{" "}
                <Badge className="ml-1 border-slate-500/30 bg-slate-500/10 text-slate-400">
                  not wired up
                </Badge>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Needs ANTHROPIC_API_KEY. Draft copy currently lives in mock data.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

function ImageSlot({
  postId,
  day,
  topic,
  job,
}: {
  postId: string;
  day: string;
  topic: string;
  job?: ImageJob;
}) {
  const done = job?.status === "complete" && job.result;

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/60">
      <div className="relative flex aspect-[4/5] items-center justify-center bg-slate-900">
        {done ? (
          <Image
            src={job.result!.localPath}
            alt={`${day} — ${topic}`}
            width={1080}
            height={1350}
            className="h-full w-full object-cover"
          />
        ) : job?.status === "pending" ? (
          <span className="px-3 text-center text-xs text-amber-300">Queued</span>
        ) : job?.status === "failed" ? (
          <span className="px-3 text-center text-xs text-rose-300">Failed</span>
        ) : (
          <span className="px-3 text-center text-xs text-slate-600">No image yet</span>
        )}
      </div>

      <div className="space-y-2 border-t border-white/10 px-3 py-3">
        <p className="text-xs font-medium text-white">{day}</p>
        <p className="line-clamp-2 text-xs text-slate-500">{topic}</p>

        {done && (
          <a
            href={job.result!.editUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-xs text-sky-400 hover:text-sky-300"
          >
            Edit in Canva →
          </a>
        )}

        <form action={queueImageGeneration}>
          <input type="hidden" name="postId" value={postId} />
          <Button type="submit" variant="secondary" className="w-full !py-1.5 text-xs">
            {done ? "Regenerate" : job?.status === "pending" ? "Re-queue" : "Generate with Canva"}
          </Button>
        </form>
      </div>
    </div>
  );
}
