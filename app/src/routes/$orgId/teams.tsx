import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  Loader2,
  Plus,
  Settings2,
  Trash2,
  Users,
} from "lucide-react";
import { useListMembers } from "@/api/endpoints/members/members";
import {
  getGetTeamQueryKey,
  getListTeamsQueryKey,
  useCreateTeam,
  useDeleteTeam,
  useGetTeam,
  useListTeams,
  useReplaceTeamMembers,
  useSetTeamLead,
  useUpdateTeam,
} from "@/api/endpoints/teams/teams";
import type { TeamDetailResponse } from "@/api/model";
import { PageQueryGate } from "@/components/guards/PageQueryGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  getApiErrorCode,
  getApiErrorMessage,
  getApiStatus,
} from "@/lib/api-errors";
import { formatMemberLabel, sortMembersByName } from "@/lib/utils";
import { currentWeekStartUtc } from "@/lib/week";

export const Route = createFileRoute("/$orgId/teams")({
  head: () => ({
    meta: [{ title: "Teams — Cadence" }],
  }),
  component: TeamsAdminPage,
});

function TeamsAdminPage() {
  const { orgId } = Route.useParams();
  return <TeamsAdminWorkspace key={orgId} orgId={orgId} />;
}

function TeamsAdminWorkspace({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const thisMonday = currentWeekStartUtc();

  // Both queries run; useListMembers enforces require_org_admin (403 for plain members/leads)
  const teamsQuery = useListTeams(
    orgId,
    { limit: 100 },
    { query: { retry: false } }
  );
  const membersQuery = useListMembers(
    orgId,
    { limit: 100 },
    { query: { retry: false } }
  );

  // Create team dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamLeadId, setNewTeamLeadId] = useState<string>("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Manage team dialog state
  const [managingTeamId, setManagingTeamId] = useState<string | null>(null);

  const createTeamMutation = useCreateTeam({
    mutation: { meta: { skipGlobalErrorToast: true } },
  });

  const orgMembers = membersQuery.data?.items ?? [];
  const teams = teamsQuery.data?.items ?? [];

  const memberById = new Map(orgMembers.map((m) => [m.membership_id, m]));

  const newTeamLeadOptions = useMemo(() => {
    const items = membersQuery.data?.items ?? [];
    const sorted = sortMembersByName(items);
    return [
      { value: "", label: "No lead yet" },
      ...sorted.map((m) => ({
        value: m.membership_id,
        label: formatMemberLabel(m.user),
      })),
    ];
  }, [membersQuery.data?.items]);

  const invalidateTeams = async (teamId?: string) => {
    await queryClient.invalidateQueries({
      queryKey: getListTeamsQueryKey(orgId),
    });
    if (teamId) {
      await queryClient.invalidateQueries({
        queryKey: getGetTeamQueryKey(orgId, teamId),
      });
    }
  };

  const handleOpenCreate = () => {
    setNewTeamName("");
    setNewTeamLeadId("");
    setCreateError(null);
    setCreateOpen(true);
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTeamName.trim();
    if (!trimmed) {
      setCreateError("Enter a team name.");
      return;
    }
    if (trimmed.length > 100) {
      setCreateError("Team name must be 100 characters or fewer.");
      return;
    }
    setCreateError(null);

    try {
      await createTeamMutation.mutateAsync({
        orgId,
        data: {
          name: trimmed,
          lead_membership_id: newTeamLeadId ? newTeamLeadId : null,
        },
      });
      await invalidateTeams();
      setCreateOpen(false);
      toast.success(`Team "${trimmed}" created.`);
    } catch (err) {
      const status = getApiStatus(err);
      if (status === 409) {
        setCreateError("A team with this name already exists.");
        return;
      }
      setCreateError(getApiErrorMessage(err, "Could not create team."));
    }
  };

  return (
    <PageQueryGate error={membersQuery.error || teamsQuery.error} orgId={orgId}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Teams
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage engineering teams, team members, and who approves weekly
              plans.
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleOpenCreate}
            className="self-start sm:self-auto"
          >
            <Plus className="size-4" />
            New team
          </Button>
        </div>

        {teamsQuery.isLoading || membersQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-xl border bg-background p-4"
              >
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-8 w-20 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        ) : teams.length === 0 ? (
          <div className="rounded-xl border bg-background p-8 text-center shadow-sm">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users className="size-5" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              No teams yet
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Create your first engineering team and assign a team lead to start
              reviewing weekly plans.
            </p>
            <div className="mt-4">
              <Button size="sm" onClick={handleOpenCreate}>
                <Plus className="size-4" />
                New team
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4">Team</TableHead>
                  <TableHead className="px-4">Lead</TableHead>
                  <TableHead className="px-4">Members</TableHead>
                  <TableHead className="px-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.map((team) => {
                  const lead = team.lead_membership_id
                    ? memberById.get(team.lead_membership_id)
                    : undefined;
                  return (
                    <TableRow key={team.id}>
                      <TableCell className="px-4 py-3 font-medium text-foreground">
                        {team.name}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        {team.lead_membership_id && lead ? (
                          <div className="flex flex-col">
                            <span className="text-sm text-foreground">
                              {lead.user.name || lead.user.email}
                            </span>
                            {lead.user.name && (
                              <span className="text-xs text-muted-foreground">
                                {lead.user.email}
                              </span>
                            )}
                          </div>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-amber-300 bg-amber-50 text-xs text-amber-800"
                          >
                            No lead yet
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm tabular-nums text-muted-foreground">
                        {team.member_count === 0 ? (
                          <span className="text-xs italic text-muted-foreground">
                            No members
                          </span>
                        ) : (
                          <>
                            {team.member_count}{" "}
                            {team.member_count === 1 ? "member" : "members"}
                          </>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="xs"
                            render={
                              <Link
                                to="/$orgId/team/$teamId/week/$weekStart"
                                params={{
                                  orgId,
                                  teamId: team.id,
                                  weekStart: thisMonday,
                                }}
                              />
                            }
                          >
                            <CalendarDays className="size-3.5" />
                            Week view
                          </Button>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => setManagingTeamId(team.id)}
                          >
                            <Settings2 className="size-3.5" />
                            Manage
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
      </div>

      {/* New Team Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setCreateError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New team</DialogTitle>
            <DialogDescription>
              Create a team for weekly planning. Picking a lead automatically
              adds them to the team.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateTeam} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-team-name">Team name</Label>
              <Input
                id="new-team-name"
                value={newTeamName}
                onChange={(e) => {
                  setNewTeamName(e.target.value);
                  if (createError) {
                    setCreateError(null);
                  }
                }}
                placeholder="e.g. Core Platform"
                maxLength={100}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-team-lead">Team lead (optional)</Label>
              <LabeledSelect
                id="new-team-lead"
                value={newTeamLeadId}
                onValueChange={(val) => {
                  setNewTeamLeadId(val);
                }}
                options={newTeamLeadOptions}
                placeholder="No lead yet"
                clearable
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                If you select a lead now, they will be added as a team member
                automatically.
              </p>
            </div>

            {createError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
              >
                <AlertCircle className="size-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={createTeamMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createTeamMutation.isPending}>
                {createTeamMutation.isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                Create team
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Team Detail / Manage Dialog */}
      {managingTeamId && (
        <ManageTeamDialog
          key={managingTeamId}
          orgId={orgId}
          teamId={managingTeamId}
          orgMembers={orgMembers}
          onClose={() => setManagingTeamId(null)}
          onChanged={invalidateTeams}
        />
      )}
    </PageQueryGate>
  );
}

type OrgMemberItem = {
  membership_id: string;
  role: string;
  user: { id: string; name?: string | null; email: string };
};

function ManageTeamDialog({
  orgId,
  teamId,
  orgMembers,
  onClose,
  onChanged,
}: {
  orgId: string;
  teamId: string;
  orgMembers: OrgMemberItem[];
  onClose: () => void;
  onChanged: (teamId?: string) => Promise<void>;
}) {
  const teamDetailQuery = useGetTeam(orgId, teamId, {
    query: { retry: false },
  });

  const team = teamDetailQuery.data;
  const teamFormKey = team
    ? `${team.id}:${team.name}:${team.lead_membership_id ?? ""}:${team.members.map((m) => m.membership_id).join(",")}`
    : teamId;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {team ? `Manage ${team.name}` : "Manage team"}
          </DialogTitle>
          <DialogDescription>
            Update team name, membership roster, and team lead.
          </DialogDescription>
        </DialogHeader>

        {teamDetailQuery.isLoading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !team ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Team not found.
          </div>
        ) : (
          <ManageTeamForm
            key={teamFormKey}
            orgId={orgId}
            teamId={teamId}
            team={team}
            orgMembers={orgMembers}
            onClose={onClose}
            onChanged={onChanged}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ManageTeamForm({
  orgId,
  teamId,
  team,
  orgMembers,
  onClose,
  onChanged,
}: {
  orgId: string;
  teamId: string;
  team: TeamDetailResponse;
  orgMembers: OrgMemberItem[];
  onClose: () => void;
  onChanged: (teamId?: string) => Promise<void>;
}) {
  const [nameInput, setNameInput] = useState(team.name);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(() =>
    team.members.map((m) => m.membership_id)
  );
  const [membersError, setMembersError] = useState<string | null>(null);

  const [selectedLeadId, setSelectedLeadId] = useState<string>(
    team.lead_membership_id ?? ""
  );
  const [leadError, setLeadError] = useState<string | null>(null);

  const teamLeadOptions = useMemo(() => {
    const sorted = sortMembersByName(team.members);
    return sorted.map((m) => ({
      value: m.membership_id,
      label: formatMemberLabel(m.user),
    }));
  }, [team.members]);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const updateTeamMutation = useUpdateTeam({
    mutation: { meta: { skipGlobalErrorToast: true } },
  });
  const replaceMembersMutation = useReplaceTeamMembers({
    mutation: { meta: { skipGlobalErrorToast: true } },
  });
  const setLeadMutation = useSetTeamLead({
    mutation: { meta: { skipGlobalErrorToast: true } },
  });
  const deleteTeamMutation = useDeleteTeam({
    mutation: { meta: { skipGlobalErrorToast: true } },
  });

  const currentLeadRemovedFromSelection = Boolean(
    team.lead_membership_id &&
    !selectedMemberIds.includes(team.lead_membership_id)
  );

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setRenameError("Enter a team name.");
      return;
    }
    if (trimmed.length > 100) {
      setRenameError("Team name must be 100 characters or fewer.");
      return;
    }
    setRenameError(null);

    try {
      await updateTeamMutation.mutateAsync({
        orgId,
        teamId,
        data: { name: trimmed },
      });
      await onChanged(teamId);
      toast.success("Team renamed.");
    } catch (err) {
      if (getApiStatus(err) === 409) {
        setRenameError("A team with this name already exists.");
        return;
      }
      setRenameError(getApiErrorMessage(err, "Could not rename team."));
    }
  };

  const toggleMember = (membershipId: string, checked: boolean) => {
    setMembersError(null);
    setSelectedMemberIds((prev) =>
      checked
        ? prev.includes(membershipId)
          ? prev
          : [...prev, membershipId]
        : prev.filter((id) => id !== membershipId)
    );
  };

  const handleSaveMembers = async () => {
    setMembersError(null);
    try {
      await replaceMembersMutation.mutateAsync({
        orgId,
        teamId,
        data: { membership_ids: selectedMemberIds },
      });
      await onChanged(teamId);
      toast.success("Team members updated.");
    } catch (err) {
      setMembersError(
        getApiErrorMessage(err, "Could not update team members.")
      );
    }
  };

  const handleSaveLead = async () => {
    if (!selectedLeadId) {
      return;
    }
    setLeadError(null);
    try {
      await setLeadMutation.mutateAsync({
        orgId,
        teamId,
        data: { membership_id: selectedLeadId },
      });
      await onChanged(teamId);
      toast.success("Team lead updated.");
    } catch (err) {
      setLeadError(getApiErrorMessage(err, "Could not update team lead."));
    }
  };

  const handleDeleteTeam = async () => {
    setDeleteError(null);
    try {
      await deleteTeamMutation.mutateAsync({ orgId, teamId });
      await onChanged();
      toast.success(`Team "${team.name}" deleted.`);
      onClose();
    } catch (err) {
      const status = getApiStatus(err);
      const code = getApiErrorCode(err);
      if (status === 409 || code === "team_has_plans" || code === "conflict") {
        const msg = "This team has plans, so it can't be deleted";
        setDeleteError(msg);
        toast.error(msg);
        return;
      }
      setDeleteError(getApiErrorMessage(err, "Could not delete team."));
    }
  };

  return (
    <div className="space-y-6">
      {/* Rename Section */}
      <form onSubmit={handleRename} className="space-y-2">
        <Label htmlFor="edit-team-name">Team name</Label>
        <div className="flex items-center gap-2">
          <Input
            id="edit-team-name"
            value={nameInput}
            onChange={(e) => {
              setNameInput(e.target.value);
              if (renameError) {
                setRenameError(null);
              }
            }}
            maxLength={100}
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={
              updateTeamMutation.isPending || nameInput.trim() === team.name
            }
          >
            {updateTeamMutation.isPending && (
              <Loader2 className="size-3.5 animate-spin" />
            )}
            Save name
          </Button>
        </div>
        {renameError && (
          <p
            role="alert"
            className="flex items-center gap-1.5 text-xs font-medium text-destructive"
          >
            <AlertCircle className="size-3.5 shrink-0" />
            {renameError}
          </p>
        )}
      </form>

      {/* Members Multi-Select Section */}
      <div className="space-y-2.5 border-t pt-4">
        <div className="flex items-center justify-between">
          <Label>Team members ({selectedMemberIds.length})</Label>
          <span className="text-xs text-muted-foreground">
            Replaces current roster on save
          </span>
        </div>

        {orgMembers.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No members in this organization.
          </p>
        ) : (
          <div className="max-h-48 divide-y overflow-y-auto rounded-lg border bg-muted/15">
            {orgMembers.map((member) => {
              const checked = selectedMemberIds.includes(member.membership_id);
              const isCurrentLead =
                team.lead_membership_id === member.membership_id;
              const checkboxId = `team-member-${member.membership_id}`;

              return (
                <label
                  key={member.membership_id}
                  htmlFor={checkboxId}
                  className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/40"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Checkbox
                      id={checkboxId}
                      checked={checked}
                      onCheckedChange={(val) =>
                        toggleMember(member.membership_id, Boolean(val))
                      }
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {member.user.name || member.user.email}
                      </p>
                      {member.user.name && (
                        <p className="truncate text-xs text-muted-foreground">
                          {member.user.email}
                        </p>
                      )}
                    </div>
                  </div>
                  {isCurrentLead && (
                    <Badge variant="secondary" className="shrink-0 text-[11px]">
                      Current lead
                    </Badge>
                  )}
                </label>
              );
            })}
          </div>
        )}

        {currentLeadRemovedFromSelection && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900"
          >
            <AlertTriangle className="size-4 shrink-0 text-amber-600" />
            <span>This also removes the lead</span>
          </div>
        )}

        {membersError && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {membersError}
          </p>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={handleSaveMembers}
            disabled={replaceMembersMutation.isPending}
          >
            {replaceMembersMutation.isPending && (
              <Loader2 className="size-3.5 animate-spin" />
            )}
            Save members
          </Button>
        </div>
      </div>

      {/* Lead Select Section (limited to current saved team members) */}
      <div className="space-y-2.5 border-t pt-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="team-lead-select">Team lead</Label>
          {!team.lead_membership_id && (
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-50 text-xs text-amber-800"
            >
              No lead yet
            </Badge>
          )}
        </div>

        {team.members.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
            This team has no members yet. Save at least one member above to
            choose a team lead.
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <LabeledSelect
              id="team-lead-select"
              value={selectedLeadId}
              onValueChange={(val) => {
                setSelectedLeadId(val);
                setLeadError(null);
              }}
              options={teamLeadOptions}
              placeholder="Choose a team member as lead"
              className="flex-1"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={
                setLeadMutation.isPending ||
                !selectedLeadId ||
                selectedLeadId === (team.lead_membership_id ?? "")
              }
              onClick={handleSaveLead}
            >
              {setLeadMutation.isPending && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              Set lead
            </Button>
          </div>
        )}

        {leadError && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {leadError}
          </p>
        )}
      </div>

      {/* Delete Team Section */}
      <div className="space-y-3 border-t pt-4">
        {!confirmDeleteOpen ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Delete team</p>
              <p className="text-xs text-muted-foreground">
                Teams without any weekly plans can be deleted.
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                setDeleteError(null);
                setConfirmDeleteOpen(true);
              }}
            >
              <Trash2 className="size-3.5" />
              Delete team
            </Button>
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-xs font-medium text-foreground">
              Are you sure you want to delete{" "}
              <span className="font-semibold">{team.name}</span>?
            </p>
            {deleteError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-destructive/40 bg-background px-3 py-2 text-xs font-medium text-destructive"
              >
                <AlertCircle className="size-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  setConfirmDeleteOpen(false);
                  setDeleteError(null);
                }}
                disabled={deleteTeamMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="xs"
                onClick={handleDeleteTeam}
                disabled={deleteTeamMutation.isPending}
              >
                {deleteTeamMutation.isPending && (
                  <Loader2 className="size-3.5 animate-spin" />
                )}
                Confirm delete
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
