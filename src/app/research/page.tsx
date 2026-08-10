import Link from "next/link";
import TopBar from "@/components/TopBar";
import {
  Badge,
  Card,
  EmptyState,
  Field,
  Input,
  Label,
  SectionHeading,
  type Tone,
} from "@/components/ui";
import { listRequests } from "@/lib/research-store";
import { submitResearchRequest } from "./actions";
import SubmitButton from "./SubmitButton";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, Tone> = {
  pending: "neutral",
  researching: "run",
  complete: "good",
};

export default async function ResearchPage() {
  const requests = await listRequests();

  return (
    <>
      <TopBar
        title="Competitor Research"
        subtitle="Enter your company + competitors to kick off real research"
      />

      <div className="grid grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:px-8">
        <Card>
          <SectionHeading
            title="New research request"
            subtitle="Competitors are found automatically — you only have to name your own company."
          />

          <form action={submitResearchRequest} className="mt-5 space-y-4">
            <Field label="Your company name" htmlFor="companyName">
              <Input
                id="companyName"
                name="companyName"
                type="text"
                required
                placeholder="Acme Inc."
              />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Domain" htmlFor="domain" hint="Optional">
                <Input id="domain" name="domain" type="text" placeholder="acme.com" />
              </Field>
              <Field
                label="Industry"
                htmlFor="industry"
                hint="Optional, but sharpens the search"
              >
                <Input id="industry" name="industry" type="text" placeholder="Clean beauty" />
              </Field>
            </div>

            <details className="rounded-lg border border-line bg-surface-2 px-3.5 py-2.5">
              <summary className="cursor-pointer select-none text-sm font-medium text-fg-2 hover:text-fg">
                Name competitors myself instead
              </summary>
              <p className="mt-2 text-xs text-fg-3">
                Filling in even one competitor here skips automatic discovery entirely and uses
                only the names you give.
              </p>
              <fieldset className="mt-3 space-y-3">
                <legend className="mb-2">
                  <Label>Competitors (up to 5)</Label>
                </legend>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label={`Competitor ${i} name`} htmlFor={`competitor${i}Name`}>
                      <Input
                        id={`competitor${i}Name`}
                        name={`competitor${i}Name`}
                        type="text"
                        placeholder={`Competitor ${i} name`}
                      />
                    </Field>
                    <Field label={`Competitor ${i} website`} htmlFor={`competitor${i}Url`}>
                      <Input
                        id={`competitor${i}Url`}
                        name={`competitor${i}Url`}
                        type="text"
                        placeholder="Website (optional)"
                      />
                    </Field>
                  </div>
                ))}
              </fieldset>
            </details>

            <SubmitButton />
            <p className="text-xs text-fg-3">
              Leave the competitors section closed and we&apos;ll search for your top competitors
              before creating the request — this takes a little while. Either way, submitting only
              creates the request; you still run each pipeline stage from its page afterward, and
              each stage takes several minutes on its own.
            </p>
          </form>
        </Card>

        <Card>
          <SectionHeading
            title="Requests"
            action={
              <Badge tone="neutral">
                <span className="tabular">{requests.length}</span>
              </Badge>
            }
          />

          {requests.length === 0 ? (
            <EmptyState className="mt-5" title="No research requests yet">
              Fill in the form to create your first request.
            </EmptyState>
          ) : (
            <div className="mt-5 space-y-3">
              {requests.map((r) => (
                <Link
                  key={r.id}
                  href={`/research/${r.id}`}
                  className="block rounded-lg border border-line bg-surface-2 px-4 py-3 transition-colors hover:bg-surface-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-fg">{r.companyName}</p>
                    <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-fg-2">
                    vs. {r.competitors.map((c) => c.name).join(", ")}
                  </p>
                  <p className="tabular mt-1 text-xs text-fg-3">
                    {new Date(r.createdAt).toLocaleString()}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
