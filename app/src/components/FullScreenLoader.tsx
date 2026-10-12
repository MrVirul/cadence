import { Logo } from "@/components/Logo";
import { Skeleton } from "@/components/ui/skeleton";

export default function FullScreenLoader() {
  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-muted/30 md:flex-row"
      role="status"
      aria-label="Loading workspace"
    >
      {/* Mobile top bar skeleton */}
      <div className="flex h-14 items-center justify-between border-b bg-background px-4 md:hidden">
        <Logo />
        <Skeleton className="size-8 rounded-md" />
      </div>

      {/* Desktop sidebar skeleton */}
      <aside className="hidden h-screen w-64 shrink-0 flex-col border-r bg-background md:flex">
        <div className="flex h-16 items-center border-b px-5">
          <Logo />
        </div>
        <div className="space-y-3 p-4">
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-8 w-3/4 rounded-md" />
        </div>
        <div className="mt-auto border-t p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        </div>
      </aside>

      {/* Main content skeleton */}
      <main className="flex-1 p-6 lg:p-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </main>
    </div>
  );
}
