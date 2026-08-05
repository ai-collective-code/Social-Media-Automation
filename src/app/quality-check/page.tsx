import TopBar from "@/components/TopBar";
import { posts } from "@/lib/mock-data";
import QualityCheckClient from "./QualityCheckClient";

export default function QualityCheckPage() {
  return (
    <>
      <TopBar title="Quality Check" subtitle="Manual review — approve or request revision" />
      <div className="p-8">
        <QualityCheckClient initialPosts={posts} />
      </div>
    </>
  );
}
