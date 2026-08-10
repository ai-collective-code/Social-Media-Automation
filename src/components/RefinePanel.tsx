"use client";

import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Badge, Button, Textarea } from "@/components/ui";
import { REFINE_PRESETS } from "@/lib/art-director-types";
import { refineImage, resetImagePrompt, type RefineState } from "@/app/assets/actions";
import type { PromptOverride } from "@/lib/prompt-override-store";

/**
 * The AI art director attached to one post.
 *
 * Collapsed by default: seven open editors would bury the thing the page is
 * actually for, which is looking at the pictures. Open, it offers one-tap
 * directions for the common asks plus free text for everything else — most
 * refinements are "warmer" or "closer", and making those a click rather than a
 * sentence is what makes iterating feel cheap.
 *
 * Open/close is a native <details> and the textarea is uncontrolled, so the
 * panel is usable before the client bundle hydrates — the same progressive
 * enhancement the rest of this app's forms rely on. The preset chips are the
 * only part that needs JS, and they're an accelerator, not a requirement.
 */
export default function RefinePanel({
  requestId,
  postId,
  override,
  disabled,
}: {
  requestId: string;
  postId: string;
  /** Present once this post has been refined at least once. */
  override?: PromptOverride;
  /** True while an image is already being generated for this post. */
  disabled?: boolean;
}) {
  const instructionRef = useRef<HTMLTextAreaElement>(null);
  const [refineState, refine] = useActionState<RefineState, FormData>(refineImage, null);
  const [resetState, reset] = useActionState<RefineState, FormData>(resetImagePrompt, null);

  const status = refineState ?? resetState;

  function applyPreset(instruction: string) {
    const field = instructionRef.current;
    if (!field) return;
    field.value = instruction;
    field.focus();
  }

  return (
    <div className="mt-2 border-t border-line pt-2">
      {override && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Badge tone="accent">Refined ×{override.revision}</Badge>
          <span className="text-[11px] leading-tight text-fg-3">{override.note}</span>
        </div>
      )}

      <details className="group">
        <summary className="flex w-full cursor-pointer list-none items-center justify-center rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-fg-2 transition-colors hover:border-accent hover:text-fg [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">✨ Refine with AI</span>
          <span className="hidden group-open:inline">✨ Art director — close</span>
        </summary>

        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-1">
            {REFINE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset.instruction)}
                className="rounded-full border border-line px-2 py-0.5 text-[11px] text-fg-2 transition-colors hover:border-accent hover:text-fg"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <form action={refine} className="space-y-2">
            <input type="hidden" name="requestId" value={requestId} />
            <input type="hidden" name="postId" value={postId} />
            <Textarea
              ref={instructionRef}
              name="instruction"
              rows={3}
              className="text-[12px]"
              placeholder="Tell the art director what to change — or tap a preset above. Leave blank to just make it more premium."
            />
            <RefineButton disabled={disabled} />
          </form>

          {override && (
            <form action={reset}>
              <input type="hidden" name="requestId" value={requestId} />
              <input type="hidden" name="postId" value={postId} />
              <ResetButton disabled={disabled} />
            </form>
          )}

          <details className="text-[11px] text-fg-3">
            <summary className="cursor-pointer select-none">
              What the image model is being told
            </summary>
            <p className="mt-1 whitespace-pre-line leading-snug">
              {override?.prompt ??
                "Nothing refined yet — this post uses its original creative brief."}
            </p>
          </details>
        </div>
      </details>

      {status && (
        <p className={`mt-2 text-[11px] leading-snug ${status.ok ? "text-good" : "text-bad"}`}>
          {status.message}
        </p>
      )}
    </div>
  );
}

/* Both buttons live in their own components because `useFormStatus` only
   reports the state of the nearest enclosing <form> — read from the component
   that renders the form, it never leaves `pending: false`. */

function RefineButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      size="sm"
      className="w-full"
      loading={pending}
      disabled={disabled}
    >
      {pending ? "Art directing…" : "Refine & regenerate"}
    </Button>
  );
}

function ResetButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="sm"
      className="w-full"
      loading={pending}
      disabled={disabled}
    >
      {pending ? "Reverting…" : "Revert to original brief"}
    </Button>
  );
}
