import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search, Users as UsersIcon, X } from "lucide-react";
import { useUserList } from "@/api/endpoints/users/users";
import { useCurrentUser } from "@/contexts/user-context";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/Avatar";
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
import { getApiErrorMessage } from "@/lib/api-error";

const PAGE_SIZE = 20;

export const Route = createFileRoute("/_main/users/")({
  component: UsersPage,
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

function UsersPage() {
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(searchInput.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const offset = page * PAGE_SIZE;
  const { data, isLoading, isError, error } = useUserList({
    q: debouncedQ || undefined,
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Search user accounts, organization memberships, and account status.
          </p>
        </div>

        <div className="w-full sm:w-72">
          <Label htmlFor="user-search" className="sr-only">
            Search users
          </Label>
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="user-search"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name or email..."
              className="pl-9 pr-8"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                aria-label="Clear user search"
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
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Organizations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 4 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

              {!isLoading && isError && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-10 text-center text-sm text-destructive"
                  >
                    {getApiErrorMessage(
                      error,
                      "Failed to load users. Please try again."
                    )}
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && !isError && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <UsersIcon className="size-6" />
                      <p className="text-sm font-medium text-foreground">
                        {debouncedQ
                          ? `No users matching "${debouncedQ}"`
                          : "No users yet"}
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
                items.map((user) => {
                  const isSelf = currentUser?.id === user.id;
                  const displayName =
                    user.name ||
                    `${user.first_name} ${user.last_name}`.trim() ||
                    "—";
                  const orgs = user.orgs ?? [];

                  return (
                    <TableRow
                      key={user.id}
                      className="cursor-pointer hover:bg-muted/60"
                      onClick={() =>
                        navigate({
                          to: "/users/$userId",
                          params: { userId: user.id },
                        })
                      }
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2.5">
                          <Avatar seed={user.id} name={displayName} size={28} />
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              to="/users/$userId"
                              params={{ userId: user.id }}
                              onClick={(e) => e.stopPropagation()}
                              className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                            >
                              {displayName}
                            </Link>
                            {user.is_admin && (
                              <Badge
                                variant="outline"
                                className="border-amber-500/30 bg-amber-500/10 text-[#B45309] dark:text-amber-400"
                              >
                                Staff
                              </Badge>
                            )}
                            {isSelf && (
                              <span className="text-xs text-muted-foreground">
                                (you)
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {user.email}
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                      <TableCell>
                        {orgs.length === 0 ? (
                          <span className="text-sm text-muted-foreground">
                            —
                          </span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {orgs.map((org) => (
                              <span
                                key={org.id}
                                className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-0.5 text-xs"
                              >
                                <span className="font-medium text-foreground">
                                  {org.name}
                                </span>
                                <Badge
                                  variant={roleBadgeVariant(org.role)}
                                  className="h-4 px-1.5 text-[10px] capitalize"
                                >
                                  {org.role}
                                </Badge>
                              </span>
                            ))}
                          </div>
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
              ? "No users"
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
  );
}
