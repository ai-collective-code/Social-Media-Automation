import TopBar from "@/components/TopBar";
import { Card, Button } from "@/components/ui";
import { assets, getPostById } from "@/lib/mock-data";

export default function AssetsPage() {
  return (
    <>
      <TopBar title="Asset Library" subtitle="Week 1 — images, videos & captions" />

      <div className="space-y-6 p-8">
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">Bulk download all assets</Button>
          <Button variant="secondary">View in folders</Button>
        </div>

        <Card>
          <p className="mb-4 text-sm font-semibold text-white">Images ({assets.images.length})</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {assets.images.map((asset) => {
              const post = getPostById(asset.postId);
              return (
                <div
                  key={asset.name}
                  className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/60"
                >
                  <div className="flex aspect-square items-center justify-center text-4xl">🖼️</div>
                  <div className="border-t border-white/10 px-3 py-2">
                    <p className="truncate text-xs font-medium text-white">{asset.name}</p>
                    <p className="truncate text-xs text-slate-500">{post?.day}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <p className="mb-4 text-sm font-semibold text-white">Videos ({assets.videos.length})</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {assets.videos.map((asset) => {
              const post = getPostById(asset.postId);
              return (
                <div
                  key={asset.name}
                  className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/60"
                >
                  <div className="flex aspect-[9/16] items-center justify-center text-4xl">🎬</div>
                  <div className="border-t border-white/10 px-3 py-2">
                    <p className="truncate text-xs font-medium text-white">{asset.name}</p>
                    <p className="truncate text-xs text-slate-500">{post?.day}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Captions</p>
              <p className="text-xs text-slate-500">7 captions with hooks, hashtags & CTAs</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary">View Excel</Button>
              <Button variant="secondary">Download</Button>
              <Button variant="secondary">Copy all</Button>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
