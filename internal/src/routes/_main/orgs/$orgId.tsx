import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Building2,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import {
  useOrgDetail,
  useOrgReinstate,
  useOrgSuspend,
} from "@/api/endpoints/orgs/orgs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getApiErrorMessage, getApiStatus } from "@/lib/api-error";
import { formatDate, formatDateTime, formatRelativeTime } from "@/lib/format";

export const Route = createFileRoute("/_main/orgs/$orgId")({
  component: OrgDetailPage,
});

function roleBadgeVariant(role: string) {
  if (role === "owner") {
    return "default" as const;
  }
  if (role === "admin") {
    return "secondary" as const;
  }
  return "outline" as const;
}

function OrgDetailPage() {
  const { orgId } = Route.useParams();
  const queryClient = useQueryClient();

  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendError, setSuspendError] = useState("");
  const [reinstateOpen, setReinstateOpen] = useState(false);

  const { data: org, isLoading, isError, error, refetch } = useOrgDetail(orgId);

  const handleOpenSuspend = () => {
    setSuspendReason("");
    setSuspendError("");
    setSuspendOpen(true);
  };

  const invalidateOrgData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/orgs"] }),
      queryClient.invalidateQueries({ queryKey: [`/orgs/${orgId}`] }),
      queryClient.invalidateQueries({ queryKey: ["/audit-log"] }),
      refetch(),
    ]);
  };

  const suspendMutation = useOrgSuspend({
    mutation: {
      onSuccess: async () => {
        await invalidateOrgData();
        toast.success("Organization suspended");
        setSuspendOpen(false);
      },
      onError: (err) => {
        const msg = getApiErrorMessage(err, "Failed to suspend organization.");
        setSuspendError(msg);
        toast.error(msg);
      },
    },
  });

  const reinstateMutation = useOrgReinstate({
    mutation: {
      onSuccess: async () => {
        await invalidateOrgData();
        toast.success("Organization reinstated");
        setReinstateOpen(false);
      },
      onError: (err) => {
        toast.error(
          getApiErrorMessage(err, "Failed to reinstate organization.")
        );
      },
    },
  });

  const trimmedReason = suspendReason.trim();
  const isReasonValid =
    trimmedReason.length >= 3 && trimmedReason.length <= 500;

  const handleSuspendSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReasonValid) {
      setSuspendError("Reason must be between 3 and 500 characters.");
      return;
    }
    setSuspendError("");
    suspendMutation.mutate({
      orgId,
      data: { reason: trimmedReason },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-40" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-9 w-44" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !org) {
    const isNotFound = getApiStatus(error) === 404;
    return (
      <div className="space-y-4">
        <Link
          to="/orgs"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to organizations
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>
              {isNotFound
                ? "Organization not found"
                : "Could not load organization"}
            </CardTitle>
            <CardDescription>
              {getApiErrorMessage(
                error,
                "The requested organization could not be loaded."
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const exactLastActive = org.last_active_at
    ? formatDateTime(org.last_active_at)
    : null;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div>
          <Link
            to="/orgs"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to organizations
          </Link>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <Building2 className="size-6 text-muted-foreground" />
              <h1 className="text-2xl font-semibold tracking-tight">
                {org.name}
              </h1>
              {org.is_suspended ? (
                <Badge variant="destructive">Suspended</Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                >
                  Active
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>
                Slug: <code className="font-mono text-xs">{org.slug}</code>
              </span>
              <span>Created {formatDate(org.created_at)}</span>
              <span>
                Last active:{" "}
                {exactLastActive ? (
                  <Tooltip>
                    <TooltipTrigger
                      title={exactLastActive}
                      className="cursor-default border-b border-dotted border-muted-foreground/50"
                    >
                      {formatRelativeTime(org.last_active_at)}
                    </TooltipTrigger>
                    <TooltipContent>{exactLastActive}</TooltipContent>
                  </Tooltip>
                ) : (
                  "Never"
                )}
              </span>
            </div>
          </div>

          <div className="shrink-0">
            {org.is_suspended ? (
              <Button
                variant="default"
                onClick={() => setReinstateOpen(true)}
                disabled={reinstateMutation.isPending}
              >
                <CheckCircle2 className="size-4" />
                Reinstate
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={handleOpenSuspend}
                disabled={suspendMutation.isPending}
              >
                <Ban className="size-4" />
                Suspend organization
              </Button>
            )}
          </div>
        </div>

        {org.is_suspended && (
          <div
            role="status"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div className="space-y-1">
                <p className="font-semibold text-destructive">
                  Organization suspended
                  {org.suspended_at
                    ? ` on ${formatDateTime(org.suspended_at)}`
                    : ""}
                </p>
                <p className="text-foreground">
                  <span className="font-medium">Reason:</span>{" "}
                  {org.suspended_reason || "No reason recorded"}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Members</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {org.member_count.toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Teams</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {org.team_count.toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Plans</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {org.plan_count.toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="flex items-center gap-2.5 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Lock className="size-4 shrink-0 text-muted-foreground" />
          <p>
            Staff can see counts and members only. Plan and task content is
            private to the customer.
          </p>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Members ({org.members.length})
          </h2>
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {org.members.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        No members in this organization.
                      </TableCell>
                    </TableRow>
                  ) : (
                    org.members.map((member) => (
                      <TableRow key={member.email}>
                        <TableCell className="font-medium">
                          {member.name || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {member.email}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={roleBadgeVariant(member.role)}
                            className="capitalize"
                          >
                            {member.role}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Suspend dialog */}
        <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Suspend {org.name}</DialogTitle>
              <DialogDescription>
                All members will be locked out until you reinstate it.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSuspendSubmit} className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="suspend-reason">Reason for suspension</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {trimmedReason.length}/500
                  </span>
                </div>
                <Textarea
                  id="suspend-reason"
                  value={suspendReason}
                  onChange={(e) => {
                    setSuspendReason(e.target.value);
                    if (suspendError) {
                      setSuspendError("");
                    }
                  }}
                  placeholder="Describe why this organization is being suspended (3–500 characters)..."
                  rows={3}
                  maxLength={500}
                  required
                />
                {suspendError && (
                  <p role="alert" className="text-xs text-destructive">
                    {suspendError}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={suspendMutation.isPending}
                  onClick={() => setSuspendOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={suspendMutation.isPending || !isReasonValid}
                >
                  {suspendMutation.isPending
                    ? "Suspending..."
                    : "Suspend organization"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Reinstate confirm dialog */}
        <AlertDialog open={reinstateOpen} onOpenChange={setReinstateOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reinstate {org.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Reinstating this organization immediately restores access for
                all of its members.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={reinstateMutation.isPending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={reinstateMutation.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  reinstateMutation.mutate({ orgId });
                }}
              >
                {reinstateMutation.isPending ? "Reinstating..." : "Reinstate"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
