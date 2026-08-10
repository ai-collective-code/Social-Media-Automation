"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

/**
 * Needs its own component: `useFormStatus` only sees the pending state of the
 * form it's nested inside, so this can't just be inline in the page (a Server
 * Component can't use hooks at all).
 */
export default function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" className="w-full" loading={pending}>
      {pending ? "Finding competitors…" : "Submit for research"}
    </Button>
  );
}
