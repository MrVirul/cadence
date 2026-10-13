export function InternalBanner() {
  return (
    <div
      role="region"
      aria-label="Internal staff banner"
      className="flex h-7 w-full shrink-0 items-center justify-between border-b border-amber-600/30 bg-[#B45309] px-3 sm:px-4 text-xs font-semibold tracking-wider text-amber-50 uppercase select-none"
    >
      <span className="truncate">CADENCE INTERNAL — staff only</span>
      <span className="hidden font-mono text-[10px] tracking-normal opacity-90 sm:inline">
        Confidential · Platform admin
      </span>
    </div>
  );
}
