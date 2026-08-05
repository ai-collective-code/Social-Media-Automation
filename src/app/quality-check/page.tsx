import TopBar from "@/components/TopBar";
import { posts } from "@/lib/mock-data";
import { listDecisions } from "@/lib/qc-store";
import QualityCheckClient from "./QualityCheckClient";

export const dynamic = "force-dynamic";

export default async function QualityCheckPage() {
  const decisions = await listDecisions();

  return (
    <>
      <TopBar title="Quality Check" subtitle="Manual review — approve or request revision" />
      <div className="p-8">
        <QualityCheckClient posts={posts} decisions={decisions} />
      </div>
    </>
  );
}
