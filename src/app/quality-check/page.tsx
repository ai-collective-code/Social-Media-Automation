import TopBar from "@/components/TopBar";
import { Callout } from "@/components/ui";
import { getActiveCycle } from "@/lib/active-brand";
import { listDecisions } from "@/lib/qc-store";
import QualityCheckClient from "./QualityCheckClient";

export const dynamic = "force-dynamic";

export default async function QualityCheckPage() {
  const [cycle, decisions] = await Promise.all([getActiveCycle(), listDecisions()]);
  const posts = cycle?.posts ?? [];

  return (
    <>
      <TopBar
        title="Quality Check"
        subtitle={
          posts.length > 0
            ? `${cycle!.brand.name} — ${posts.length} posts to review`
            : "Manual review — approve or request revision"
        }
      />
      {/* Padding steps down on small screens so the master-detail layout below
          keeps its full width on a phone. */}
      <div className="p-4 sm:p-6 lg:p-8">
        {posts.length === 0 ? (
          <Callout tone="warn" title="Nothing to review yet">
            {cycle
              ? `${cycle.brand.name} has no generated posts yet. Run the full process from the brand page, then come back here to approve them.`
              : "No brands yet. Add a brand and run the full process to generate posts for review."}
          </Callout>
        ) : (
          <QualityCheckClient
            posts={posts}
            requestId={cycle!.requestId!}
            decisions={decisions}
          />
        )}
      </div>
    </>
  );
}
