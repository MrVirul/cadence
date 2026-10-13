import { InternalBanner } from "@/components/InternalBanner";
import { Logo } from "@/components/Logo";
import { Skeleton } from "@/components/ui/skeleton";

export default function FullScreenLoader() {
  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-muted/30"
      role="status"
      aria-label="Loading staff console"
    >
      <InternalBanner />
      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        <div className="flex h-14 items-center justify-between border-b bg-background px-4 md:hidden">
          <Logo />
          <Skeleton className="size-8 rounded-md" />
        </div>
        <aside className="hidden w-64 shrink-0 flex-col border-r bg-background md:flex">
          <div className="flex h-16 items-center border-b px-5">
            <Logo />
          </div>
          <div className="space-y-2 p-4">
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </aside>
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </main>
      </div>
    </div>
  );
}
