import { ApiError } from "@/lib/api-client";

export interface ApiErrorBody {
  detail?: string;
  code?: string;
}

export type UiErrorDecision =
  | "redirect_login"
  | "suspended"
  | "no_access"
  | "invite_invalid"
  | null;

export function getApiErrorBody(error: unknown): ApiErrorBody | null {
  if (
    error instanceof ApiError &&
    typeof error.data === "object" &&
    error.data !== null
  ) {
    return error.data as ApiErrorBody;
  }
  return null;
}

export function getApiErrorCode(error: unknown): string | null {
  return getApiErrorBody(error)?.code ?? null;
}

export function getApiErrorDetail(error: unknown): string | null {
  const detail = getApiErrorBody(error)?.detail;
  return typeof detail === "string" && detail.trim().length > 0 ? detail : null;
}

export function getApiStatus(error: unknown): number | null {
  return error instanceof ApiError ? error.status : null;
}

export function getUiErrorDecision(error: unknown): UiErrorDecision {
  if (!error) {
    return null;
  }
  const code = getApiErrorCode(error);

  // Redirect to /login only on invalid_token or credentials_required, never on
  // "unauthorized" from login/signup forms.
  if (code === "invalid_token" || code === "credentials_required") {
    return "redirect_login";
  }
  if (code === "org_suspended") {
    return "suspended";
  }
  if (code === "invite_invalid") {
    return "invite_invalid";
  }
  if (code === "not_found" || code === "forbidden") {
    return "no_access";
  }
  if (
    error instanceof ApiError &&
    (error.status === 404 || error.status === 403)
  ) {
    return "no_access";
  }
  return null;
}

const CODE_MESSAGES: Record<string, string> = {
  invalid_token: "Your session has expired. Please sign in again.",
  credentials_required: "Please sign in to continue.",
  unauthorized: "Incorrect email or password.",
  org_suspended: "This organization is suspended. Contact support.",
  forbidden: "You don't have permission to perform this action.",
  not_found: "You don't have access to this.",
  invite_invalid: "This invite link is no longer valid, ask for a new one.",
  conflict: "A plan already exists for this week.",
  invalid_transition:
    "That action isn't available for the plan's current status.",
  last_owner: "An organization must always have at least one owner.",
  validation_error: "Please check the highlighted fields and try again.",
  ai_unavailable:
    "AI review isn't set up on this server. Your plan is safe — you can keep editing and submit without it.",
  ai_rate_limited:
    "The AI review is rate limited right now. Your plan is safe — you can submit without a review, or try again shortly.",
  ai_timeout:
    "The review took too long. Your plan is safe — you can try again or keep planning without it.",
  ai_bad_output:
    "The AI couldn't produce a review this time. Your plan is safe — you can try again or continue without it.",
  ai_error:
    "The AI couldn't produce a review this time. Your plan is safe — you can try again or continue without it.",
  internal_error: "Something went wrong on our end. Please try again.",
};

export function getRetryAfterSeconds(error: unknown, fallback = 30): number {
  if (error instanceof ApiError && typeof error.retryAfter === "number") {
    return error.retryAfter;
  }
  return fallback;
}

export function getAiErrorMessage(
  error: unknown,
  retrySeconds?: number
): string {
  const code = getApiErrorCode(error);
  if (code === "ai_unavailable") {
    return "AI review isn't set up on this server. Your plan is safe — you can keep planning and submit without it.";
  }
  if (code === "ai_rate_limited") {
    const secs = retrySeconds ?? getRetryAfterSeconds(error, 30);
    return `The AI review is rate limited right now. Try again in ${secs}s. Your plan is safe — you can submit without a review.`;
  }
  if (code === "ai_timeout") {
    return "The review took too long. Your plan is safe — you can try again or continue planning without it.";
  }
  if (code === "ai_bad_output" || code === "ai_error") {
    return "The AI couldn't produce a review this time. Your plan is safe — you can try again or continue planning without it.";
  }
  return getApiErrorMessage(
    error,
    "The AI couldn't produce a review this time. Your plan is safe — you can continue planning without it."
  );
}

const PLAIN_DETAIL_OVERRIDES: Array<[RegExp, string]> = [
  [
    /cannot submit a plan for a past week/i,
    "This week has already passed, so its plan can no longer be submitted.",
  ],
  [
    /cannot create a plan for a past week/i,
    "This week has already passed. You can only start plans for this week or up to 4 weeks ahead.",
  ],
  [
    /cannot create a plan more than 4 weeks ahead/i,
    "Plans can only be created for this week or up to 4 weeks ahead.",
  ],
  [/week_start must be a monday/i, "Plans must start on a Monday."],
];

export function getApiErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  if (!(error instanceof ApiError)) {
    return "Network error. Please check your connection and try again.";
  }

  const code = getApiErrorCode(error);
  const detail = getApiErrorDetail(error);

  if (code === "invite_invalid") {
    return "This invite link is no longer valid, ask for a new one.";
  }
  if (
    code === "ai_unavailable" ||
    code === "ai_rate_limited" ||
    code === "ai_timeout" ||
    code === "ai_bad_output" ||
    code === "ai_error"
  ) {
    return getAiErrorMessage(error);
  }
  if (detail) {
    for (const [pattern, replacement] of PLAIN_DETAIL_OVERRIDES) {
      if (pattern.test(detail)) {
        return replacement;
      }
    }
    return detail;
  }
  const codeMsg = code ? CODE_MESSAGES[code] : undefined;
  if (codeMsg) {
    return codeMsg;
  }
  return fallback;
}

export function parseValidationErrors(error: unknown): {
  fieldErrors: Record<string, string>;
  generalMessage: string | null;
} {
  const detail = getApiErrorDetail(error);
  const fieldErrors: Record<string, string> = {};
  const generalParts: string[] = [];

  if (!detail) {
    return { fieldErrors, generalMessage: null };
  }

  // FastAPI validation handler formats field errors as "field: msg; field2: msg2"
  for (const rawPart of detail.split(";")) {
    const part = rawPart.trim();
    if (!part) {
      continue;
    }
    const colonIdx = part.indexOf(":");
    if (colonIdx > 0) {
      const rawField = part.slice(0, colonIdx).trim();
      const msg = part.slice(colonIdx + 1).trim();
      const cleanedMsg = msg.replace(/^Value error,\s*/i, "");
      if (/^[a-zA-Z0-9_]+$/.test(rawField)) {
        fieldErrors[rawField] = cleanedMsg;
        continue;
      }
    }
    generalParts.push(part.replace(/^Value error,\s*/i, ""));
  }

  return {
    fieldErrors,
    generalMessage: generalParts.length > 0 ? generalParts.join(". ") : null,
  };
}
