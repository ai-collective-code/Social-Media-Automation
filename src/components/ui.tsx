import type { ReactNode } from "react";

/* ---------------------------------------------------------------------------
   Primitives

   Every colour here resolves through a semantic token from globals.css, so all
   of these work unchanged in light and dark. Status hues (good / warn / run /
   bad) are kept separate from `accent` so "approved" never reads as "branded".
--------------------------------------------------------------------------- */

export type Tone = "neutral" | "accent" | "good" | "warn" | "run" | "bad";

const TONE_SOFT: Record<Tone, string> = {
  neutral: "border-line bg-surface-2 text-fg-2",
  accent: "border-accent-border bg-accent-soft text-accent",
  good: "border-good-border bg-good-soft text-good",
  warn: "border-warn-border bg-warn-soft text-warn",
  run: "border-run-border bg-run-soft text-run",
  bad: "border-bad-border bg-bad-soft text-bad",
};

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-fg-3",
  accent: "text-accent",
  good: "text-good",
  warn: "text-warn",
  run: "text-run",
  bad: "text-bad",
};

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* --------------------------------- layout -------------------------------- */

export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-xl border border-line bg-canvas-raised",
        padded && "p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  title,
  subtitle,
  action,
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-fg-3">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "font-mono text-[10px] uppercase tracking-[0.09em] text-fg-3",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* --------------------------------- badges -------------------------------- */

export function Badge({
  children,
  tone,
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  // When no explicit className is supplied the tone drives the colours; call
  // sites that already pass their own colour classes keep working untouched.
  const base = tone ? TONE_SOFT[tone] : className ? "" : TONE_SOFT.neutral;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        base,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral", pulse = false }: { tone?: Tone; pulse?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current",
        TONE_TEXT[tone],
        pulse && "animate-pulse",
      )}
    />
  );
}

/* -------------------------------- buttons -------------------------------- */

const BUTTON_VARIANTS: Record<string, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "border border-line bg-surface-2 text-fg hover:bg-surface-3",
  danger: "bg-bad text-fg-inverse hover:opacity-90",
  warning: "border border-warn-border bg-warn-soft text-warn hover:opacity-90",
  ghost: "text-fg-2 hover:bg-surface-2 hover:text-fg",
};

const BUTTON_SIZES: Record<string, string> = {
  sm: "px-2.5 py-1.5 text-xs gap-1.5",
  md: "px-3.5 py-2 text-sm gap-2",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  ...props
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "warning" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {loading && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2.5} opacity={0.25} />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

/* --------------------------------- forms --------------------------------- */

const FIELD_BASE =
  "w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-3 transition-colors focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className = "",
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-fg-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="flex items-start gap-1 text-xs text-bad" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-fg-3">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({
  className = "",
  invalid,
  ...props
}: { invalid?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cx(FIELD_BASE, invalid && "border-bad", className)}
      {...props}
    />
  );
}

// ComponentPropsWithRef rather than TextareaHTMLAttributes: React 19 passes
// `ref` as an ordinary prop, so spreading it below forwards it to the DOM node
// with no forwardRef wrapper — the type just has to admit it exists.
export function Textarea({
  className = "",
  invalid,
  ...props
}: { invalid?: boolean } & React.ComponentPropsWithRef<"textarea">) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cx(FIELD_BASE, "resize-y", invalid && "border-bad", className)}
      {...props}
    />
  );
}

export function Select({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(FIELD_BASE, "appearance-none pr-8", className)} {...props}>
      {children}
    </select>
  );
}

/* --------------------------------- tables -------------------------------- */

export function TableWrap({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("overflow-x-auto rounded-xl border border-line", className)}>
      {children}
    </div>
  );
}

export function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <table className={cx("w-full border-collapse text-sm", className)}>{children}</table>;
}

export function Th({
  children,
  className = "",
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <th
      className={cx(
        "whitespace-nowrap border-b border-line bg-surface-2 px-3.5 py-2.5 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-fg-3",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = "",
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <td
      className={cx("border-b border-line px-3.5 py-2.5 align-top text-fg-2", className)}
      {...props}
    >
      {children}
    </td>
  );
}

/* -------------------------------- feedback ------------------------------- */

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div className={cx("animate-pulse rounded bg-surface-3", className)} aria-hidden />;
}

export function ProgressBar({
  value,
  tone = "accent",
  indeterminate = false,
  className = "",
  label,
}: {
  value?: number;
  tone?: Tone;
  indeterminate?: boolean;
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  const fill: Record<Tone, string> = {
    neutral: "bg-fg-3",
    accent: "bg-accent",
    good: "bg-good",
    warn: "bg-warn",
    run: "bg-run",
    bad: "bg-bad",
  };
  return (
    <div
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cx("relative h-1.5 overflow-hidden rounded-full bg-surface-3", className)}
    >
      {indeterminate ? (
        <div className={cx("animate-indeterminate absolute inset-y-0 w-1/3 rounded-full", fill[tone])} />
      ) : (
        <div
          className={cx("h-full rounded-full transition-[width] duration-500", fill[tone])}
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
  icon,
  className = "",
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong px-6 py-12 text-center",
        className,
      )}
    >
      {icon && <div className="mb-3 text-fg-3">{icon}</div>}
      <p className="text-sm font-medium text-fg">{title}</p>
      {children && <div className="mt-1.5 max-w-md text-sm text-fg-3">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="rounded-xl border border-line bg-canvas-raised p-4">
      <Label>{label}</Label>
      <p className={cx("tabular mt-1.5 text-2xl font-semibold leading-none", TONE_TEXT[tone] === "text-fg-3" ? "text-fg" : TONE_TEXT[tone])}>
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs text-fg-3">{hint}</p>}
    </div>
  );
}

export function Callout({
  tone = "neutral",
  title,
  children,
  className = "",
}: {
  tone?: Tone;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("rounded-xl border p-4 text-sm", TONE_SOFT[tone], className)}>
      {title && <p className="mb-1 font-semibold">{title}</p>}
      <div className={tone === "neutral" ? "text-fg-2" : undefined}>{children}</div>
    </div>
  );
}
