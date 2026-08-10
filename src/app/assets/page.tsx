import TopBar from "@/components/TopBar";
import {
  Badge,
  Button,
  Callout,
  Card,
  Dot,
  EmptyState,
  SectionHeading,
  StatTile,
} from "@/components/ui";
import InstagramPost from "@/components/InstagramPost";
import RefinePanel from "@/components/RefinePanel";
import { latestJobByPostForRequest } from "@/lib/canva-store";
import { getActiveCycle } from "@/lib/active-brand";
import { activeImageProvider } from "@/lib/image-generation";
import { overridesForRequest } from "@/lib/prompt-override-store";
import { generateOneImage, generateAllImages } from "./actions";

export const dynamic = "force-dynamic";

const PROVIDER_LABEL: Record<string, string> = {
  openai: "OpenAI",
  pollinations: "Pollinations (free)",
  canva: "Canva queue",
};

export default async function AssetsPage() {
  const cycle = await getActiveCycle();
  const posts = cycle?.posts ?? [];

  // Scoped to this brand's run — post ids like "MON_001" repeat across brands.
  const [jobsByPost, overridesByPost] = cycle?.requestId
    ? await Promise.all([
        latestJobByPostForRequest(cycle.requestId),
        overridesForRequest(cycle.requestId),
      ])
    : [{}, {}];

  const jobs = Object.values(jobsByPost);
  const completed = jobs.filter((j) => j.status === "complete");
  const generating = jobs.filter((j) => j.status === "generating");
  const queued = jobs.filter((j) => j.status === "pending");

  const provider = activeImageProvider();
  const remaining = posts.filter((p) => {
    const job = jobsByPost[p.id];
    return job?.status !== "complete" && job?.status !== "generating";
  });

  const videoPosts = posts.filter((p) => p.isVideo);

  return (
    <>
      <TopBar
        title="Asset Library"
        subtitle={cycle ? `${cycle.brand.name} — post previews` : "No brand selected"}
      />

      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Ready" value={completed.length} tone="good" hint="Image generated" />
          <StatTile
            label="Generating"
            value={generating.length}
            tone={generating.length > 0 ? "run" : "neutral"}
            hint="In progress now"
          />
          <StatTile
            label="Queued"
            value={queued.length}
            tone={queued.length > 0 ? "warn" : "neutral"}
            hint="Awaiting Canva session"
          />
          <StatTile label="Posts total" value={posts.length} hint="This week's plan" />
        </div>

        {generating.length > 0 && (
          <Callout tone="run" title={`Generating ${generating.length} image${generating.length > 1 ? "s" : ""}…`}>
            {provider === "pollinations"
              ? "The free tier allows one image every 15 seconds, so a full week takes a couple of minutes. Refresh to see progress — you can leave this page."
              : "Refresh to see progress — you can leave this page."}
          </Callout>
        )}

        {queued.length > 0 && (
          <Callout tone="warn" title={`${queued.length} job${queued.length > 1 ? "s" : ""} queued for Canva`}>
            Canva runs through the MCP connector in a Claude session — ask Claude to &ldquo;run the
            queued Canva jobs&rdquo; and the images will appear here.
          </Callout>
        )}

        <Card>
          <SectionHeading
            title={
              <span className="inline-flex flex-wrap items-center gap-2">
                Post previews
                <Badge tone={provider === "canva" ? "warn" : "good"}>
                  <Dot tone={provider === "canva" ? "warn" : "good"} />
                  {PROVIDER_LABEL[provider]}
                </Badge>
              </span>
            }
            subtitle="How each post will look on Instagram — image, caption and hashtags together."
            action={
              posts.length > 0 && remaining.length > 0 ? (
                <form action={generateAllImages}>
                  <input type="hidden" name="requestId" value={cycle!.requestId ?? ""} />
                  <Button type="submit" variant="primary" size="sm">
                    {provider === "canva"
                      ? `Queue all ${remaining.length}`
                      : `Generate all ${remaining.length}`}
                  </Button>
                </form>
              ) : null
            }
          />

          {posts.length === 0 ? (
            <EmptyState className="mt-5" title="No posts yet">
              {cycle
                ? `${cycle.brand.name} has no generated calendar. Run the full process from the brand page first.`
                : "Add a brand and run the full process to generate posts."}
            </EmptyState>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {posts.map((post) => {
                const job = jobsByPost[post.id];
                const done = job?.status === "complete";
                const busy = job?.status === "generating";
                return (
                  <InstagramPost
                    key={post.id}
                    brandName={cycle!.brand.name}
                    post={post}
                    job={job}
                    action={
                      busy ? null : (
                        <form action={generateOneImage}>
                          <input type="hidden" name="requestId" value={cycle!.requestId ?? ""} />
                          <input type="hidden" name="postId" value={post.id} />
                          <Button
                            type="submit"
                            variant="secondary"
                            size="sm"
                            className="w-full"
                          >
                            {done ? "Regenerate" : "Generate image"}
                          </Button>
                        </form>
                      )
                    }
                    refine={
                      provider === "canva" ? null : (
                        <RefinePanel
                          requestId={cycle!.requestId ?? ""}
                          postId={post.id}
                          override={overridesByPost[post.id]}
                          disabled={busy}
                        />
                      )
                    }
                  />
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <SectionHeading
            title={
              <span className="inline-flex items-center gap-2">
                Videos
                <Badge tone="neutral">not wired up</Badge>
              </span>
            }
            subtitle="Needs a video key (VIDEO_API_KEY — Higgsfield / Runway / Kling)."
          />
          <EmptyState className="mt-4" title="Video generation is unavailable">
            {videoPosts.length > 0
              ? `${videoPosts.length} of this week's posts specify a video treatment. Their scene-by-scene direction is in the creative briefs, but no video provider is configured to render them — the previews above show a still for those posts.`
              : "No posts in this week specify a video treatment."}
          </EmptyState>
        </Card>
      </div>
    </>
  );
}
