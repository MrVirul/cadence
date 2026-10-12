import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "@/components/AuthGuard";
import { Sidebar } from "@/components/dashboard/sidebar";

// Pathless layout route: every route file under `src/routes/_main/` renders
// inside this chrome and behind the auth guard, without `_main` appearing in
// the URL. Public pages (e.g. /login) live outside it.
export const Route = createFileRoute("/_main")({ component: MainLayout });

function MainLayout() {
  return (
    <AuthGuard>
      <div className="flex h-screen flex-col overflow-hidden bg-muted/30">
        {/* Permanent amber top bar distinct from customer app */}
        <div className="flex h-7 w-full shrink-0 items-center justify-between border-b border-amber-600/30 bg-[#B45309] px-4 text-xs font-semibold tracking-wider text-amber-50 uppercase select-none">
          <span>CADENCE INTERNAL — staff only</span>
          <span className="font-mono text-[10px] tracking-normal opacity-90">
            Confidential · Platform admin
          </span>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
