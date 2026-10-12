import {
  Link,
  Outlet,
  createFileRoute,
  useLocation,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  Check,
  ChevronsUpDown,
  History,
  LogOut,
  Menu,
  Plus,
} from "lucide-react";
import { logout } from "@/api/endpoints/auth/auth";
import { useGetOrg } from "@/api/endpoints/orgs/orgs";
import { AuthGuard } from "@/components/AuthGuard";
import { NoAccess } from "@/components/guards/NoAccess";
import { PageQueryGate } from "@/components/guards/PageQueryGate";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { currentWeekStartUtc } from "@/lib/week";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useUser } from "@/contexts/user-context";
import { setLastUsedOrgId } from "@/lib/routes";

export const Route = createFileRoute("/$orgId")({
  component: OrgLayoutRoute,
});

function OrgLayoutRoute() {
  return (
    <AuthGuard>
      <OrgLayoutInner />
    </AuthGuard>
  );
}

function OrgLayoutInner() {
  const { orgId } = Route.useParams();
  const { memberships } = useUser();

  const currentMembership = memberships.find((m) => m.org.id === orgId);
  const isMember = Boolean(currentMembership);

  const orgQuery = useGetOrg(orgId, {
    query: {
      enabled: isMember,
      retry: false,
    },
  });

  useEffect(() => {
    if (isMember && orgQuery.data) {
      setLastUsedOrgId(orgId);
    }
  }, [isMember, orgQuery.data, orgId]);

  // Shortcut: if orgId is not in the user's memberships from /app/me,
  // show NoAccess immediately without calling org APIs.
  if (!isMember) {
    return <NoAccess />;
  }

  return (
    <PageQueryGate error={orgQuery.error} orgId={orgId}>
      <OrgWorkspaceChrome
        orgId={orgId}
        orgName={orgQuery.data?.name}
        isOrgLoading={orgQuery.isLoading}
      />
    </PageQueryGate>
  );
}

interface OrgWorkspaceChromeProps {
  orgId: string;
  orgName: string | undefined;
  isOrgLoading: boolean;
}

function OrgWorkspaceChrome({
  orgId,
  orgName,
  isOrgLoading,
}: OrgWorkspaceChromeProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-muted/30 md:flex-row">
      {/* Mobile top bar (works down to 360px) */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4 md:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/$orgId" params={{ orgId }} aria-label="Cadence">
            <Logo withWordmark={false} />
          </Link>
          {isOrgLoading ? (
            <Skeleton className="h-5 w-28" />
          ) : (
            <span className="truncate text-sm font-semibold text-foreground">
              {orgName}
            </span>
          )}
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
              <SheetTitle>Workspace navigation</SheetTitle>
            </SheetHeader>
            <SidebarContent
              orgId={orgId}
              orgName={orgName}
              isOrgLoading={isOrgLoading}
              onActionComplete={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden h-screen w-64 shrink-0 flex-col border-r bg-background md:flex">
        <SidebarContent
          orgId={orgId}
          orgName={orgName}
          isOrgLoading={isOrgLoading}
        />
      </aside>

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

interface SidebarContentProps {
  orgId: string;
  orgName: string | undefined;
  isOrgLoading: boolean;
  onActionComplete?: () => void;
}

function SidebarContent({
  orgId,
  orgName,
  isOrgLoading,
  onActionComplete,
}: SidebarContentProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, memberships } = useUser();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await logout();
    },
    onSettled: () => {
      queryClient.clear();
      onActionComplete?.();
      router.navigate({ to: "/login" });
    },
  });

  const handleSelectOrg = (targetOrgId: string) => {
    setLastUsedOrgId(targetOrgId);
    onActionComplete?.();
    router.navigate({ href: `/${targetOrgId}` });
  };

  const handleCreateOrg = () => {
    onActionComplete?.();
    router.navigate({ to: "/onboarding" });
  };

  const fullName = user
    ? `${user.first_name} ${user.last_name}`.trim() || user.email
    : "";
  const initials = user
    ? `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase() ||
      user.email.charAt(0).toUpperCase()
    : "";

  const location = useLocation();
  const thisMonday = currentWeekStartUtc();
  const isMyWeekActive =
    location.pathname === `/${orgId}` ||
    location.pathname.startsWith(`/${orgId}/week/`);
  const isHistoryActive = location.pathname.startsWith(`/${orgId}/history`);

  const hasMultipleOrgs = memberships.length > 1;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b px-5">
        <Link
          to="/$orgId"
          params={{ orgId }}
          aria-label="Cadence"
          onClick={() => onActionComplete?.()}
        >
          <Logo />
        </Link>
      </div>

      {/* Organization section */}
      <div className="border-b p-3">
        {isOrgLoading ? (
          <Skeleton className="h-10 w-full rounded-lg" />
        ) : hasMultipleOrgs ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  className="h-10 w-full justify-between px-3 font-medium"
                  aria-label="Switch organization"
                />
              }
            >
              <span className="flex min-w-0 items-center gap-2">
                <Building2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{orgName}</span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Organizations</DropdownMenuLabel>
                {memberships.map((m) => (
                  <DropdownMenuItem
                    key={m.org.id}
                    onClick={() => handleSelectOrg(m.org.id)}
                    className="cursor-pointer justify-between"
                  >
                    <span className="truncate">{m.org.name}</span>
                    {m.org.id === orgId && (
                      <Check className="size-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleCreateOrg}
                className="cursor-pointer"
              >
                <Plus className="size-4" />
                Create organization
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5">
              <Building2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm font-semibold text-foreground">
                {orgName}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs text-muted-foreground hover:text-foreground"
              onClick={handleCreateOrg}
            >
              <Plus className="size-3.5" />
              Create organization
            </Button>
          </div>
        )}
      </div>

      {/* Main nav area */}
      <nav aria-label="Main navigation" className="flex-1 space-y-1 p-3">
        <Link
          to="/$orgId/week/$weekStart"
          params={{ orgId, weekStart: thisMonday }}
          onClick={() => onActionComplete?.()}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isMyWeekActive
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <CalendarDays className="size-4 shrink-0" />
          <span>My week</span>
        </Link>
        <Link
          to="/$orgId/history"
          params={{ orgId }}
          onClick={() => onActionComplete?.()}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isHistoryActive
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <History className="size-4 shrink-0" />
          <span>History</span>
        </Link>
      </nav>

      {/* User profile and Log out */}
      <div className="border-t p-3">
        {user && (
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {fullName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          className="mt-1 w-full justify-start text-muted-foreground hover:text-foreground"
          disabled={logoutMutation.isPending}
          onClick={() => logoutMutation.mutate()}
        >
          <LogOut className="size-4" />
          {logoutMutation.isPending ? "Signing out..." : "Log out"}
        </Button>
      </div>
    </div>
  );
}
