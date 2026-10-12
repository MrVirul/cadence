import { useRouter } from "@tanstack/react-router";
import { Compass, ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

export function NotFound() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4 sm:p-6">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-xl border bg-background p-6 shadow-sm">
          <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Compass className="size-5" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">
            Page not found
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The page you are looking for doesn&apos;t exist or has been moved.
          </p>
          <div className="mt-6">
            <Button
              className="h-10 w-full"
              onClick={() => router.navigate({ to: "/" })}
            >
              <ArrowLeft className="size-4" />
              Go home
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
