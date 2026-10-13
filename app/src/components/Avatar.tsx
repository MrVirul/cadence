import { createAvatar } from "@dicebear/core";
import * as lorelei from "@dicebear/lorelei";

const avatarCache = new Map<string, string>();

/**
 * Generates a DiceBear Lorelei avatar data URI locally.
 * Memoized in a Map cache by seed.
 */
export function getAvatarDataUri(seed: string): string {
  if (!seed) {
    return "";
  }
  const cached = avatarCache.get(seed);
  if (cached) {
    return cached;
  }
  try {
    const uri = createAvatar(lorelei, {
      seed,
      radius: 50,
      backgroundColor: ["ede9fe", "ddd6fe", "f5f3ff", "e0e7ff"],
    }).toDataUri();
    avatarCache.set(seed, uri);
    return uri;
  } catch {
    return "";
  }
}

export interface AvatarProps {
  seed: string;
  name?: string | null;
  size?: number;
  className?: string;
  "aria-label"?: string;
}

/**
 * DiceBear Lorelei Avatar component.
 * Generated locally, never calling external APIs.
 * Seed is always the user ID (never email).
 * Displays decorative alt="" when name is adjacent, or aria-label when standalone.
 * Falls back to initials if generation throws or fails.
 */
export function Avatar({
  seed,
  name,
  size = 28,
  className = "",
  "aria-label": ariaLabel,
}: AvatarProps) {
  const dataUri = seed ? getAvatarDataUri(seed) : "";

  if (!dataUri) {
    const initials = name
      ? name
          .split(" ")
          .filter(Boolean)
          .map((n) => n[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()
      : "?";

    return (
      <span
        style={{ width: size, height: size }}
        aria-label={ariaLabel}
        className={`flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary select-none ${className}`}
      >
        {initials}
      </span>
    );
  }

  return (
    <img
      src={dataUri}
      width={size}
      height={size}
      alt={ariaLabel ? ariaLabel : ""}
      aria-label={ariaLabel}
      aria-hidden={!ariaLabel}
      loading="eager"
      decoding="async"
      style={{ width: size, height: size }}
      className={`rounded-full shrink-0 object-cover ${className}`}
    />
  );
}
