import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  Search,
  X,
} from "lucide-react";
import { useOrgList } from "@/api/endpoints/orgs/orgs";
import type { OrgListItem } from "@/api/model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getApiErrorMessage } from "@/lib/api-error";
import { formatDateTime, formatRelativeTime } from "@/lib/format";

const PAGE_SIZE = 20;

type SortField =
  | "name"
  | "slug"
  | "member_count"
  | "team_count"
  | "plan_count"
  | "last_active_at"
  | "status";
type SortDir = "asc" | "desc";

export const Route = createFileRoute("/_main/orgs/")({
  component: OrgsPage,
});

function OrgsPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(searchInput.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const offset = page * PAGE_SIZE;
  const { data, isLoading, isError, error } = useOrgList({
    q: debouncedQ || undefined,
    limit: PAGE_SIZE,
    offset,
  });

  const rawItems = data?.items ?? [];
  const total = data?.total ?? 0;
  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = offset + rawItems.length;
  const canPrev = page > 0;
  const canNext = showingTo < total;

  const sortedItems = useMemo(() => {
    const list = data?.items ?? [];
    if (!sortField) {
      return list;
    }
    const copy = [...list];
    copy.sort((a: OrgListItem, b: OrgListItem) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "slug":
          cmp = a.slug.localeCompare(b.slug);
          break;
        case "member_count":
          cmp = a.member_count - b.member_count;
          break;
        case "team_count":
          cmp = a.team_count - b.team_count;
          break;
        case "plan_count":
          cmp = a.plan_count - b.plan_count;
          break;
        case "last_active_at": {
          const ta = a.last_active_at
            ? new Date(a.last_active_at).getTime()
            : -1;
          const tb = b.last_active_at
            ? new Date(b.last_active_at).getTime()
            : -1;
          cmp = ta - tb;
          break;
        }
        case "status":
          cmp = Number(a.is_suspended) - Number(b.is_suspended);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [data?.items, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="size-3.5 text-muted-foreground/70" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="size-3.5 text-foreground" />
    ) : (
      <ArrowDown className="size-3.5 text-foreground" />
    );
  };

  const getAriaSort = (field: SortField) => {
    if (sortField !== field) {
      return "none" as const;
    }
    return sortDir === "asc" ? ("ascending" as const) : ("descending" as const);
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Organizations
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Workspace directory, activity, and account status. Plan and task
              text is never shown to staff.
            </p>
          </div>

          <div className="w-full sm:w-72">
            <Label htmlFor="org-search" className="sr-only">
              Search organizations
            </Label>
            <div className="relative">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="org-search"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name or slug..."
                className="pl-9 pr-8"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  aria-label="Clear organization search"
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead aria-sort={getAriaSort("name")}>
                    <button
                      type="button"
                      onClick={() => handleSort("name")}
                      className="inline-flex items-center gap-1.5 font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                    >
                      Name
                      {renderSortIcon("name")}
                    </button>
                  </TableHead>
                  <TableHead aria-sort={getAriaSort("slug")}>
                    <button
                      type="button"
                      onClick={() => handleSort("slug")}
                      className="inline-flex items-center gap-1.5 font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                    >
                      Slug
                      {renderSortIcon("slug")}
                    </button>
                  </TableHead>
                  <TableHead
                    aria-sort={getAriaSort("member_count")}
                    className="text-right"
                  >
                    <button
                      type="button"
                      onClick={() => handleSort("member_count")}
                      className="inline-flex items-center justify-end gap-1.5 font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                    >
                      Members
                      {renderSortIcon("member_count")}
                    </button>
                  </TableHead>
                  <TableHead
                    aria-sort={getAriaSort("team_count")}
                    className="text-right"
                  >
                    <button
                      type="button"
                      onClick={() => handleSort("team_count")}
                      className="inline-flex items-center justify-end gap-1.5 font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                    >
                      Teams
                      {renderSortIcon("team_count")}
                    </button>
                  </TableHead>
                  <TableHead
                    aria-sort={getAriaSort("plan_count")}
                    className="text-right"
                  >
                    <button
                      type="button"
                      onClick={() => handleSort("plan_count")}
                      className="inline-flex items-center justify-end gap-1.5 font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                    >
                      Plans
                      {renderSortIcon("plan_count")}
                    </button>
                  </TableHead>
                  <TableHead aria-sort={getAriaSort("last_active_at")}>
                    <button
                      type="button"
                      onClick={() => handleSort("last_active_at")}
                      className="inline-flex items-center gap-1.5 font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                    >
                      Last active
                      {renderSortIcon("last_active_at")}
                    </button>
                  </TableHead>
                  <TableHead aria-sort={getAriaSort("status")}>
                    <button
                      type="button"
                      onClick={() => handleSort("status")}
                      className="inline-flex items-center gap-1.5 font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                    >
                      Status
                      {renderSortIcon("status")}
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}

                {!isLoading && isError && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-10 text-center text-sm text-destructive"
                    >
                      {getApiErrorMessage(
                        error,
                        "Failed to load organizations. Please try again."
                      )}
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading && !isError && sortedItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Building2 className="size-6" />
                        <p className="text-sm font-medium text-foreground">
                          {debouncedQ
                            ? `No organizations matching "${debouncedQ}"`
                            : "No organizations yet"}
                        </p>
                        {debouncedQ && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSearchInput("")}
                          >
                            Clear search
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading &&
                  !isError &&
                  sortedItems.map((org) => {
                    const exactLastActive = org.last_active_at
                      ? formatDateTime(org.last_active_at)
                      : null;
                    const relativeLastActive = formatRelativeTime(
                      org.last_active_at
                    );

                    return (
                      <TableRow
                        key={org.id}
                        className="cursor-pointer hover:bg-muted/60"
                        onClick={() =>
                          navigate({
                            to: "/orgs/$orgId",
                            params: { orgId: org.id },
                          })
                        }
                      >
                        <TableCell className="font-medium">
                          <Link
                            to="/orgs/$orgId"
                            params={{ orgId: org.id }}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                          >
                            {org.name}
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {org.slug}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {org.member_count.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {org.team_count.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {org.plan_count.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {exactLastActive ? (
                            <Tooltip>
                              <TooltipTrigger
                                onClick={(e) => e.stopPropagation()}
                                title={exactLastActive}
                                className="cursor-default border-b border-dotted border-muted-foreground/50 text-left"
                              >
                                {relativeLastActive}
                              </TooltipTrigger>
                              <TooltipContent>{exactLastActive}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <span>Never</span>
                          )}
                        </TableCell>
                        <TableCell>
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
                ? "No organizations"
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
