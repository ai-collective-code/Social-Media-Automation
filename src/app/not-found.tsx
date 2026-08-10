import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <p className="font-mono text-xs uppercase tracking-[0.09em] text-fg-3">Error 404</p>
        <h1 className="mt-2 text-xl font-semibold text-fg">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-sm text-fg-2">
          The link may be out of date, or the research request it pointed to was removed.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex items-center rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
