"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Button, Card, Callout, Field, Input, Label } from "@/components/ui";
import { generateFields, type GenerateState } from "./actions";

const IDLE: GenerateState = { status: "idle" };

/** Must match the same literal in BrandForm.tsx — see the comment there. */
const DRAFT_STORAGE_KEY = "brandDraft:v1";

/** Order matches the brand form top to bottom, so copying feels like reading down one form into another. */
const FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: "industry", label: "Industry" },
  { key: "domain", label: "Website" },
  { key: "description", label: "What the brand does" },
  { key: "audience", label: "Who this is for" },
  { key: "markets", label: "Markets" },
  { key: "voice", label: "How it should sound" },
  { key: "neverSay", label: "Never say" },
  { key: "avoidVisuals", label: "Never show" },
  { key: "language", label: "Content language" },
  { key: "platforms", label: "Platforms", hint: "Tick these on the form — nothing to paste" },
];

export default function BrandGeneratorClient() {
  const [state, formAction] = useActionState<GenerateState, FormData>(generateFields, IDLE);
  const router = useRouter();

  function autofillForm() {
    if (state.status !== "done") return;
    // Stashed, not sent — the New Brand form reads and clears this itself on
    // mount, so it works with a plain client navigation rather than a
    // server round-trip, and nothing here has written a brand record.
    sessionStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ name: state.companyName, ...state.draft }),
    );
    router.push("/brands/new");
  }

  return (
    <div className="grid gap-5">
      <Card>
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <Field label="Company name" htmlFor="companyName" className="min-w-[240px] flex-1">
            <Input
              id="companyName"
              name="companyName"
              defaultValue={state.status === "done" ? state.companyName : ""}
              placeholder="Royal Enfield"
              autoComplete="off"
              required
            />
          </Field>
          <GenerateButton />
        </form>
        <p className="mt-2.5 text-xs text-fg-3">
          A real, findable company gets real facts where available. A new or made-up name gets
          a specific, consistent draft rather than a generic one — either way, check every field
          before you use it.
        </p>
      </Card>

      {state.status === "error" && <Callout tone="bad">{state.message}</Callout>}

      {state.status === "done" && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <Label>Draft for {state.companyName}</Label>
            <Button type="button" size="sm" onClick={autofillForm}>
              Autofill the New Brand form →
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-fg-3">
            Fills every field on the New Brand form for you to review and edit before saving —
            nothing is saved from here. Copy a single field below instead if you only want to
            drop one value into an existing brand.
          </p>
          <div className="mt-3 grid gap-3">
            {FIELDS.map((f) => (
              <FieldRow
                key={f.key}
                label={f.label}
                hint={f.hint}
                value={
                  f.key === "platforms"
                    ? state.draft.platforms.join(", ")
                    : (state.draft as unknown as Record<string, string>)[f.key]
                }
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function GenerateButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      {pending ? "Drafting…" : "Generate"}
    </Button>
  );
}

function FieldRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  const empty = value.trim().length === 0;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied or unavailable — the text is still
      // selectable on the page, so nothing is actually lost.
    }
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface-2 px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-fg-2">{label}</p>
        {empty ? (
          <p className="mt-0.5 text-sm italic text-fg-3">
            {hint ?? "Left blank — didn't apply or wasn't determinable."}
          </p>
        ) : (
          <p className="mt-0.5 whitespace-pre-line text-sm text-fg">{value}</p>
        )}
      </div>
      {!empty && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={copy}
          className="shrink-0"
        >
          {copied ? "Copied ✓" : "Copy"}
        </Button>
      )}
    </div>
  );
}
