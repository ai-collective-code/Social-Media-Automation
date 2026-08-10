import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-line px-4 py-4 sm:px-6 lg:px-8">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="mt-2 h-3.5 w-64" />
      </div>
      <div className="grid gap-4 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-line bg-canvas-raised p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-7 w-16" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-line bg-canvas-raised p-5">
          <Skeleton className="h-4 w-32" />
          <div className="mt-4 grid gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
