import Link from "next/link";
import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import { getBrand } from "@/lib/brand-store";
import { listRunsForBrand, STAGE_LABEL, type Run } from "@/lib/run-store";
import { activeProvider } from "@/lib/llm";
import { Badge, Card, Label, TableWrap, Table, Th, Td, EmptyState } from "@/components/ui";
import RunPanel from "./RunPanel";

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

function when(iso?: string) {
  if (!iso) return "—";
  // Fixed format rather than toLocale*, which would differ between the server
  // render and the browser and trip a hydration mismatch.
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export default async function BrandDetailPage(props: PageProps<"/brands/[id]">) {
  const { id } = await props.params;
  const brand = await getBrand(id);
  if (!brand) notFound();

  const runs = await listRunsForBrand(id);
  const latest = runs[0];

  const profile: { label: string; value?: string }[] = [
    { label: "Industry", value: brand.industry },
    { label: "Website", value: brand.domain },
    { label: "Audience", value: brand.audience },
    { label: "Markets", value: brand.markets },
    { label: "Voice", value: brand.voice },
  ];

  return (
    <>
      <TopBar
        title={brand.name}
        subtitle={brand.industry ?? "No industry set"}
        actions={
          <Link
            href={`/brands/${brand.id}/edit`}
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg"
          >
            Edit
          </Link>
        }
      />

      <div className="grid gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <RunPanel brandId={brand.id} latestRun={latest} provider={activeProvider()} />

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <Label>Profile</Label>
            <dl className="mt-3 grid gap-2.5">
              {profile.map((row) => (
                <div key={row.label} className="grid grid-cols-[7rem_1fr] gap-3 text-sm">
                  <dt className="text-fg-3">{row.label}</dt>
                  <dd className={row.value ? "text-fg-2" : "text-fg-3"}>
                    {row.value ?? "Not set"}
                  </dd>
                </div>
              ))}
            </dl>

            {brand.description && (
              <div className="mt-4 border-t border-line pt-4">
                <Label>What the brand does</Label>
                <p className="mt-1.5 text-sm text-fg-2">{brand.description}</p>
              </div>
            )}

            {brand.platforms && brand.platforms.length > 0 && (
              <div className="mt-4 border-t border-line pt-4">
                <Label>Platforms</Label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {brand.platforms.map((p) => (
                    <Badge key={p} tone="neutral">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card>
            <Label>Guardrails</Label>
            {brand.neverSay ? (
              <>
                <p className="mt-1.5 text-xs text-fg-3">
                  Applied to every brief and caption generated for this brand.
                </p>
                <p className="mt-3 whitespace-pre-line rounded-lg border border-warn-border bg-warn-soft p-3 text-sm text-warn">
                  {brand.neverSay}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-fg-3">
                Nothing set. Adding claims or words to avoid here keeps generated copy out of
                trouble — it&apos;s passed into every generation prompt.
              </p>
            )}
          </Card>
        </div>

        <Card>
          <Label>Run history</Label>
          {runs.length === 0 ? (
            <p className="mt-3 text-sm text-fg-3">
              No runs yet. Starting the full process will appear here.
            </p>
          ) : (
            <TableWrap className="mt-3">
              <Table>
                <thead>
                  <tr>
                    <Th>Status</Th>
                    <Th>Stage</Th>
                    <Th>Stages done</Th>
                    <Th>Queued</Th>
                    <Th>Finished</Th>
                    <Th>Results</Th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <Td>
                        <Badge tone={statusTone(run.status)}>{run.status}</Badge>
                      </Td>
                      <Td>{run.stage ? STAGE_LABEL[run.stage] : "—"}</Td>
                      <Td className="tabular">{run.completedStages.length} / 6</Td>
                      <Td className="tabular whitespace-nowrap">{when(run.queuedAt)}</Td>
                      <Td className="tabular whitespace-nowrap">{when(run.finishedAt)}</Td>
                      <Td>
                        {run.requestId ? (
                          <Link
                            href={`/research/${run.requestId}`}
                            className="font-medium text-accent hover:underline"
                          >
                            View
                          </Link>
                        ) : (
                          "—"
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>

        {runs.some((r) => r.status === "failed") && (
          <EmptyState title="A run failed" className="border-warn-border">
            The most common cause is the search engine temporarily blocking automated queries. It
            clears on its own — starting another run in a few minutes usually works.
          </EmptyState>
        )}
      </div>
    </>
  );
}
