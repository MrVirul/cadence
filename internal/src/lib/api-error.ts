import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "@/lib/api-client";

export interface ApiErrorBody {
  detail?: unknown;
  code?: string;
}

export type UiErrorDecision = "redirect_login" | "staff_only" | null;

export function getApiErrorBody(error: unknown): ApiErrorBody | undefined {
  if (
    error instanceof ApiError &&
    typeof error.data === "object" &&
    error.data !== null
  ) {
    return error.data as ApiErrorBody;
  }
  return undefined;
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
  const status = getApiStatus(error);

  if (code === "staff_only") {
    return "staff_only";
  }
  if (
    code === "invalid_token" ||
    code === "credentials_required" ||
    status === 401
  ) {
    return "redirect_login";
  }
  return null;
}

const CODE_MESSAGES: Record<string, string> = {
  invalid_token:
    "Your session has expired or is invalid. Please sign in again.",
  credentials_required: "Please sign in with your staff account to continue.",
  unauthorized:
    "Invalid credentials or non-staff account. This area is for Cadence staff only.",
  staff_only: "This area is for Cadence staff only.",
  forbidden: "You do not have permission to perform this action.",
  not_found: "The requested record was not found.",
  conflict: "This change conflicts with existing data.",
  validation_error: "Please check the highlighted fields and try again.",
  internal_error: "Something went wrong on our end. Please try again.",
  database_error: "A database error occurred. Please try again.",
};

export function getApiErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  if (error instanceof TypeError) {
    return "Network error. Please check your connection and try again.";
  }
  if (!(error instanceof ApiError)) {
    return fallback;
  }

  const code = getApiErrorCode(error);
  const detail = getApiErrorDetail(error);

  if (code === "staff_only") {
    return "This area is for Cadence staff only.";
  }
  if (detail) {
    return detail;
  }
  const codeMsg = code ? CODE_MESSAGES[code] : undefined;
  if (codeMsg) {
    return codeMsg;
  }
  return fallback;
}

export function applyApiErrorToForm<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  options: { fields: readonly Path<T>[]; fallback: string }
): string | null {
  const detail = getApiErrorDetail(error);
  if (!detail) {
    return getApiErrorMessage(error, options.fallback);
  }

  const known = new Set<string>(options.fields as readonly string[]);
  for (const part of detail.split("; ")) {
    const colon = part.indexOf(": ");
    if (colon > 0) {
      const field = part.slice(0, colon).trim();
      const message = part
        .slice(colon + 2)
        .trim()
        .replace(/^Value error,\s*/i, "");
      if (known.has(field)) {
        setError(field as Path<T>, { type: "server", message });
        continue;
      }
      return message;
    }
    return part.replace(/^Value error,\s*/i, "");
  }
  return null;
}
