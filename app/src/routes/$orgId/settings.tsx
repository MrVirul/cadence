import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, Building2, Loader2 } from "lucide-react";
import { getMeQueryKey } from "@/api/endpoints/auth/auth";
import { useListMembers } from "@/api/endpoints/members/members";
import {
  getGetOrgQueryKey,
  useGetOrg,
  useUpdateOrg,
} from "@/api/endpoints/orgs/orgs";
import { PageQueryGate } from "@/components/guards/PageQueryGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiErrorMessage } from "@/lib/api-errors";

export const Route = createFileRoute("/$orgId/settings")({
  head: () => ({
    meta: [{ title: "Settings — Cadence" }],
  }),
  component: OrgSettingsPage,
});

function OrgSettingsPage() {
  const { orgId } = Route.useParams();
  return <OrgSettingsWorkspace key={orgId} orgId={orgId} />;
}

function OrgSettingsWorkspace({ orgId }: { orgId: string }) {
  const orgQuery = useGetOrg(orgId, {
    query: { retry: false },
  });

  // Admin gate via the API: plain members/leads receive 403 forbidden from GET /members
  const adminGateQuery = useListMembers(
    orgId,
    { limit: 1 },
    { query: { retry: false } }
  );

  return (
    <PageQueryGate error={adminGateQuery.error || orgQuery.error} orgId={orgId}>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Organization settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Update your organization profile and workspace details.
          </p>
        </div>

        {orgQuery.isLoading || adminGateQuery.isLoading || !orgQuery.data ? (
          <div className="max-w-xl space-y-4 rounded-xl border bg-background p-6 shadow-sm">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-9 w-28" />
          </div>
        ) : (
          <OrgSettingsForm
            key={orgQuery.data.name}
            orgId={orgId}
            initialName={orgQuery.data.name}
            slug={orgQuery.data.slug}
          />
        )}
      </div>
    </PageQueryGate>
  );
}

function OrgSettingsForm({
  orgId,
  initialName,
  slug,
}: {
  orgId: string;
  initialName: string;
  slug: string;
}) {
  const queryClient = useQueryClient();
  const [orgName, setOrgName] = useState(initialName);
  const [nameError, setNameError] = useState<string | null>(null);

  const updateOrgMutation = useUpdateOrg({
    mutation: { meta: { skipGlobalErrorToast: true } },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = orgName.trim();
    if (!trimmed) {
      setNameError("Organization name cannot be empty.");
      return;
    }
    if (trimmed.length > 100) {
      setNameError("Organization name must be 100 characters or fewer.");
      return;
    }
    setNameError(null);

    try {
      await updateOrgMutation.mutateAsync({
        orgId,
        data: { name: trimmed },
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getGetOrgQueryKey(orgId),
        }),
        queryClient.invalidateQueries({
          queryKey: getMeQueryKey(),
        }),
      ]);
      toast.success("Organization renamed.");
    } catch (err) {
      setNameError(
        getApiErrorMessage(err, "Could not update organization name.")
      );
    }
  };

  const isUnchanged = orgName.trim() === initialName;

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-xl space-y-5 rounded-xl border bg-background p-6 shadow-sm"
    >
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="size-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">General</h2>
          <p className="text-xs text-muted-foreground">
            Slug: <span className="font-mono">{slug}</span>
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="org-name-input">Organization name</Label>
        <Input
          id="org-name-input"
          value={orgName}
          onChange={(e) => {
            setOrgName(e.target.value);
            if (nameError) {
              setNameError(null);
            }
          }}
          maxLength={100}
          placeholder="e.g. Northwind Labs"
        />
        {nameError && (
          <p
            role="alert"
            className="flex items-center gap-1.5 text-xs font-medium text-destructive"
          >
            <AlertCircle className="size-3.5 shrink-0" />
            {nameError}
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={updateOrgMutation.isPending || isUnchanged}
        >
          {updateOrgMutation.isPending && (
            <Loader2 className="size-4 animate-spin" />
          )}
          Save changes
        </Button>
      </div>
    </form>
  );
}
