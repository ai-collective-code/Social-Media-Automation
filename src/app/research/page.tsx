import Link from "next/link";
import TopBar from "@/components/TopBar";
import { Card, Badge, Button } from "@/components/ui";
import { listRequests } from "@/lib/research-store";
import { submitResearchRequest } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  pending: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  researching: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  complete: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
};

export default async function ResearchPage() {
  const requests = await listRequests();

  return (
    <>
      <TopBar
        title="Competitor Research"
        subtitle="Enter your company + competitors to kick off real research"
      />

      <div className="grid grid-cols-1 gap-6 p-8 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <p className="mb-4 text-sm font-semibold text-white">New research request</p>
          <form action={submitResearchRequest} className="space-y-4">
            <Field label="Your company name" name="companyName" required placeholder="Acme Inc." />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Domain" name="domain" placeholder="acme.com" />
              <Field label="Industry" name="industry" placeholder="Clean beauty" />
            </div>

            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                Competitors (1–5)
              </p>
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="grid grid-cols-2 gap-3">
                    <Field
                      label={undefined}
                      name={`competitor${i}Name`}
                      placeholder={`Competitor ${i} name${i === 1 ? " *" : ""}`}
                      required={i === 1}
                    />
                    <Field
                      label={undefined}
                      name={`competitor${i}Url`}
                      placeholder="Website (optional)"
                    />
                  </div>
                ))}
              </div>
            </div>

            <Button type="submit" variant="primary" className="w-full">
              Submit for research
            </Button>
            <p className="text-xs text-slate-500">
              This saves the request. Real web research runs when you ask Claude to work on it
              in chat — no automated scraping happens on submit.
            </p>
          </form>
        </Card>

        <Card>
          <p className="mb-4 text-sm font-semibold text-white">Requests ({requests.length})</p>
          {requests.length === 0 ? (
            <p className="text-sm text-slate-500">No research requests yet.</p>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => (
                <Link
                  key={r.id}
                  href={`/research/${r.id}`}
                  className="block rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 hover:bg-white/5"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-white">{r.companyName}</p>
                    <Badge className={STATUS_BADGE[r.status]}>{r.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    vs. {r.competitors.map((c) => c.name).join(", ")}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
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

function Field({
  label,
  name,
  placeholder,
  required,
}: {
  label?: string;
  name: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">{label}</span>}
      <input
        type="text"
        name={name}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
      />
    </label>
  );
}
