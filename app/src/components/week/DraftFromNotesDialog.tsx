import { useEffect, useRef, useState } from "react";
import { AlertCircle, FileText, Loader2, Sparkles } from "lucide-react";
import { planDraft } from "@/api/endpoints/ai/ai";
import type { PlanDraft } from "@/api/model";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getAiErrorMessage,
  getApiErrorCode,
  getRetryAfterSeconds,
} from "@/lib/api-errors";

const NOTES_MAX_LENGTH = 4000;

export interface DraftFromNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  weekStart: string;
  hasExistingContent: boolean;
  cooldownSeconds: number;
  onStartCooldown: (seconds: number) => void;
  onDraftReady: (draft: PlanDraft) => void;
}

export function DraftFromNotesDialog({
  open,
  onOpenChange,
  orgId,
  weekStart,
  hasExistingContent,
  cooldownSeconds,
  onStartCooldown,
  onDraftReady,
}: DraftFromNotesDialogProps) {
  const [notes, setNotes] = useState("");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorObj, setErrorObj] = useState<unknown>(null);

  const abortRef = useRef<AbortController | null>(null);
  const slowTimerRef = useRef<number | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (isPending) {
      return;
    }
    if (!next) {
      setConfirmReplace(false);
      setErrorCode(null);
      setErrorObj(null);
    }
    onOpenChange(next);
  };

  useEffect(() => {
    return () => {
      if (slowTimerRef.current !== null) {
        window.clearTimeout(slowTimerRef.current);
      }
      abortRef.current?.abort();
    };
  }, []);

  const clearSlowTimer = () => {
    if (slowTimerRef.current !== null) {
      window.clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }
    setIsSlow(false);
  };

  const handleCancelRequest = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    clearSlowTimer();
    setIsPending(false);
    setErrorCode(null);
    setErrorObj(null);
    onStartCooldown(5);
  };

  const runDraft = async () => {
    const trimmed = notes.trim();
    if (!trimmed || isPending || cooldownSeconds > 0) {
      return;
    }
    if (hasExistingContent && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }

    setConfirmReplace(false);
    setErrorCode(null);
    setErrorObj(null);
    setIsPending(true);
    setIsSlow(false);

    const controller = new AbortController();
    abortRef.current = controller;
    slowTimerRef.current = window.setTimeout(() => {
      setIsSlow(true);
    }, 25000);

    try {
      const draft = await planDraft(
        orgId,
        { notes: trimmed, week_start: weekStart },
        { signal: controller.signal }
      );
      if (controller.signal.aborted) {
        return;
      }
      clearSlowTimer();
      setIsPending(false);
      onDraftReady(draft);
      onOpenChange(false);
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      clearSlowTimer();
      setIsPending(false);
      const code = getApiErrorCode(err);
      setErrorCode(code);
      setErrorObj(err);
      if (code === "ai_rate_limited") {
        onStartCooldown(getRetryAfterSeconds(err, 30));
      }
    }
  };

  const errorBannerText =
    errorObj !== null
      ? getAiErrorMessage(
          errorObj,
          errorCode === "ai_rate_limited" ? cooldownSeconds || 30 : undefined
        )
      : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            Draft from notes
          </DialogTitle>
          <DialogDescription>
            Paste your rough notes, tickets, or meeting list. The AI will turn
            them into one main task, sub-goals, and go-to-market goals in your
            form. Nothing is saved until you click Save.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="draft-notes-textarea">Your notes</Label>
              <span className="text-xs text-muted-foreground">
                {notes.length}/{NOTES_MAX_LENGTH}
              </span>
            </div>
            <Textarea
              id="draft-notes-textarea"
              value={notes}
              maxLength={NOTES_MAX_LENGTH}
              disabled={isPending}
              onChange={(e) => {
                setNotes(e.target.value.slice(0, NOTES_MAX_LENGTH));
                if (confirmReplace) {
                  setConfirmReplace(false);
                }
              }}
              placeholder="e.g. Need to finish expired card handling on checkout (top support issue), add PostHog event for checkout retries, update billing docs, maybe look into webhook latency..."
              className="min-h-36 resize-y"
            />
          </div>

          {confirmReplace && !isPending && (
            <div
              role="alert"
              className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
            >
              <p className="font-medium">Replace what you have?</p>
              <p className="mt-0.5 text-xs text-amber-900">
                Your current form has tasks in it. Drafting from notes will
                replace the current form fields (unsaved until you click Save).
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <Button type="button" size="sm" onClick={runDraft}>
                  Yes, replace form
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmReplace(false)}
                >
                  Keep current form
                </Button>
              </div>
            </div>
          )}

          {isPending && (
            <div
              role="status"
              aria-live="polite"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 text-sm text-foreground"
            >
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span>
                  {isSlow ? "Still working..." : "Drafting your plan..."}
                </span>
              </div>
              {isSlow && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCancelRequest}
                >
                  Cancel
                </Button>
              )}
            </div>
          )}

          {errorBannerText && !isPending && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-700" />
              <div className="space-y-1">
                <p>{errorBannerText}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          {!confirmReplace && (
            <Button
              type="button"
              disabled={!notes.trim() || isPending || cooldownSeconds > 0}
              onClick={runDraft}
            >
              <Sparkles className="size-4" />
              {isPending
                ? "Drafting..."
                : cooldownSeconds > 0
                  ? `Draft my plan (${cooldownSeconds}s)`
                  : "Draft my plan"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
