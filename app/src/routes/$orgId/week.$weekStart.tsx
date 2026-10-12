import { Link, createFileRoute, useBlocker } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  Loader2,
  MessageSquareWarning,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  Users,
  XCircle,
} from "lucide-react";
import { planReview } from "@/api/endpoints/ai/ai";
import {
  getGetPlanQueryKey,
  getListPlansQueryKey,
  useApprovePlan,
  useClosePlan,
  useCreatePlan,
  useGetPlan,
  useListPlans,
  useSubmitPlan,
  useUpdatePlan,
  useWithdrawPlan,
} from "@/api/endpoints/plans/plans";
import { useTickTask } from "@/api/endpoints/tasks/tasks";
import {
  getGetTeamQueryOptions,
  useListTeams,
} from "@/api/endpoints/teams/teams";
import type {
  Finding,
  PlanDetailResponse,
  PlanDraft,
  PlanReview,
  TaskIn,
  TaskInput,
  TeamResponse,
} from "@/api/model";
import { PageQueryGate } from "@/components/guards/PageQueryGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DraftFromNotesDialog } from "@/components/week/DraftFromNotesDialog";
import { AiReviewSkeleton, FindingCard } from "@/components/week/FindingCard";
import { PlanReadOnlyView } from "@/components/week/PlanReadOnlyView";
import { PlanStatusBadge } from "@/components/week/PlanStatusBadge";
import { WeekBar } from "@/components/week/WeekBar";
import { useUser } from "@/contexts/user-context";
import {
  getAiErrorMessage,
  getApiErrorCode,
  getApiErrorMessage,
  getRetryAfterSeconds,
  parseValidationErrors,
} from "@/lib/api-errors";
import { cn } from "@/lib/utils";
import {
  currentWeekStartUtc,
  getWeekWindowStatus,
  isMondayUtc,
} from "@/lib/week";

export const Route = createFileRoute("/$orgId/week/$weekStart")({
  component: MyWeekRoutePage,
});

const TITLE_MAX = 200;
const WHY_MAX = 500;
const MAX_SUB_GOALS = 5;
const MAX_GTM_GOALS = 5;

const TASK_HELPER_TEXT =
  "Describe a result you can check, not work you'll do — e.g. Checkout handles expired cards, confirmed on staging.";

interface FormTaskRow {
  clientKey: string; // "t1", "t2", ... never changes in the session
  serverId: string | null; // used ONLY for PUT
  kind: "main" | "sub_goal" | "gtm";
  title: string;
  why: string;
  isAiDraft?: boolean;
  outdatedFinding?: boolean;
}

interface ActiveFinding {
  id: string;
  finding: Finding;
}

function serializeFormSnapshot(teamId: string, rows: FormTaskRow[]): string {
  const normalized = rows
    .filter((r) => r.kind === "main" || r.title.trim().length > 0)
    .map((r) => ({
      serverId: r.serverId ?? "",
      kind: r.kind,
      title: r.title.trim(),
      why: r.kind === "main" ? r.why.trim() : "",
    }));
  return JSON.stringify({ teamId, tasks: normalized });
}

function MyWeekRoutePage() {
  const { orgId, weekStart } = Route.useParams();
  return (
    <WeekWorkspace
      key={`${orgId}:${weekStart}`}
      orgId={orgId}
      weekStart={weekStart}
    />
  );
}

function WeekWorkspace({
  orgId,
  weekStart,
}: {
  orgId: string;
  weekStart: string;
}) {
  const queryClient = useQueryClient();
  const { user, memberships } = useUser();

  const currentMembership = memberships.find((m) => m.org.id === orgId);
  const orgRole = currentMembership?.role ?? "member";
  const isOrgAdminOrOwner = orgRole === "owner" || orgRole === "admin";

  const thisMonday = currentWeekStartUtc();
  const validMonday = isMondayUtc(weekStart);
  const weekWindow = getWeekWindowStatus(weekStart);
  const isPastWeek = weekWindow === "past";
  const isTooFarAhead = weekWindow === "too_far_ahead";

  // 1. Load user's plans for this week
  const listPlansQuery = useListPlans(
    orgId,
    { week: weekStart, mine: true, limit: 10 },
    {
      query: {
        enabled: validMonday,
        retry: false,
      },
    }
  );

  const [createdPlanId, setCreatedPlanId] = useState<string | null>(null);
  const planIdFromList = listPlansQuery.data?.items?.[0]?.id ?? null;
  const activePlanId = createdPlanId ?? planIdFromList;

  const planQuery = useGetPlan(orgId, activePlanId ?? "", {
    query: {
      enabled: validMonday && Boolean(activePlanId),
      retry: false,
    },
  });

  // 2. Load teams & filter to teams the current user actually belongs to
  const teamsQuery = useListTeams(
    orgId,
    { limit: 100 },
    {
      query: {
        enabled: validMonday,
        retry: false,
      },
    }
  );

  const allTeams = useMemo(
    () => teamsQuery.data?.items ?? [],
    [teamsQuery.data?.items]
  );
  const teamDetailQueries = useQueries({
    queries: isOrgAdminOrOwner
      ? allTeams.map((team) => ({
          ...getGetTeamQueryOptions(orgId, team.id, {
            query: { retry: false },
          }),
        }))
      : [],
  });

  const isTeamsLoading =
    teamsQuery.isLoading ||
    (isOrgAdminOrOwner && teamDetailQueries.some((q) => q.isLoading));

  const memberTeams: TeamResponse[] = useMemo(() => {
    if (!isOrgAdminOrOwner) {
      return allTeams;
    }
    if (!user) {
      return [];
    }
    return allTeams.filter((_team, idx) => {
      const detail = teamDetailQueries[idx]?.data;
      if (!detail) {
        return false;
      }
      return detail.members.some((m) => m.user.id === user.id);
    });
  }, [allTeams, isOrgAdminOrOwner, teamDetailQueries, user]);

  // 3. Form state with stable session client keys (t1, t2, ...)
  const nextKeyCounterRef = useRef(1);
  const allocClientKey = () => `t${nextKeyCounterRef.current++}`;

  const [isEditingNew, setIsEditingNew] = useState(false);
  const [userSelectedTeamId, setUserSelectedTeamId] = useState<string>("");
  const [rows, setRows] = useState<FormTaskRow[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const initializedPlanIdRef = useRef<string | null>(null);

  // Validation & error state
  const [formError, setFormError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  // AI Review & Draft state
  const [isReviewPending, setIsReviewPending] = useState(false);
  const [isReviewSlow, setIsReviewSlow] = useState(false);
  const [reviewResult, setReviewResult] = useState<PlanReview | null>(null);
  const [activeFindings, setActiveFindings] = useState<ActiveFinding[]>([]);
  const [aiErrorBanner, setAiErrorBanner] = useState<{
    code: string | null;
    error: unknown;
  } | null>(null);
  const [aiCooldownSeconds, setAiCooldownSeconds] = useState(0);
  const [aiCooldownReason, setAiCooldownReason] = useState<
    "rate_limit" | "cancel" | null
  >(null);

  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  const [draftNotesMeta, setDraftNotesMeta] = useState<{
    leftOut: string[];
    openQuestions: string[];
  } | null>(null);
  const [draftMetaOpen, setDraftMetaOpen] = useState(true);

  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  const reviewAbortRef = useRef<AbortController | null>(null);
  const reviewSlowTimerRef = useRef<number | null>(null);

  // Cooldown countdown effect (used for both 429 Retry-After and 5s Cancel cooldown)
  useEffect(() => {
    if (aiCooldownSeconds <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setAiCooldownSeconds((prev) => {
        if (prev <= 1) {
          setAiCooldownReason(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [aiCooldownSeconds]);

  useEffect(() => {
    return () => {
      if (reviewSlowTimerRef.current !== null) {
        window.clearTimeout(reviewSlowTimerRef.current);
      }
      reviewAbortRef.current?.abort();
    };
  }, []);

  const startAiCooldown = (
    seconds: number,
    reason: "rate_limit" | "cancel" = "rate_limit"
  ) => {
    setAiCooldownReason(reason);
    setAiCooldownSeconds(Math.max(1, Math.round(seconds)));
  };

  const planDetail = planQuery.data;
  const selectedTeamId =
    userSelectedTeamId || planDetail?.team_id || memberTeams[0]?.id || "";
  useEffect(() => {
    if (!planDetail) {
      return;
    }
    if (initializedPlanIdRef.current === planDetail.id) {
      return;
    }
    initializedPlanIdRef.current = planDetail.id;
    setUserSelectedTeamId(planDetail.team_id);

    const sortedTasks = [...planDetail.tasks].sort(
      (a, b) => a.position - b.position
    );
    const loadedRows: FormTaskRow[] = [];
    const existingMain = sortedTasks.find((t) => t.kind === "main");
    if (existingMain) {
      loadedRows.push({
        clientKey: allocClientKey(),
        serverId: existingMain.id,
        kind: "main",
        title: existingMain.title,
        why: existingMain.why ?? "",
      });
    } else {
      loadedRows.push({
        clientKey: allocClientKey(),
        serverId: null,
        kind: "main",
        title: "",
        why: "",
      });
    }

    for (const task of sortedTasks) {
      if (task.kind === "main") {
        continue;
      }
      loadedRows.push({
        clientKey: allocClientKey(),
        serverId: task.id,
        kind: task.kind,
        title: task.title,
        why: task.why ?? "",
      });
    }

    setRows(loadedRows);
    setSavedSnapshot(serializeFormSnapshot(planDetail.team_id, loadedRows));
  }, [planDetail]);

  const startBlankPlan = () => {
    const teamId = selectedTeamId || memberTeams[0]?.id || "";
    setUserSelectedTeamId(teamId);
    const initialRows: FormTaskRow[] = [
      {
        clientKey: allocClientKey(),
        serverId: null,
        kind: "main",
        title: "",
        why: "",
      },
    ];
    setRows(initialRows);
    setSavedSnapshot("");
    setIsEditingNew(true);
    setFormError(null);
    setRowErrors({});
  };

  const applyDraftFromNotes = (draft: PlanDraft) => {
    const teamId = selectedTeamId || memberTeams[0]?.id || "";
    setUserSelectedTeamId(teamId);

    const existingMainServerId =
      rows.find((r) => r.kind === "main")?.serverId ?? null;

    const nextRows: FormTaskRow[] = [
      {
        clientKey: allocClientKey(),
        serverId: existingMainServerId,
        kind: "main",
        title: (draft.main.title ?? "").slice(0, TITLE_MAX),
        why: (draft.main.why ?? "").slice(0, WHY_MAX),
        isAiDraft: true,
      },
      ...(draft.sub_goals ?? []).slice(0, MAX_SUB_GOALS).map((sg) => ({
        clientKey: allocClientKey(),
        serverId: null,
        kind: "sub_goal" as const,
        title: (sg.title ?? "").slice(0, TITLE_MAX),
        why: "",
        isAiDraft: true,
      })),
      ...(draft.gtm_goals ?? []).slice(0, MAX_GTM_GOALS).map((gtm) => ({
        clientKey: allocClientKey(),
        serverId: null,
        kind: "gtm" as const,
        title: (gtm.title ?? "").slice(0, TITLE_MAX),
        why: "",
        isAiDraft: true,
      })),
    ];

    setRows(nextRows);
    setIsEditingNew(true);
    setFormError(null);
    setRowErrors({});
    setReviewResult(null);
    setActiveFindings([]);

    const leftOut = draft.left_out ?? [];
    const openQuestions = draft.open_questions ?? [];
    if (leftOut.length > 0 || openQuestions.length > 0) {
      setDraftNotesMeta({ leftOut, openQuestions });
      setDraftMetaOpen(true);
    } else {
      setDraftNotesMeta(null);
    }
  };

  const isDraftEditable =
    !isPastWeek &&
    !isTooFarAhead &&
    (planDetail ? planDetail.status === "draft" : isEditingNew);

  const currentSnapshot = useMemo(
    () => serializeFormSnapshot(selectedTeamId, rows),
    [selectedTeamId, rows]
  );

  const hasAnyFormContent = useMemo(
    () =>
      rows.some((r) => r.title.trim().length > 0 || r.why.trim().length > 0),
    [rows]
  );

  const isDirty = useMemo(() => {
    if (!isDraftEditable) {
      return false;
    }
    if (!planDetail) {
      return hasAnyFormContent;
    }
    return currentSnapshot !== savedSnapshot;
  }, [
    isDraftEditable,
    planDetail,
    hasAnyFormContent,
    currentSnapshot,
    savedSnapshot,
  ]);

  // Warn before leaving page with unsaved changes
  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useBlocker({
    shouldBlockFn: () => {
      if (!isDirty) {
        return false;
      }
      return !window.confirm(
        "You have unsaved changes to your weekly plan. Leave without saving?"
      );
    },
  });

  // Mutations
  const createPlanMutation = useCreatePlan();
  const updatePlanMutation = useUpdatePlan();
  const submitPlanMutation = useSubmitPlan();
  const withdrawPlanMutation = useWithdrawPlan();
  const approvePlanMutation = useApprovePlan({
    mutation: { meta: { skipGlobalErrorToast: true } },
  });
  const closePlanMutation = useClosePlan();
  const tickTaskMutation = useTickTask();

  const updateRow = (
    clientKey: string,
    updater: (row: FormTaskRow) => FormTaskRow
  ) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.clientKey !== clientKey) {
          return row;
        }
        const updated = updater(row);
        const hasFinding = activeFindings.some(
          (af) => af.finding.task_ref === clientKey
        );
        return {
          ...updated,
          isAiDraft: false,
          outdatedFinding: hasFinding ? true : updated.outdatedFinding,
        };
      })
    );
    setRowErrors((prev) => {
      if (!prev[clientKey]) {
        return prev;
      }
      const next = { ...prev };
      delete next[clientKey];
      return next;
    });
    setFormError(null);
  };

  const addTaskRow = (kind: "sub_goal" | "gtm") => {
    const count = rows.filter((r) => r.kind === kind).length;
    const limit = kind === "sub_goal" ? MAX_SUB_GOALS : MAX_GTM_GOALS;
    if (count >= limit) {
      return;
    }
    setRows((prev) => [
      ...prev,
      {
        clientKey: allocClientKey(),
        serverId: null,
        kind,
        title: "",
        why: "",
      },
    ]);
  };

  const removeTaskRow = (clientKey: string) => {
    setRows((prev) => prev.filter((r) => r.clientKey !== clientKey));
    setActiveFindings((prev) =>
      prev.filter((af) => af.finding.task_ref !== clientKey)
    );
  };

  // Validate rows before Save or Submit
  const validateForSave = (requireMainWhy: boolean): boolean => {
    const nextRowErrors: Record<string, string> = {};
    let general: string | null = null;

    if (!selectedTeamId) {
      setFormError("Please select a team for this plan.");
      return false;
    }

    const mainRow = rows.find((r) => r.kind === "main");
    const mainTitle = mainRow?.title.trim() ?? "";
    const mainWhy = mainRow?.why.trim() ?? "";

    if (requireMainWhy) {
      if (!mainTitle && !mainWhy && mainRow) {
        nextRowErrors[mainRow.clientKey] =
          "Enter a main task title and explain why it matters before submitting.";
        general = "Missing main task title and 'why it matters' explanation.";
      } else if (!mainTitle && mainRow) {
        nextRowErrors[mainRow.clientKey] =
          "Enter a main task title before submitting.";
        general = "Missing main task title.";
      } else if (!mainWhy && mainRow) {
        nextRowErrors[mainRow.clientKey] =
          "Explain why the main task matters before submitting.";
        general = "Missing 'why it matters' on your main task.";
      }
    } else if (mainRow && !mainTitle && mainWhy) {
      nextRowErrors[mainRow.clientKey] =
        "Add a title for your main task, or clear the 'why' field.";
    }

    for (const row of rows) {
      if (row.kind !== "main" && row.title.trim().length === 0) {
        nextRowErrors[row.clientKey] =
          "Enter a checkable result or remove this empty row.";
      }
      if (row.title.length > TITLE_MAX) {
        nextRowErrors[row.clientKey] =
          `Title must be at most ${TITLE_MAX} characters.`;
      }
      if (row.kind === "main" && row.why.length > WHY_MAX) {
        nextRowErrors[row.clientKey] =
          `'Why' must be at most ${WHY_MAX} characters.`;
      }
    }

    setRowErrors(nextRowErrors);
    setFormError(general);
    return Object.keys(nextRowErrors).length === 0 && !general;
  };

  // Save handler that preserves clientKey ("t1", "t2", ...) across POST/PUT
  const performSave = async (
    requireMainWhy = false
  ): Promise<PlanDetailResponse | null> => {
    if (!validateForSave(requireMainWhy)) {
      return null;
    }

    const activeRows = rows.filter(
      (r) => r.kind !== "main" || r.title.trim().length > 0
    );
    const tasksInput: TaskInput[] = activeRows.map((r, idx) => ({
      id: r.serverId ?? undefined,
      kind: r.kind,
      title: r.title.trim(),
      why: r.kind === "main" ? r.why.trim() || null : null,
      position: idx,
    }));

    try {
      let saved: PlanDetailResponse;
      if (!planDetail) {
        saved = await createPlanMutation.mutateAsync({
          orgId,
          data: {
            week_start: weekStart,
            team_id: selectedTeamId,
            tasks: tasksInput,
          },
        });
      } else {
        saved = await updatePlanMutation.mutateAsync({
          orgId,
          planId: planDetail.id,
          data: {
            team_id: selectedTeamId,
            tasks: tasksInput,
          },
        });
      }

      // Mark initialized so the useEffect does not overwrite our clientKeys!
      initializedPlanIdRef.current = saved.id;
      setCreatedPlanId(saved.id);

      const sortedServerTasks = [...saved.tasks].sort(
        (a, b) => a.position - b.position
      );

      // Map returned server task IDs back onto the existing rows in order,
      // keeping every row's clientKey ("t1", "t2", ...) unchanged!
      let activeIdx = 0;
      const updatedRows = rows.map((row) => {
        if (row.kind === "main" && row.title.trim().length === 0) {
          return { ...row, serverId: null };
        }
        const matchedServerTask = sortedServerTasks[activeIdx++];
        return {
          ...row,
          serverId: matchedServerTask?.id ?? row.serverId,
          title: row.title.trim(),
          why: row.kind === "main" ? row.why.trim() : "",
        };
      });

      setRows(updatedRows);
      setSavedSnapshot(serializeFormSnapshot(saved.team_id, updatedRows));
      setFormError(null);
      setRowErrors({});

      queryClient.setQueryData(getGetPlanQueryKey(orgId, saved.id), saved);
      void queryClient.invalidateQueries({
        queryKey: getListPlansQueryKey(orgId),
      });

      return saved;
    } catch (err) {
      const { fieldErrors, generalMessage } = parseValidationErrors(err);
      const msg =
        generalMessage ||
        Object.values(fieldErrors).join(". ") ||
        getApiErrorMessage(err);
      setFormError(msg);
      toast.error(msg);
      return null;
    }
  };

  const handleSaveClick = async () => {
    const saved = await performSave(false);
    if (saved) {
      toast.success("Plan saved.");
    }
  };

  const handleSubmitClick = async () => {
    if (!validateForSave(true)) {
      return;
    }
    let targetPlanId = planDetail?.id ?? null;
    if (!targetPlanId || isDirty) {
      const saved = await performSave(true);
      if (!saved) {
        return;
      }
      targetPlanId = saved.id;
    }

    try {
      const submitted = await submitPlanMutation.mutateAsync({
        orgId,
        planId: targetPlanId,
      });
      queryClient.setQueryData(
        getGetPlanQueryKey(orgId, submitted.id),
        submitted
      );
      void queryClient.invalidateQueries({
        queryKey: getListPlansQueryKey(orgId),
      });
      toast.success("Plan submitted for approval.");
    } catch (err) {
      const msg = getApiErrorMessage(err);
      setFormError(msg);
      toast.error(msg);
    }
  };

  const handleWithdrawClick = async () => {
    if (!planDetail) {
      return;
    }
    try {
      const withdrawn = await withdrawPlanMutation.mutateAsync({
        orgId,
        planId: planDetail.id,
      });
      queryClient.setQueryData(
        getGetPlanQueryKey(orgId, withdrawn.id),
        withdrawn
      );
      void queryClient.invalidateQueries({
        queryKey: getListPlansQueryKey(orgId),
      });
      toast.success("Plan withdrawn back to draft.");
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const handleSelfApproveClick = async () => {
    if (!planDetail) {
      return;
    }
    try {
      const approved = await approvePlanMutation.mutateAsync({
        orgId,
        planId: planDetail.id,
      });
      queryClient.setQueryData(
        getGetPlanQueryKey(orgId, approved.id),
        approved
      );
      void queryClient.invalidateQueries({
        queryKey: getListPlansQueryKey(orgId),
      });
      toast.success("Approved. No other approver was available.");
    } catch (err) {
      const code = getApiErrorCode(err);
      if (code === "forbidden") {
        toast.error("Someone else needs to approve your plan");
        return;
      }
      toast.error(getApiErrorMessage(err));
    }
  };

  const handleTickTask = async (
    taskId: string,
    currentStatus: "todo" | "done"
  ) => {
    if (!planDetail || isPastWeek) {
      return;
    }
    const nextStatus = currentStatus === "done" ? "todo" : "done";
    const planKey = getGetPlanQueryKey(orgId, planDetail.id);
    const previous = queryClient.getQueryData<PlanDetailResponse>(planKey);

    if (previous) {
      queryClient.setQueryData<PlanDetailResponse>(planKey, {
        ...previous,
        tasks: previous.tasks.map((t) =>
          t.id === taskId ? { ...t, status: nextStatus } : t
        ),
      });
    }

    try {
      await tickTaskMutation.mutateAsync({
        orgId,
        taskId,
        data: { status: nextStatus },
      });
      void queryClient.invalidateQueries({
        queryKey: getListPlansQueryKey(orgId),
      });
    } catch (err) {
      if (previous) {
        queryClient.setQueryData<PlanDetailResponse>(planKey, previous);
      }
      toast.error(getApiErrorMessage(err));
    }
  };

  const handleCloseWeek = async (shipped: boolean) => {
    if (!planDetail) {
      return;
    }
    try {
      const closed = await closePlanMutation.mutateAsync({
        orgId,
        planId: planDetail.id,
        data: { shipped },
      });
      setCloseDialogOpen(false);
      queryClient.setQueryData(getGetPlanQueryKey(orgId, closed.id), closed);
      void queryClient.invalidateQueries({
        queryKey: getListPlansQueryKey(orgId),
      });
      toast.success(
        shipped
          ? "Week closed — marked as shipped."
          : "Week closed — marked as not shipped."
      );
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  // AI Review execution
  const clearReviewSlowTimer = () => {
    if (reviewSlowTimerRef.current !== null) {
      window.clearTimeout(reviewSlowTimerRef.current);
      reviewSlowTimerRef.current = null;
    }
    setIsReviewSlow(false);
  };

  const handleCancelReview = () => {
    reviewAbortRef.current?.abort();
    reviewAbortRef.current = null;
    clearReviewSlowTimer();
    setIsReviewPending(false);
    setAiErrorBanner(null);
    startAiCooldown(5, "cancel");
  };

  const reviewableTasks: TaskIn[] = useMemo(() => {
    return rows
      .filter((r) => r.title.trim().length > 0)
      .map((r) => ({
        ref: r.clientKey,
        kind: r.kind,
        title: r.title.trim().slice(0, TITLE_MAX),
        why: r.kind === "main" ? r.why.trim().slice(0, WHY_MAX) || null : null,
      }));
  }, [rows]);

  const handleReviewPlanClick = async () => {
    if (
      isReviewPending ||
      aiCooldownSeconds > 0 ||
      reviewableTasks.length === 0
    ) {
      return;
    }

    setAiErrorBanner(null);
    setIsReviewPending(true);
    setIsReviewSlow(false);

    const controller = new AbortController();
    reviewAbortRef.current = controller;
    reviewSlowTimerRef.current = window.setTimeout(() => {
      setIsReviewSlow(true);
    }, 25000);

    try {
      const review = await planReview(
        orgId,
        {
          week_start: weekStart,
          tasks: reviewableTasks,
        },
        { signal: controller.signal }
      );
      if (controller.signal.aborted) {
        return;
      }
      clearReviewSlowTimer();
      setIsReviewPending(false);
      setReviewResult(review);
      setActiveFindings(
        (review.findings ?? []).map((f, idx) => ({
          id: `f-${Date.now()}-${idx}`,
          finding: f,
        }))
      );
      setRows((prev) => prev.map((r) => ({ ...r, outdatedFinding: false })));
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      clearReviewSlowTimer();
      setIsReviewPending(false);
      const code = getApiErrorCode(err);
      setAiErrorBanner({ code, error: err });
      if (code === "ai_rate_limited") {
        startAiCooldown(getRetryAfterSeconds(err, 30), "rate_limit");
      }
    }
  };

  const handleDismissFinding = (findingId: string) => {
    setActiveFindings((prev) => prev.filter((af) => af.id !== findingId));
  };

  const getApplyDisabledReason = (finding: Finding): string | null => {
    if (finding.action === "add_task") {
      const targetKind = finding.suggested_kind ?? "gtm";
      const count = rows.filter((r) => r.kind === targetKind).length;
      const max = targetKind === "sub_goal" ? MAX_SUB_GOALS : MAX_GTM_GOALS;
      if (count >= max) {
        return `Maximum of ${max} ${targetKind === "gtm" ? "go-to-market goals" : "sub-goals"} reached`;
      }
    }
    return null;
  };

  const handleApplyFinding = (activeFinding: ActiveFinding) => {
    const { id, finding } = activeFinding;
    if (getApplyDisabledReason(finding)) {
      return;
    }

    if (finding.action === "rewrite_title" && finding.task_ref) {
      setRows((prev) =>
        prev.map((r) =>
          r.clientKey === finding.task_ref
            ? {
                ...r,
                title: finding.suggested_rewrite.slice(0, TITLE_MAX),
                isAiDraft: false,
                outdatedFinding: false,
              }
            : r
        )
      );
    } else if (finding.action === "rewrite_why" && finding.task_ref) {
      setRows((prev) =>
        prev.map((r) =>
          r.clientKey === finding.task_ref
            ? {
                ...r,
                why: finding.suggested_rewrite.slice(0, WHY_MAX),
                isAiDraft: false,
                outdatedFinding: false,
              }
            : r
        )
      );
    } else if (finding.action === "add_task") {
      const targetKind = finding.suggested_kind ?? "gtm";
      setRows((prev) => [
        ...prev,
        {
          clientKey: allocClientKey(),
          serverId: null,
          kind: targetKind,
          title: finding.suggested_rewrite.slice(0, TITLE_MAX),
          why: "",
          isAiDraft: false,
        },
      ]);
    }

    handleDismissFinding(id);
  };

  const mainRow = rows.find((r) => r.kind === "main");
  const subGoalRows = rows.filter((r) => r.kind === "sub_goal");
  const gtmGoalRows = rows.filter((r) => r.kind === "gtm");

  const planLevelFindings = activeFindings.filter((af) => !af.finding.task_ref);
  const findingsForKey = (clientKey: string) =>
    activeFindings.filter((af) => af.finding.task_ref === clientKey);

  const isLoadingInitial =
    listPlansQuery.isLoading ||
    (Boolean(activePlanId) && planQuery.isLoading) ||
    isTeamsLoading;

  const isSavingOrSubmitting =
    createPlanMutation.isPending ||
    updatePlanMutation.isPending ||
    submitPlanMutation.isPending;

  if (!validMonday) {
    return (
      <div className="rounded-xl border bg-background p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto mb-2 size-8 text-amber-600" />
        <h1 className="text-lg font-semibold text-foreground">
          Plans start on Mondays
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {weekStart} is not a valid Monday date in UTC.
        </p>
        <div className="mt-4">
          <Button
            size="sm"
            render={
              <Link
                to="/$orgId/week/$weekStart"
                params={{ orgId, weekStart: thisMonday }}
              />
            }
          >
            Go to this week ({thisMonday})
          </Button>
        </div>
      </div>
    );
  }

  return (
    <PageQueryGate
      error={listPlansQuery.error || planQuery.error || teamsQuery.error}
      orgId={orgId}
    >
      <div className="space-y-6">
        <WeekBar
          weekStart={weekStart}
          renderWeekLink={(targetMonday) => (
            <Link
              to="/$orgId/week/$weekStart"
              params={{ orgId, weekStart: targetMonday }}
            />
          )}
        />

        {/* Past week read-only notice */}
        {isPastWeek && (
          <div
            role="note"
            className="flex items-center gap-2.5 rounded-xl border border-slate-300 bg-slate-100/80 px-4 py-3 text-sm text-slate-800"
          >
            <Clock className="size-4 shrink-0 text-slate-600" />
            <span>This week has passed and is read-only.</span>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoadingInitial ? (
          <div className="space-y-4 rounded-xl border bg-background p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-8 w-28" />
            </div>
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ) : !planDetail && !isEditingNew ? (
          /* No plan yet for this week */
          isPastWeek ? (
            <div className="rounded-xl border bg-background p-8 text-center shadow-sm">
              <CalendarDays className="mx-auto mb-3 size-8 text-muted-foreground" />
              <h2 className="text-base font-semibold text-foreground">
                No plan was recorded for this week
              </h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Past weeks are read-only and cannot be started retroactively.
              </p>
            </div>
          ) : isTooFarAhead ? (
            <div className="rounded-xl border bg-background p-8 text-center shadow-sm">
              <CalendarDays className="mx-auto mb-3 size-8 text-muted-foreground" />
              <h2 className="text-base font-semibold text-foreground">
                Too far ahead to plan
              </h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Plans can only be created for this week and up to 4 weeks ahead.
              </p>
            </div>
          ) : memberTeams.length === 0 ? (
            <div className="rounded-xl border bg-background p-8 text-center shadow-sm">
              <Users className="mx-auto mb-3 size-8 text-muted-foreground" />
              <h2 className="text-base font-semibold text-foreground">
                You&apos;re not on a team yet. Ask an org admin to add you.
              </h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Every weekly plan is reviewed by a team lead. Once you&apos;re
                added to a team, you can start your weekly plan here.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border bg-background p-8 text-center shadow-sm">
              <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CalendarDays className="size-5" />
              </div>
              <h2 className="text-base font-semibold text-foreground">
                No plan for this week yet
              </h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Commit to one main checkable result to ship by Friday, plus any
                supporting sub-goals and go-to-market tasks.
              </p>

              {memberTeams.length > 1 && (
                <div className="mx-auto mt-4 flex max-w-xs flex-col items-center gap-1.5">
                  <Label htmlFor="empty-team-select" className="text-xs">
                    Team
                  </Label>
                  <NativeSelect
                    id="empty-team-select"
                    value={selectedTeamId}
                    onChange={(e) => setUserSelectedTeamId(e.target.value)}
                    className="w-full"
                  >
                    {memberTeams.map((team) => (
                      <NativeSelectOption key={team.id} value={team.id}>
                        {team.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <Button type="button" onClick={startBlankPlan}>
                  <Plus className="size-4" />
                  Start your plan
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={aiCooldownSeconds > 0}
                  onClick={() => setDraftDialogOpen(true)}
                >
                  <Sparkles className="size-4 text-primary" />
                  {aiCooldownSeconds > 0
                    ? `Draft from notes (${aiCooldownSeconds}s)`
                    : "Draft from notes"}
                </Button>
              </div>
            </div>
          )
        ) : isDraftEditable ? (
          /* Draft Editor (only when status === "draft" or new, and NOT a past week) */
          <div className="space-y-6">
            {/* Sent-back comment banner */}
            {planDetail?.decision_comment && (
              <div
                role="alert"
                className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <MessageSquareWarning className="mt-0.5 size-5 shrink-0 text-amber-700" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">
                      Sent back for changes
                      {planDetail.decided_by
                        ? ` by ${planDetail.decided_by.user.name}`
                        : ""}
                    </p>
                    <p className="text-sm whitespace-pre-wrap text-amber-900">
                      {planDetail.decision_comment}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Status & Actions Header */}
            <div className="flex flex-col gap-3 rounded-xl border bg-background p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2.5">
                <PlanStatusBadge
                  status="draft"
                  hasDecisionComment={Boolean(planDetail?.decision_comment)}
                />

                <span
                  className={cn(
                    "text-xs font-medium",
                    isDirty || !planDetail
                      ? "text-amber-700"
                      : "text-emerald-700"
                  )}
                >
                  {isDirty || !planDetail ? "Unsaved changes" : "Saved"}
                </span>

                {memberTeams.length > 1 ? (
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="draft-team-select"
                      className="text-xs text-muted-foreground"
                    >
                      Team:
                    </Label>
                    <NativeSelect
                      id="draft-team-select"
                      size="sm"
                      value={selectedTeamId}
                      onChange={(e) => setUserSelectedTeamId(e.target.value)}
                    >
                      {memberTeams.map((t) => (
                        <NativeSelectOption key={t.id} value={t.id}>
                          {t.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                ) : memberTeams[0] ? (
                  <span className="text-xs text-muted-foreground">
                    Team:{" "}
                    <strong className="font-medium text-foreground">
                      {memberTeams[0].name}
                    </strong>
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isReviewPending || aiCooldownSeconds > 0}
                  onClick={() => setDraftDialogOpen(true)}
                >
                  <FileText className="size-3.5" />
                  {aiCooldownSeconds > 0
                    ? `Draft from notes (${aiCooldownSeconds}s)`
                    : "Draft from notes"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    isReviewPending ||
                    aiCooldownSeconds > 0 ||
                    reviewableTasks.length === 0
                  }
                  onClick={handleReviewPlanClick}
                >
                  <Sparkles className="size-3.5 text-primary" />
                  {isReviewPending
                    ? "Reviewing..."
                    : aiCooldownSeconds > 0
                      ? `Review my plan (${aiCooldownSeconds}s)`
                      : "Review my plan"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSavingOrSubmitting}
                  onClick={handleSaveClick}
                >
                  {createPlanMutation.isPending ||
                  updatePlanMutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  Save
                </Button>

                <Button
                  type="button"
                  size="sm"
                  disabled={isSavingOrSubmitting}
                  onClick={handleSubmitClick}
                >
                  {submitPlanMutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Send className="size-3.5" />
                  )}
                  Submit for approval
                </Button>
              </div>
            </div>

            {/* Form validation / API error banner */}
            {formError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* AI Error Banner */}
            {aiErrorBanner && !isReviewPending && (
              <div
                role="alert"
                className="flex items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-700" />
                  <p>
                    {getAiErrorMessage(
                      aiErrorBanner.error,
                      aiErrorBanner.code === "ai_rate_limited" &&
                        aiCooldownReason === "rate_limit"
                        ? aiCooldownSeconds || 30
                        : undefined
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setAiErrorBanner(null)}
                >
                  Dismiss
                </Button>
              </div>
            )}

            {/* AI Review Loading Skeleton */}
            {isReviewPending && (
              <div className="space-y-2">
                <AiReviewSkeleton />
                {isReviewSlow && (
                  <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
                    <span>Still working...</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleCancelReview}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* AI Review Verdict + Summary + Plan-level findings */}
            {reviewResult && !isReviewPending && (
              <div className="space-y-3 rounded-xl border bg-background p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">
                      AI Plan Review
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        reviewResult.verdict === "approve"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-amber-300 bg-amber-50 text-amber-800"
                      }
                    >
                      {reviewResult.verdict === "approve"
                        ? "Verdict: Ready to approve"
                        : "Verdict: Needs adjustment"}
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setReviewResult(null);
                      setActiveFindings([]);
                    }}
                  >
                    Clear review
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {reviewResult.summary}
                </p>

                {planLevelFindings.length > 0 && (
                  <div className="space-y-2.5 pt-1">
                    {planLevelFindings.map((af) => (
                      <FindingCard
                        key={af.id}
                        finding={af.finding}
                        applyDisabledReason={getApplyDisabledReason(af.finding)}
                        onApply={() => handleApplyFinding(af)}
                        onDismiss={() => handleDismissFinding(af.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Collapsible "What the AI left out / questions" panel */}
            {draftNotesMeta && (
              <Collapsible
                open={draftMetaOpen}
                onOpenChange={setDraftMetaOpen}
                className="rounded-xl border bg-background p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <CollapsibleTrigger
                    render={
                      <button
                        type="button"
                        className="flex flex-1 items-center justify-between text-left text-sm font-semibold text-foreground"
                      />
                    }
                  >
                    <span className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary" />
                      What the AI left out / questions
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-4 text-muted-foreground transition-transform",
                        draftMetaOpen && "rotate-180"
                      )}
                    />
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="mt-3 space-y-3 text-sm">
                  {draftNotesMeta.leftOut.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Left out of this week
                      </p>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                        {draftNotesMeta.leftOut.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {draftNotesMeta.openQuestions.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Open questions
                      </p>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                        {draftNotesMeta.openQuestions.map((q, idx) => (
                          <li key={idx}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Main Task Section */}
            {mainRow && (
              <section className="space-y-4 rounded-xl border bg-background p-4 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-foreground">
                        Main task
                      </h2>
                      <Badge variant="outline" className="text-xs">
                        Required
                      </Badge>
                      {mainRow.isAiDraft && (
                        <Badge
                          variant="outline"
                          className="border-indigo-300 bg-indigo-50 text-xs text-indigo-800"
                        >
                          AI draft
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      The single most important thing you commit to shipping by
                      Friday.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`task-title-${mainRow.clientKey}`}>
                        What will be true by Friday?
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        {mainRow.title.length}/{TITLE_MAX}
                      </span>
                    </div>
                    <Input
                      id={`task-title-${mainRow.clientKey}`}
                      value={mainRow.title}
                      maxLength={TITLE_MAX}
                      aria-invalid={Boolean(rowErrors[mainRow.clientKey])}
                      onChange={(e) =>
                        updateRow(mainRow.clientKey, (r) => ({
                          ...r,
                          title: e.target.value.slice(0, TITLE_MAX),
                        }))
                      }
                      placeholder="Checkout handles expired cards, confirmed on staging"
                    />
                    <p className="text-xs text-muted-foreground">
                      {TASK_HELPER_TEXT}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`task-why-${mainRow.clientKey}`}>
                        Why this matters
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        {mainRow.why.length}/{WHY_MAX}
                      </span>
                    </div>
                    <Textarea
                      id={`task-why-${mainRow.clientKey}`}
                      value={mainRow.why}
                      maxLength={WHY_MAX}
                      aria-invalid={Boolean(rowErrors[mainRow.clientKey])}
                      onChange={(e) =>
                        updateRow(mainRow.clientKey, (r) => ({
                          ...r,
                          why: e.target.value.slice(0, WHY_MAX),
                        }))
                      }
                      placeholder="Failed renewals are our top support ticket this month"
                      className="min-h-20 resize-y"
                    />
                  </div>

                  {rowErrors[mainRow.clientKey] && (
                    <p className="text-xs font-medium text-destructive">
                      {rowErrors[mainRow.clientKey]}
                    </p>
                  )}

                  {/* Inline AI findings for main task */}
                  {findingsForKey(mainRow.clientKey).length > 0 && (
                    <div className="space-y-2.5 pt-1">
                      {findingsForKey(mainRow.clientKey).map((af) => (
                        <FindingCard
                          key={af.id}
                          finding={af.finding}
                          isOutdated={mainRow.outdatedFinding}
                          applyDisabledReason={getApplyDisabledReason(
                            af.finding
                          )}
                          onApply={() => handleApplyFinding(af)}
                          onDismiss={() => handleDismissFinding(af.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Sub-goals Section */}
            <section className="space-y-4 rounded-xl border bg-background p-4 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">
                      Sub-goals
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      ({subGoalRows.length}/{MAX_SUB_GOALS})
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Supporting engineering deliverables that fit inside this
                    week.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={subGoalRows.length >= MAX_SUB_GOALS}
                  onClick={() => addTaskRow("sub_goal")}
                >
                  <Plus className="size-3.5" />
                  Add sub-goal
                </Button>
              </div>

              {subGoalRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No sub-goals added. Keep the week light or add up to{" "}
                  {MAX_SUB_GOALS} supporting results.
                </p>
              ) : (
                <div className="space-y-4">
                  {subGoalRows.map((row, idx) => {
                    const rowFindings = findingsForKey(row.clientKey);
                    return (
                      <div
                        key={row.clientKey}
                        className="space-y-2 rounded-lg border bg-muted/20 p-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`task-title-${row.clientKey}`}>
                              Sub-goal {idx + 1}
                            </Label>
                            {row.isAiDraft && (
                              <Badge
                                variant="outline"
                                className="border-indigo-300 bg-indigo-50 text-xs text-indigo-800"
                              >
                                AI draft
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {row.title.length}/{TITLE_MAX}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove sub-goal ${idx + 1}`}
                              onClick={() => removeTaskRow(row.clientKey)}
                            >
                              <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                        </div>

                        <Input
                          id={`task-title-${row.clientKey}`}
                          value={row.title}
                          maxLength={TITLE_MAX}
                          aria-invalid={Boolean(rowErrors[row.clientKey])}
                          onChange={(e) =>
                            updateRow(row.clientKey, (r) => ({
                              ...r,
                              title: e.target.value.slice(0, TITLE_MAX),
                            }))
                          }
                          placeholder="Checkout handles expired cards, confirmed on staging"
                        />
                        <p className="text-xs text-muted-foreground">
                          {TASK_HELPER_TEXT}
                        </p>

                        {rowErrors[row.clientKey] && (
                          <p className="text-xs font-medium text-destructive">
                            {rowErrors[row.clientKey]}
                          </p>
                        )}

                        {rowFindings.length > 0 && (
                          <div className="space-y-2 pt-1">
                            {rowFindings.map((af) => (
                              <FindingCard
                                key={af.id}
                                finding={af.finding}
                                isOutdated={row.outdatedFinding}
                                applyDisabledReason={getApplyDisabledReason(
                                  af.finding
                                )}
                                onApply={() => handleApplyFinding(af)}
                                onDismiss={() => handleDismissFinding(af.id)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Go-to-market Goals Section */}
            <section className="space-y-4 rounded-xl border bg-background p-4 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">
                      Go-to-market goals
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      ({gtmGoalRows.length}/{MAX_GTM_GOALS})
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Rollout, analytics, changelog, docs, or customer-facing
                    checks.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={gtmGoalRows.length >= MAX_GTM_GOALS}
                  onClick={() => addTaskRow("gtm")}
                >
                  <Plus className="size-3.5" />
                  Add GTM goal
                </Button>
              </div>

              {gtmGoalRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No go-to-market goals added yet. Add up to {MAX_GTM_GOALS}{" "}
                  launch, changelog, or analytics checks.
                </p>
              ) : (
                <div className="space-y-4">
                  {gtmGoalRows.map((row, idx) => {
                    const rowFindings = findingsForKey(row.clientKey);
                    return (
                      <div
                        key={row.clientKey}
                        className="space-y-2 rounded-lg border bg-muted/20 p-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`task-title-${row.clientKey}`}>
                              GTM goal {idx + 1}
                            </Label>
                            {row.isAiDraft && (
                              <Badge
                                variant="outline"
                                className="border-indigo-300 bg-indigo-50 text-xs text-indigo-800"
                              >
                                AI draft
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {row.title.length}/{TITLE_MAX}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove GTM goal ${idx + 1}`}
                              onClick={() => removeTaskRow(row.clientKey)}
                            >
                              <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                        </div>

                        <Input
                          id={`task-title-${row.clientKey}`}
                          value={row.title}
                          maxLength={TITLE_MAX}
                          aria-invalid={Boolean(rowErrors[row.clientKey])}
                          onChange={(e) =>
                            updateRow(row.clientKey, (r) => ({
                              ...r,
                              title: e.target.value.slice(0, TITLE_MAX),
                            }))
                          }
                          placeholder="Checkout handles expired cards, confirmed on staging"
                        />
                        <p className="text-xs text-muted-foreground">
                          {TASK_HELPER_TEXT}
                        </p>

                        {rowErrors[row.clientKey] && (
                          <p className="text-xs font-medium text-destructive">
                            {rowErrors[row.clientKey]}
                          </p>
                        )}

                        {rowFindings.length > 0 && (
                          <div className="space-y-2 pt-1">
                            {rowFindings.map((af) => (
                              <FindingCard
                                key={af.id}
                                finding={af.finding}
                                isOutdated={row.outdatedFinding}
                                applyDisabledReason={getApplyDisabledReason(
                                  af.finding
                                )}
                                onApply={() => handleApplyFinding(af)}
                                onDismiss={() => handleDismissFinding(af.id)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        ) : planDetail ? (
          /* Non-editable or non-draft plan view (submitted, approved, done, or any past week) */
          <ReadOnlyOrActivePlanView
            plan={planDetail}
            allTeams={allTeams}
            isPastWeek={isPastWeek}
            isOrgAdminOrOwner={isOrgAdminOrOwner}
            onWithdraw={handleWithdrawClick}
            isWithdrawing={withdrawPlanMutation.isPending}
            onSelfApprove={handleSelfApproveClick}
            isApproving={approvePlanMutation.isPending}
            onTickTask={handleTickTask}
            onOpenCloseDialog={() => setCloseDialogOpen(true)}
          />
        ) : null}
      </div>

      {/* Draft From Notes Dialog */}
      <DraftFromNotesDialog
        open={draftDialogOpen}
        onOpenChange={setDraftDialogOpen}
        orgId={orgId}
        weekStart={weekStart}
        hasExistingContent={hasAnyFormContent}
        cooldownSeconds={aiCooldownSeconds}
        onStartCooldown={(secs) => startAiCooldown(secs, "rate_limit")}
        onDraftReady={applyDraftFromNotes}
      />

      {/* Close the week Dialog */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Close the week</DialogTitle>
            <DialogDescription>
              Did your main task ship? Once you close the week, this plan
              becomes read-only.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2.5 py-2 sm:flex-row">
            <Button
              type="button"
              className="flex-1"
              disabled={closePlanMutation.isPending}
              onClick={() => handleCloseWeek(true)}
            >
              <CheckCircle2 className="size-4" />
              Yes, it shipped
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={closePlanMutation.isPending}
              onClick={() => handleCloseWeek(false)}
            >
              <XCircle className="size-4" />
              No, it didn&apos;t ship
            </Button>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={closePlanMutation.isPending}
              onClick={() => setCloseDialogOpen(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageQueryGate>
  );
}

interface ReadOnlyOrActivePlanViewProps {
  plan: PlanDetailResponse;
  allTeams: TeamResponse[];
  isPastWeek: boolean;
  isOrgAdminOrOwner: boolean;
  onWithdraw: () => void;
  isWithdrawing: boolean;
  onSelfApprove: () => void;
  isApproving: boolean;
  onTickTask: (taskId: string, currentStatus: "todo" | "done") => void;
  onOpenCloseDialog: () => void;
}

function ReadOnlyOrActivePlanView({
  plan,
  allTeams,
  isPastWeek,
  isOrgAdminOrOwner,
  onWithdraw,
  isWithdrawing,
  onSelfApprove,
  isApproving,
  onTickTask,
  onOpenCloseDialog,
}: ReadOnlyOrActivePlanViewProps) {
  const teamName =
    allTeams.find((t) => t.id === plan.team_id)?.name ?? "Assigned team";
  const canTick = plan.status === "approved" && !isPastWeek;

  const statusNote =
    plan.status === "submitted" ? (
      <span className="text-xs font-medium text-amber-800">
        Waiting for your team lead or an org admin
      </span>
    ) : null;

  const actions = !isPastWeek ? (
    <>
      {plan.status === "submitted" && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isWithdrawing || isApproving}
            onClick={onWithdraw}
          >
            <Undo2 className="size-3.5" />
            {isWithdrawing ? "Withdrawing..." : "Withdraw"}
          </Button>
          {isOrgAdminOrOwner && (
            <Button
              type="button"
              size="sm"
              disabled={isApproving || isWithdrawing}
              onClick={onSelfApprove}
            >
              <Check className="size-3.5" />
              {isApproving ? "Approving..." : "Approve"}
            </Button>
          )}
        </>
      )}

      {plan.status === "approved" && (
        <Button type="button" size="sm" onClick={onOpenCloseDialog}>
          <CheckCircle2 className="size-3.5" />
          Close the week
        </Button>
      )}
    </>
  ) : null;

  return (
    <PlanReadOnlyView
      plan={plan}
      teamName={teamName}
      canTick={canTick}
      onTickTask={onTickTask}
      statusNote={statusNote}
      actions={actions}
    />
  );
}
