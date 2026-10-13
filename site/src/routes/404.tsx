import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { SITE_URL } from "@/lib/config";

export const Route = createFileRoute("/404")({
  head: () => ({
    meta: [
      { title: "Page not found — Cadence" },
      { name: "description", content: "This page does not exist." },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/404` }],
  }),
  component: NotFoundPage,
});

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground px-4">
      <div className="mb-10 flex justify-center">
        <a href="/" aria-label="Cadence home">
          <Logo />
        </a>
      </div>

      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-muted">
          <Compass
            className="size-8 text-muted-foreground"
            aria-hidden="true"
          />
        </div>

        {/* One H1 per page */}
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          404
        </h1>
        <p className="mt-3 text-lg font-medium text-foreground">
          Page not found
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          This page does not exist or has been moved. Check the URL or go back
          to the Cadence home page.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <a
            href="/"
            className={`${buttonVariants({ variant: "default" })} cursor-pointer`}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to Cadence
          </a>
        </div>
      </div>
    </div>
  );
}
