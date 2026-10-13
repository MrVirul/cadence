import { createAvatar } from "@dicebear/core";
import * as lorelei from "@dicebear/lorelei";

const avatarCache = new Map<string, string>();

/**
 * Generate a DiceBear Lorelei avatar data URI locally.
 * Memoized by seed so repeated renders or prerenders never recompute.
 */
export function getAvatarDataUri(seed: string): string {
  const cached = avatarCache.get(seed);
  if (cached) {
    return cached;
  }
  const uri = createAvatar(lorelei, {
    seed,
    radius: 50,
    backgroundColor: ["ede9fe", "ddd6fe", "f5f3ff", "e0e7ff"],
  }).toDataUri();
  avatarCache.set(seed, uri);
  return uri;
}

interface AvatarProps {
  seed: string;
  size?: number;
  className?: string;
}

/**
 * Small local avatar component using DiceBear Lorelei.
 * Synchronous and prerender-safe (renders directly to data URI).
 * Decorative (alt="") because the member name is always displayed next to it.
 */
export function Avatar({ seed, size = 28, className = "" }: AvatarProps) {
  const dataUri = getAvatarDataUri(seed);

  return (
    <img
      src={dataUri}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      loading="eager"
      decoding="async"
      className={`rounded-full shrink-0 ${className}`}
    />
  );
}
