import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ClipboardList } from "lucide-react";
import { useAuditLogList } from "@/api/endpoints/audit/audit";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  formatDateTime,
  formatHumanStaffAction,
  formatRelativeTime,
} from "@/lib/format";

const PAGE_SIZE = 20;

export const Route = createFileRoute("/_main/audit-log")({
  component: AuditLogPage,
});

function actionBadgeVariant(action: string) {
  if (action === "org_suspended" || action === "user_deactivated") {
    return "destructive" as const;
  }
  return "secondary" as const;
}

function AuditLogPage() {
  const [page, setPage] = useState(0);
  const offset = page * PAGE_SIZE;

  const { data, isLoading, isError, error } = useAuditLogList({
    limit: PAGE_SIZE,
    offset,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = offset + items.length;
  const canPrev = page > 0;
  const canNext = showingTo < total;

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chronological trail of platform staff actions across organizations
            and user accounts.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Staff email</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}

                {!isLoading && isError && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-10 text-center text-sm text-destructive"
                    >
                      {getApiErrorMessage(
                        error,
                        "Failed to load audit log. Please try again."
                      )}
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading && !isError && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <ClipboardList className="size-6" />
                        <p className="text-sm font-medium text-foreground">
                          No staff actions recorded yet
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading &&
                  !isError &&
                  items.map((item) => {
                    const exactTime = formatDateTime(item.created_at);
                    const relativeTime = formatRelativeTime(item.created_at);
                    const humanAction = formatHumanStaffAction(item.action);
                    const canLinkTarget = item.target_name !== "(deleted)";

                    return (
                      <TableRow key={item.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          <Tooltip>
                            <TooltipTrigger
                              title={exactTime}
                              className="cursor-default border-b border-dotted border-muted-foreground/50 text-left"
                            >
                              {relativeTime}
                            </TooltipTrigger>
                            <TooltipContent>{exactTime}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Avatar
                              seed={item.staff_user_id}
                              name={item.staff_name || item.staff_email}
                              size={24}
                            />
                            <span>{item.staff_email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={actionBadgeVariant(item.action)}>
                            {humanAction}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {canLinkTarget &&
                          item.target_type === "organization" ? (
                            <Link
                              to="/orgs/$orgId"
                              params={{ orgId: item.target_id }}
                              className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                            >
                              {item.target_name}
                            </Link>
                          ) : canLinkTarget && item.target_type === "user" ? (
                            <Link
                              to="/users/$userId"
                              params={{ userId: item.target_id }}
                              className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                            >
                              {item.target_name}
                            </Link>
                          ) : (
                            item.target_name
                          )}
                        </TableCell>
                        <TableCell className="max-w-md whitespace-normal text-muted-foreground">
                          {item.reason || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {total === 0
                ? "No audit log entries"
                : `Showing ${showingFrom}–${showingTo} of ${total}`}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!canPrev || isLoading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!canNext || isLoading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
