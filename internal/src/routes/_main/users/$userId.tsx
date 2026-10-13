import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  Building2,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  useUserDeactivate,
  useUserDetail,
  useUserReactivate,
} from "@/api/endpoints/users/users";
import { useCurrentUser } from "@/contexts/user-context";
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
import { Avatar } from "@/components/Avatar";
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
import { getApiErrorMessage, getApiStatus } from "@/lib/api-error";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_main/users/$userId")({
  component: UserDetailPage,
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

function UserDetailPage() {
  const { userId } = Route.useParams();
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();

  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deactivateReason, setDeactivateReason] = useState("");
  const [deactivateError, setDeactivateError] = useState("");
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [actionError, setActionError] = useState("");

  const {
    data: user,
    isLoading,
    isError,
    error,
    refetch,
  } = useUserDetail(userId);

  const handleOpenDeactivate = () => {
    setDeactivateReason("");
    setDeactivateError("");
    setDeactivateOpen(true);
  };

  const invalidateUserData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/users"] }),
      queryClient.invalidateQueries({ queryKey: [`/users/${userId}`] }),
      queryClient.invalidateQueries({ queryKey: ["/audit-log"] }),
      refetch(),
    ]);
  };

  const deactivateMutation = useUserDeactivate({
    mutation: {
      onSuccess: async () => {
        setActionError("");
        await invalidateUserData();
        toast.success("User deactivated");
        setDeactivateOpen(false);
      },
      onError: (err) => {
        const msg =
          getApiStatus(err) === 403
            ? getApiErrorMessage(
                err,
                "Staff accounts and your own account cannot be deactivated."
              )
            : getApiErrorMessage(err, "Failed to deactivate user.");
        setDeactivateError(msg);
        setActionError(msg);
        toast.error(msg);
      },
    },
  });

  const reactivateMutation = useUserReactivate({
    mutation: {
      onSuccess: async () => {
        setActionError("");
        await invalidateUserData();
        toast.success("User reactivated");
        setReactivateOpen(false);
      },
      onError: (err) => {
        const msg = getApiErrorMessage(err, "Failed to reactivate user.");
        setActionError(msg);
        toast.error(msg);
      },
    },
  });

  const trimmedReason = deactivateReason.trim();
  const isReasonValid =
    trimmedReason.length >= 3 && trimmedReason.length <= 500;

  const handleDeactivateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReasonValid) {
      setDeactivateError("Reason must be between 3 and 500 characters.");
      return;
    }
    setDeactivateError("");
    deactivateMutation.mutate({
      userId,
      data: { reason: trimmedReason },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-32" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-36" />
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !user) {
    const isNotFound = getApiStatus(error) === 404;
    return (
      <div className="space-y-4">
        <Link
          to="/users"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to users
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>
              {isNotFound ? "User not found" : "Could not load user"}
            </CardTitle>
            <CardDescription>
              {getApiErrorMessage(
                error,
                "The requested user could not be loaded."
              )}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const displayName =
    user.name || `${user.first_name} ${user.last_name}`.trim() || "—";
  const isSelf = currentUser?.id === user.id;
  const isStaffUser = user.is_admin;
  const canDeactivate = user.is_active && !isSelf && !isStaffUser;
  const orgs = user.orgs ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/users"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to users
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <Avatar seed={user.id} name={displayName} size={36} />
            <h1 className="text-2xl font-semibold tracking-tight">
              {displayName}
            </h1>
            {user.is_active ? (
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              >
                Active
              </Badge>
            ) : (
              <Badge variant="destructive">Deactivated</Badge>
            )}
            {isStaffUser && (
              <Badge
                variant="outline"
                className="border-amber-500/30 bg-amber-500/10 text-[#B45309] dark:text-amber-400"
              >
                <ShieldCheck className="size-3" />
                Staff
              </Badge>
            )}
            {isSelf && (
              <span className="text-xs text-muted-foreground">(you)</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{user.email}</span>
            <span>Joined {formatDate(user.created_at)}</span>
          </div>
        </div>

        <div className="shrink-0">
          {!user.is_active ? (
            <Button
              variant="default"
              onClick={() => setReactivateOpen(true)}
              disabled={reactivateMutation.isPending}
            >
              <CheckCircle2 className="size-4" />
              Reactivate
            </Button>
          ) : canDeactivate ? (
            <Button
              variant="destructive"
              onClick={handleOpenDeactivate}
              disabled={deactivateMutation.isPending}
            >
              <Ban className="size-4" />
              Deactivate
            </Button>
          ) : (
            <p className="rounded-md border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
              {isSelf
                ? "You cannot deactivate your own account."
                : "Staff accounts cannot be deactivated here."}
            </p>
          )}
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {actionError}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Full name</CardDescription>
            <CardTitle className="text-base">{displayName}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Email</CardDescription>
            <CardTitle className="truncate text-base" title={user.email}>
              {user.email}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Status</CardDescription>
            <CardTitle className="text-base">
              {user.is_active ? "Active" : "Deactivated"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Organizations ({orgs.length})
        </h2>
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      This user does not belong to any organizations.
                    </TableCell>
                  </TableRow>
                ) : (
                  orgs.map((org) => (
                    <TableRow key={org.id}>
                      <TableCell className="font-medium">
                        <Link
                          to="/orgs/$orgId"
                          params={{ orgId: org.id }}
                          className="inline-flex items-center gap-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                        >
                          <Building2 className="size-4 text-muted-foreground" />
                          {org.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={roleBadgeVariant(org.role)}
                          className="capitalize"
                        >
                          {org.role}
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

      {/* Deactivate dialog */}
      <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate {displayName}</DialogTitle>
            <DialogDescription>
              This user ({user.email}) will be signed out immediately and
              blocked from signing in until reactivated.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDeactivateSubmit} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="deactivate-reason">
                  Reason for deactivation
                </Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {trimmedReason.length}/500
                </span>
              </div>
              <Textarea
                id="deactivate-reason"
                value={deactivateReason}
                onChange={(e) => {
                  setDeactivateReason(e.target.value);
                  if (deactivateError) {
                    setDeactivateError("");
                  }
                }}
                placeholder="Describe why this user account is being deactivated (3–500 characters)..."
                rows={3}
                maxLength={500}
                required
              />
              {deactivateError && (
                <p role="alert" className="text-xs text-destructive">
                  {deactivateError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={deactivateMutation.isPending}
                onClick={() => setDeactivateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={deactivateMutation.isPending || !isReasonValid}
              >
                {deactivateMutation.isPending
                  ? "Deactivating..."
                  : "Deactivate"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reactivate confirm dialog */}
      <AlertDialog open={reactivateOpen} onOpenChange={setReactivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reactivate {displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Reactivating this account allows {user.email} to sign in and
              access their organizations again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reactivateMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={reactivateMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                reactivateMutation.mutate({ userId });
              }}
            >
              {reactivateMutation.isPending ? "Reactivating..." : "Reactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
