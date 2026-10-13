import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMemberLabel(user: {
  name?: string | null;
  email: string;
}): string {
  const name = user.name?.trim();
  if (name) {
    return `${name} (${user.email})`;
  }
  return user.email;
}

export function sortMembersByName<
  T extends { user: { name?: string | null; email: string } },
>(members: T[]): T[] {
  return [...members].sort((a, b) => {
    const nameA = a.user.name?.trim() || a.user.email;
    const nameB = b.user.name?.trim() || b.user.email;
    return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
  });
}
