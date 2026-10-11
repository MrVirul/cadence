import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "@/lib/api-client";

// The API renders every error in one shape:
//   { detail: <string>, code: <snake_case> }
// (docs/API.md §Conventions). Native 422 validation errors fold the offending
// fields into `detail` as "<field>: <message>" entries joined by "; "; business
// errors (401/403/404/409/...) carry a plain message with no field prefix.
interface ApiErrorBody {
  detail?: unknown;
  code?: string;
}

function getBody(error: unknown): ApiErrorBody | undefined {
  if (error instanceof ApiError) {
    return error.data as ApiErrorBody | undefined;
  }
  return undefined;
}

// Pull a human-readable message out of an unknown thrown value: the API's
// `detail` string when present, otherwise a caller-supplied fallback. Network
// failures arrive as the native fetch TypeError (no response body).
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const detail = getBody(error)?.detail;
  if (typeof detail === "string" && detail.length > 0) {
    return detail;
  }
  if (error instanceof TypeError) {
    return "Network error. Please check your connection and try again.";
  }
  return fallback;
}

// Apply an API error to a react-hook-form: a 422 `detail` may fold several
// "<field>: <message>" entries; those whose field the form renders attach
// inline (shown next to that input). Anything else — errors with no field, or
// for fields the form doesn't render — is returned as a single form-level
// message the caller can surface. Returns null when every error was mapped.
export function applyApiErrorToForm<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  options: { fields: readonly Path<T>[]; fallback: string }
): string | null {
  const detail = getBody(error)?.detail;
  if (typeof detail !== "string" || detail.length === 0) {
    return getApiErrorMessage(error, options.fallback);
  }

  const known = new Set<string>(options.fields as readonly string[]);
  for (const part of detail.split("; ")) {
    const colon = part.indexOf(": ");
    if (colon > 0) {
      const field = part.slice(0, colon);
      const message = part.slice(colon + 2);
      if (known.has(field)) {
        setError(field as Path<T>, { type: "server", message });
        continue;
      }
      return message;
    }
    return part;
  }
  return null;
}