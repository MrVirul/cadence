import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Link2,
  Loader2,
  MailPlus,
  Trash2,
  UserMinus,
} from "lucide-react";
import { getMeQueryKey } from "@/api/endpoints/auth/auth";
import {
  getListInvitesQueryKey,
  useCreateInvite,
  useListInvites,
  useRevokeInvite,
} from "@/api/endpoints/invites/invites";
import {
  getListMembersQueryKey,
  useListMembers,
  useRemoveMember,
  useUpdateMemberRole,
} from "@/api/endpoints/members/members";
import { getListTeamsQueryKey } from "@/api/endpoints/teams/teams";
import type {
  InviteCreateRequestRole,
  InviteResponse,
  MemberRoleUpdateRequestRole,
  MembershipResponse,
} from "@/api/model";
import { PageQueryGate } from "@/components/guards/PageQueryGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LabeledSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUser } from "@/contexts/user-context";
import {
  getApiErrorCode,
  getApiErrorMessage,
  getApiStatus,
} from "@/lib/api-errors";

export const Route = createFileRoute("/$orgId/members")({
  head: () => ({
    meta: [{ title: "Members & Invites — Cadence" }],
  }),
  component: MembersAndInvitesPage,
});

const PAGE_SIZE = 20;

function formatShortDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function buildInviteLink(invite: InviteResponse): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/invite/${invite.token}`;
  }
  return invite.url;
}

function MembersAndInvitesPage() {
  const { orgId } = Route.useParams();
  return <MembersWorkspace key={orgId} orgId={orgId} />;
}

function MembersWorkspace({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const { user, memberships } = useUser();

  const currentMembership = memberships.find((m) => m.org.id === orgId);
  const myRole = currentMembership?.role ?? "member";
  const isOwner = myRole === "owner";

  const [membersPage, setMembersPage] = useState(0);
  const [roleAlert, setRoleAlert] = useState<string | null>(null);
  const [updatingMembershipId, setUpdatingMembershipId] = useState<
    string | null
  >(null);

  // Remove member dialog state
  const [removingMember, setRemovingMember] =
    useState<MembershipResponse | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Invite creation dialog state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] =
    useState<InviteCreateRequestRole>("member");
  const [inviteExpiresDays, setInviteExpiresDays] = useState("7");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<InviteResponse | null>(
    null
  );

  // Revoke invite confirmation state
  const [revokingInvite, setRevokingInvite] = useState<InviteResponse | null>(
    null
  );

  // Copied state keyed by invite id or "created"
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const membersQuery = useListMembers(
    orgId,
    {
      limit: PAGE_SIZE,
      offset: membersPage * PAGE_SIZE,
    },
    { query: { retry: false } }
  );

  const invitesQuery = useListInvites(
    orgId,
    { limit: 100 },
    { query: { retry: false } }
  );

  const updateRoleMutation = useUpdateMemberRole({
    mutation: { meta: { skipGlobalErrorToast: true } },
  });
  const removeMemberMutation = useRemoveMember({
    mutation: { meta: { skipGlobalErrorToast: true } },
  });
  const createInviteMutation = useCreateInvite({
    mutation: { meta: { skipGlobalErrorToast: true } },
  });
  const revokeInviteMutation = useRevokeInvite({
    mutation: { meta: { skipGlobalErrorToast: true } },
  });

  const members = membersQuery.data?.items ?? [];
  const totalMembers = membersQuery.data?.total ?? 0;
  const totalMemberPages = Math.max(1, Math.ceil(totalMembers / PAGE_SIZE));

  const invites = invitesQuery.data?.items ?? [];

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for environments where clipboard API is restricted
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedKey(key);
    toast.success("Invite link copied to clipboard.");
    window.setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2000);
  };

  const refreshMembersAndContext = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: getListMembersQueryKey(orgId),
      }),
      queryClient.invalidateQueries({
        queryKey: getListTeamsQueryKey(orgId),
      }),
      queryClient.invalidateQueries({
        queryKey: getMeQueryKey(),
      }),
    ]);
  };

  const handleRoleChange = async (
    member: MembershipResponse,
    nextRole: MemberRoleUpdateRequestRole
  ) => {
    if (nextRole === member.role) {
      return;
    }
    setRoleAlert(null);
    setUpdatingMembershipId(member.membership_id);

    try {
      await updateRoleMutation.mutateAsync({
        orgId,
        membershipId: member.membership_id,
        data: { role: nextRole },
      });
      await refreshMembersAndContext();
      toast.success(
        `Updated ${member.user.name || member.user.email} to ${nextRole}.`
      );
    } catch (err) {
      const status = getApiStatus(err);
      const code = getApiErrorCode(err);
      if (status === 409 || code === "last_owner") {
        const msg = "There must be at least one owner";
        setRoleAlert(msg);
        toast.error(msg);
      } else if (status === 403 || code === "forbidden") {
        const msg = "Only owners can change owner roles.";
        setRoleAlert(msg);
        toast.error(msg);
      } else {
        const msg = getApiErrorMessage(err, "Could not update member role.");
        setRoleAlert(msg);
        toast.error(msg);
      }
      await refreshMembersAndContext();
    } finally {
      setUpdatingMembershipId(null);
    }
  };

  const handleConfirmRemoveMember = async () => {
    if (!removingMember) {
      return;
    }
    setRemoveError(null);

    try {
      await removeMemberMutation.mutateAsync({
        orgId,
        membershipId: removingMember.membership_id,
      });
      await refreshMembersAndContext();
      toast.success(
        `Removed ${removingMember.user.name || removingMember.user.email}.`
      );
      setRemovingMember(null);
    } catch (err) {
      const status = getApiStatus(err);
      const code = getApiErrorCode(err);
      if (status === 409 || code === "last_owner") {
        const msg = "There must be at least one owner";
        setRemoveError(msg);
        toast.error(msg);
        return;
      }
      if (status === 403 || code === "forbidden") {
        const msg = "You don't have permission to remove this member.";
        setRemoveError(msg);
        toast.error(msg);
        return;
      }
      setRemoveError(getApiErrorMessage(err, "Could not remove member."));
    }
  };

  const handleOpenInviteDialog = () => {
    setInviteRole("member");
    setInviteExpiresDays("7");
    setInviteError(null);
    setCreatedInvite(null);
    setInviteOpen(true);
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedDays = Number.parseInt(inviteExpiresDays, 10);
    if (Number.isNaN(parsedDays) || parsedDays < 1 || parsedDays > 30) {
      setInviteError("Expiration must be between 1 and 30 days.");
      return;
    }
    setInviteError(null);

    try {
      const res = await createInviteMutation.mutateAsync({
        orgId,
        data: {
          role: inviteRole,
          expires_in_days: parsedDays,
        },
      });
      setCreatedInvite(res);
      await queryClient.invalidateQueries({
        queryKey: getListInvitesQueryKey(orgId),
      });
      toast.success("Invite link created.");
    } catch (err) {
      setInviteError(getApiErrorMessage(err, "Could not create invite."));
    }
  };

  const handleConfirmRevokeInvite = async () => {
    if (!revokingInvite) {
      return;
    }
    try {
      await revokeInviteMutation.mutateAsync({
        orgId,
        inviteId: revokingInvite.id,
      });
      await queryClient.invalidateQueries({
        queryKey: getListInvitesQueryKey(orgId),
      });
      toast.success("Invite revoked.");
      setRevokingInvite(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not revoke invite."));
    }
  };

  return (
    <PageQueryGate
      error={membersQuery.error || invitesQuery.error}
      orgId={orgId}
    >
      <div className="space-y-8">
        {/* Members Section */}
        <section className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                Members
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage organization members, roles, and single-use invite links.
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleOpenInviteDialog}
              className="self-start sm:self-auto"
            >
              <MailPlus className="size-4" />
              Invite someone
            </Button>
          </div>

          {roleAlert && (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{roleAlert}</span>
              </div>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setRoleAlert(null)}
              >
                Dismiss
              </Button>
            </div>
          )}

          {!membersQuery.isLoading && totalMembers <= 1 && (
            <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              No other members in this organization yet. Use{" "}
              <button
                type="button"
                onClick={handleOpenInviteDialog}
                className="font-medium text-primary underline underline-offset-4"
              >
                Invite someone
              </button>{" "}
              to generate a join link for your team.
            </div>
          )}

          {membersQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-xl border bg-background p-4"
                >
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-28" />
                    <Skeleton className="h-8 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="px-4">Name</TableHead>
                      <TableHead className="px-4">Email</TableHead>
                      <TableHead className="px-4">Role</TableHead>
                      <TableHead className="px-4">Joined</TableHead>
                      <TableHead className="px-4 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => {
                      const isMe = member.user.id === user?.id;
                      const isTargetOwner = member.role === "owner";
                      // Admins cannot touch owners; owners can change anyone
                      const canEditRole = isOwner || !isTargetOwner;
                      const canRemove = isOwner || !isTargetOwner;
                      const isRowUpdating =
                        updatingMembershipId === member.membership_id;

                      return (
                        <TableRow key={member.membership_id}>
                          <TableCell className="px-4 py-3 font-medium text-foreground">
                            <div className="flex items-center gap-2">
                              <span>{member.user.name || "—"}</span>
                              {isMe && (
                                <Badge
                                  variant="secondary"
                                  className="text-[11px]"
                                >
                                  You
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                            {member.user.email}
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            {canEditRole ? (
                              <div className="w-32">
                                <LabeledSelect
                                  size="sm"
                                  aria-label={`Role for ${member.user.email}`}
                                  value={member.role}
                                  disabled={isRowUpdating}
                                  onValueChange={(val) => {
                                    void handleRoleChange(
                                      member,
                                      val as MemberRoleUpdateRequestRole
                                    );
                                  }}
                                  options={[
                                    ...(isOwner
                                      ? [{ value: "owner", label: "Owner" }]
                                      : []),
                                    { value: "admin", label: "Admin" },
                                    { value: "member", label: "Member" },
                                  ]}
                                  className="w-full"
                                />
                              </div>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="capitalize"
                                data-testid={`readonly-role-${member.user.email}`}
                              >
                                {member.role}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                            {formatShortDate(member.created_at)}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-right">
                            {canRemove ? (
                              <Button
                                variant="ghost"
                                size="xs"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => {
                                  setRemoveError(null);
                                  setRemovingMember(member);
                                }}
                                aria-label={`Remove ${member.user.email}`}
                              >
                                <UserMinus className="size-3.5" />
                                Remove
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Owner
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {totalMembers > PAGE_SIZE && (
                <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
                  <p className="text-xs text-muted-foreground">
                    Showing {membersPage * PAGE_SIZE + 1}–
                    {Math.min((membersPage + 1) * PAGE_SIZE, totalMembers)} of{" "}
                    {totalMembers} members
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={membersPage === 0}
                      onClick={() => setMembersPage((p) => Math.max(0, p - 1))}
                    >
                      <ChevronLeft className="size-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={membersPage >= totalMemberPages - 1}
                      onClick={() =>
                        setMembersPage((p) =>
                          Math.min(totalMemberPages - 1, p + 1)
                        )
                      }
                    >
                      Next
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Invites Section */}
        <section className="space-y-4 border-t pt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Active invites
              </h2>
              <p className="text-sm text-muted-foreground">
                Single-use links to join this organization.
              </p>
            </div>
          </div>

          {invitesQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, idx) => (
                <Skeleton key={idx} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : invites.length === 0 ? (
            <div className="rounded-xl border bg-background p-6 text-center shadow-sm">
              <div className="mx-auto mb-2.5 flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Link2 className="size-4" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">
                No active invites
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                Create a single-use invite link to bring engineers or admins
                into your organization.
              </p>
              <div className="mt-3">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={handleOpenInviteDialog}
                >
                  <MailPlus className="size-3.5" />
                  Invite someone
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="px-4">Invite link</TableHead>
                    <TableHead className="px-4">Role</TableHead>
                    <TableHead className="px-4">Expires</TableHead>
                    <TableHead className="px-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((invite) => {
                    const link = buildInviteLink(invite);
                    const isCopied = copiedKey === invite.id;

                    return (
                      <TableRow key={invite.id}>
                        <TableCell className="max-w-[220px] truncate px-4 py-3 font-mono text-xs text-muted-foreground sm:max-w-xs">
                          {link}
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          <Badge variant="secondary" className="capitalize">
                            {invite.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                          {formatShortDate(invite.expires_at)}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => void copyText(link, invite.id)}
                            >
                              {isCopied ? (
                                <>
                                  <Check className="size-3.5 text-emerald-600" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="size-3.5" />
                                  Copy link
                                </>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setRevokingInvite(invite)}
                            >
                              <Trash2 className="size-3.5" />
                              Revoke
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>

      {/* Remove Member Confirmation Dialog */}
      <Dialog
        open={Boolean(removingMember)}
        onOpenChange={(open) => {
          if (!open) {
            setRemovingMember(null);
            setRemoveError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-medium text-foreground">
                {removingMember?.user.name || removingMember?.user.email}
              </span>{" "}
              from this organization?
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <span>Their plans and team memberships are deleted too</span>
          </div>

          {removeError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
            >
              <AlertCircle className="size-4 shrink-0" />
              <span>{removeError}</span>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemovingMember(null)}
              disabled={removeMemberMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmRemoveMember}
              disabled={removeMemberMutation.isPending}
            >
              {removeMemberMutation.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Remove member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Someone Dialog */}
      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open);
          if (!open) {
            setInviteError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite someone</DialogTitle>
            <DialogDescription>
              Generate a single-use link to invite a member or admin to this
              organization.
            </DialogDescription>
          </DialogHeader>

          {!createdInvite ? (
            <form onSubmit={handleCreateInvite} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="invite-role-select">Role</Label>
                <LabeledSelect
                  id="invite-role-select"
                  value={inviteRole}
                  onValueChange={(val) => {
                    setInviteRole(val as InviteCreateRequestRole);
                  }}
                  options={[
                    { value: "member", label: "Member" },
                    { value: "admin", label: "Admin" },
                  ]}
                  className="w-full"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="invite-expires-days">Expires in (days)</Label>
                <Input
                  id="invite-expires-days"
                  type="number"
                  min={1}
                  max={30}
                  value={inviteExpiresDays}
                  onChange={(e) => {
                    setInviteExpiresDays(e.target.value);
                    if (inviteError) {
                      setInviteError(null);
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Between 1 and 30 days (default 7 days).
                </p>
              </div>

              {inviteError && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
                >
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{inviteError}</span>
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setInviteOpen(false)}
                  disabled={createInviteMutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createInviteMutation.isPending}>
                  {createInviteMutation.isPending && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  Create invite link
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="created-invite-url">Invite URL</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="created-invite-url"
                    readOnly
                    value={buildInviteLink(createdInvite)}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      void copyText(
                        buildInviteLink(createdInvite),
                        "created-invite"
                      )
                    }
                  >
                    {copiedKey === "created-invite" ? (
                      <>
                        <Check className="size-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="size-4" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Share this link with your teammate. It can only be used once
                  and expires on {formatShortDate(createdInvite.expires_at)}.
                </p>
              </div>

              <DialogFooter>
                <Button type="button" onClick={() => setInviteOpen(false)}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Revoke Invite Confirmation Dialog */}
      <Dialog
        open={Boolean(revokingInvite)}
        onOpenChange={(open) => !open && setRevokingInvite(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke invite</DialogTitle>
            <DialogDescription>
              This invite link will stop working immediately and cannot be used
              to join the organization.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevokingInvite(null)}
              disabled={revokeInviteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmRevokeInvite}
              disabled={revokeInviteMutation.isPending}
            >
              {revokeInviteMutation.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Revoke invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageQueryGate>
  );
}
