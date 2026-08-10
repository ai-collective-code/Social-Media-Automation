import Link from "next/link";
import TopBar from "@/components/TopBar";
import { listBrands } from "@/lib/brand-store";
import { listRuns, STAGE_LABEL, type Run } from "@/lib/run-store";
import { Badge, Card, EmptyState, Label, Dot } from "@/components/ui";

export const dynamic = "force-dynamic";

function statusTone(status: Run["status"]) {
  return status === "complete"
    ? "good"
    : status === "failed"
      ? "bad"
      : status === "running"
        ? "run"
        : "neutral";
}

export default async function BrandsPage() {
  const [brands, runs] = await Promise.all([listBrands(), listRuns()]);

  const latestByBrand = new Map<string, Run>();
  for (const run of runs) {
    if (!latestByBrand.has(run.brandId)) latestByBrand.set(run.brandId, run);
  }

  const activeCount = runs.filter((r) => r.status === "running" || r.status === "queued").length;

  return (
    <>
      <TopBar
        title="Brands"
        subtitle={
          brands.length === 0
            ? "No brands yet"
            : `${brands.length} ${brands.length === 1 ? "brand" : "brands"}${
                activeCount > 0 ? ` · ${activeCount} run${activeCount === 1 ? "" : "s"} in flight` : ""
              }`
        }
        actions={
          <Link
            href="/brands/new"
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
          >
            New brand
          </Link>
        }
      />

      <div className="px-4 py-6 sm:px-6 lg:px-8">
        {brands.length === 0 ? (
          <EmptyState
            title="Add the first brand you manage"
            action={
              <Link
                href="/brands/new"
                className="inline-flex rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
              >
                New brand
              </Link>
            }
          >
            A brand profile holds the name, positioning, voice and guardrails. Once it&apos;s saved
            you can start the full process from it — competitors are discovered automatically.
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {brands.map((brand) => {
              const run = latestByBrand.get(brand.id);
              return (
                <Link
                  key={brand.id}
                  href={`/brands/${brand.id}`}
                  className="group rounded-xl border border-line bg-canvas-raised p-5 transition-colors hover:border-line-strong hover:bg-surface-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-fg group-hover:text-accent">
                        {brand.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-fg-3">
                        {brand.industry ?? brand.domain ?? "No industry set"}
                      </p>
                    </div>
                    {run && (
                      <Badge tone={statusTone(run.status)}>
                        <Dot tone={statusTone(run.status)} pulse={run.status === "running"} />
                        {run.status}
                      </Badge>
                    )}
                  </div>

                  {brand.description && (
                    <p className="clamp-2 mt-3 text-xs text-fg-2">{brand.description}</p>
                  )}

                  <div className="mt-4 border-t border-line pt-3">
                    <Label>Latest run</Label>
                    <p className="mt-1 truncate text-xs text-fg-2">
                      {run
                        ? run.status === "running" && run.stage
                          ? `${STAGE_LABEL[run.stage]} — ${run.completedStages.length}/6 stages`
                          : run.message
                        : "Never run"}
                    </p>
                  </div>

                  {brand.platforms && brand.platforms.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {brand.platforms.map((p) => (
                        <span
                          key={p}
                          className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] text-fg-3"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {activeCount > 1 && (
          <Card className="mt-6">
            <Label>Queue</Label>
            <p className="mt-1.5 text-sm text-fg-2">
              Runs are processed one at a time. Running several at once would trip the search
              engine&apos;s bot detection and return empty research, so the rest wait their turn.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}
