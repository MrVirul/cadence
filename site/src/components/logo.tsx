import { cn } from "@/lib/utils";

export interface LogoProps {
  className?: string;
  withWordmark?: boolean;
}

export function Logomark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("h-8 w-8 shrink-0", className)}
      role="img"
      aria-label="Cadence logomark"
    >
      <rect width="32" height="32" rx="7" fill="#4F46E5" />
      <path
        d="M21 9C19.3 7.2 16.8 6.2 14 6.2C8.6 6.2 4.2 10.6 4.2 16C4.2 21.4 8.6 25.8 14 25.8C16.8 25.8 19.3 24.8 21 23"
        stroke="#FFFFFF"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      <circle cx="21" cy="16" r="3.2" fill="#FFFFFF" />
    </svg>
  );
}

export function Logo({ className, withWordmark = true }: LogoProps) {
  if (!withWordmark) {
    return <Logomark className={className} />;
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2.5 text-foreground select-none",
        className
      )}
      role="img"
      aria-label="Cadence"
    >
      <Logomark className="h-7 w-7" />
      <span className="text-lg font-bold tracking-tight text-foreground">
        Cadence
      </span>
    </div>
  );
}
