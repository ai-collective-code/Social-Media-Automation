"use client";

import { useActionState } from "react";
import Link from "next/link";
import { saveBrand, type BrandFormState } from "./actions";
import { PLATFORM_OPTIONS, type Brand } from "@/lib/brand-types";
import { Button, Card, Field, Input, Textarea, Label, Callout } from "@/components/ui";

const EMPTY: BrandFormState = {};

export default function BrandForm({ brand }: { brand?: Brand }) {
  const [state, formAction, pending] = useActionState(saveBrand, EMPTY);
  const err = state.fieldErrors ?? {};

  // On a validation round-trip the server echoes back what was typed, so the
  // form doesn't clear itself and lose the user's work.
  const v = (key: keyof Brand, fallback = "") =>
    state.values?.[key as string] ?? (brand?.[key] as string | undefined) ?? fallback;

  const platformChecked = (p: string) => {
    if (state.values?.platforms !== undefined) {
      return state.values.platforms.split(",").filter(Boolean).includes(p);
    }
    return brand?.platforms?.includes(p) ?? false;
  };

  return (
    <form action={formAction} className="grid gap-5">
      {brand && <input type="hidden" name="brandId" value={brand.id} />}

      {state.error && <Callout tone="bad">{state.error}</Callout>}

      <Card>
        <Label>Identity</Label>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field
            label="Brand name"
            htmlFor="name"
            error={err.name}
            hint={err.name ? undefined : "The name as it appears publicly"}
            className="sm:col-span-2"
          >
            <Input
              id="name"
              name="name"
              defaultValue={v("name")}
              invalid={!!err.name}
              placeholder="Aurora Skincare"
              autoComplete="off"
            />
          </Field>

          <Field
            label="Industry"
            htmlFor="industry"
            error={err.industry}
            hint={err.industry ? undefined : "Used to target competitor discovery"}
          >
            <Input
              id="industry"
              name="industry"
              defaultValue={v("industry")}
              invalid={!!err.industry}
              placeholder="Clean beauty / skincare"
              autoComplete="off"
            />
          </Field>

          <Field label="Website" htmlFor="domain" hint="Optional">
            <Input
              id="domain"
              name="domain"
              defaultValue={v("domain")}
              placeholder="auroraskincare.com"
              autoComplete="off"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <Label>Positioning</Label>
        <p className="mt-1.5 text-xs text-fg-3">
          Everything here is fed into competitor discovery and every generation prompt. The more
          specific it is, the less generic the output.
        </p>
        <div className="mt-4 grid gap-4">
          <Field label="What the brand does" htmlFor="description" hint="Two or three sentences">
            <Textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={v("description")}
              placeholder="Refillable skincare made from cold-pressed botanicals, sold direct with a subscription refill model."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Who it's for" htmlFor="audience" hint="Optional">
              <Input
                id="audience"
                name="audience"
                defaultValue={v("audience")}
                placeholder="Women 25–40, sustainability-minded"
                autoComplete="off"
              />
            </Field>

            <Field label="Markets" htmlFor="markets" hint="Drives regional research and post times">
              <Input
                id="markets"
                name="markets"
                defaultValue={v("markets")}
                placeholder="India, UAE"
                autoComplete="off"
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <Label>Voice and guardrails</Label>
        <div className="mt-3 grid gap-4">
          <Field label="How it should sound" htmlFor="voice" hint="Optional">
            <Input
              id="voice"
              name="voice"
              defaultValue={v("voice")}
              placeholder="Warm, plain-spoken, never clinical"
              autoComplete="off"
            />
          </Field>

          <Field
            label="Never say"
            htmlFor="neverSay"
            hint="Claims, words or topics to avoid — applied to every caption and brief"
          >
            <Textarea
              id="neverSay"
              name="neverSay"
              rows={2}
              defaultValue={v("neverSay")}
              placeholder="No medical or cure claims. Never say 'chemical-free'. No competitor names."
            />
          </Field>

          <Field
            label="Never show"
            htmlFor="avoidVisuals"
            hint="Visual bans — applied to every generated image and reel frame"
          >
            <Textarea
              id="avoidVisuals"
              name="avoidVisuals"
              rows={2}
              defaultValue={v("avoidVisuals")}
              placeholder="No studio lighting. No stock-photo smiles. Never show the product without a rider."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Content language"
              htmlFor="language"
              hint="Captions, hooks and on-screen text. Defaults to English."
            >
              <Input
                id="language"
                name="language"
                defaultValue={v("language")}
                placeholder="Hindi"
                autoComplete="off"
              />
            </Field>

            <Field
              label="Image seed"
              htmlFor="imageSeed"
              hint="Pin a number to lock this brand's look. Leave blank to vary."
            >
              <Input
                id="imageSeed"
                name="imageSeed"
                type="number"
                min={0}
                defaultValue={v("imageSeed")}
                placeholder="e.g. 20250815"
                autoComplete="off"
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <Label>Platforms</Label>
        <p className="mt-1.5 text-xs text-fg-3">Which channels this brand posts on.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PLATFORM_OPTIONS.map((p) => (
            <label
              key={p}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg-2 transition-colors hover:bg-surface-3 has-[:checked]:border-accent-border has-[:checked]:bg-accent-soft has-[:checked]:text-accent"
            >
              <input
                type="checkbox"
                name={`platform:${p}`}
                defaultChecked={platformChecked(p)}
                className="h-3.5 w-3.5 accent-current"
              />
              {p}
            </label>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={pending}>
          {brand ? "Save changes" : "Create brand"}
        </Button>
        <Link
          href={brand ? `/brands/${brand.id}` : "/brands"}
          className="rounded-lg px-3.5 py-2 text-sm font-medium text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
