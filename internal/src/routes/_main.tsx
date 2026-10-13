import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Menu } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { InternalBanner } from "@/components/InternalBanner";
import { Logo } from "@/components/Logo";
import { Sidebar, SidebarContent } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/_main")({ component: MainLayout });

function MainLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <AuthGuard>
      <div className="flex h-screen flex-col overflow-hidden bg-muted/30">
        <InternalBanner />

        {/* Mobile header bar for 360px+ screens */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4 md:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link to="/orgs" aria-label="Cadence Internal home">
              <Logo />
            </Link>
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-[#B45309] uppercase dark:text-amber-400">
              Staff
            </span>
          </div>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open navigation menu"
                />
              }
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Staff console navigation</SheetTitle>
              </SheetHeader>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
