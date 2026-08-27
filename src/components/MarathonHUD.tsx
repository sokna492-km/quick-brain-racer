interface MarathonHUDProps {
  /** Progress from 0 to 1 */
  progress: number;
  /** Total distance label, default 42 */
  totalKm?: number;
}

export default function MarathonHUD({ progress, totalKm = 42 }: MarathonHUDProps) {
  const clampedPct = Math.min(Math.max(progress, 0), 1);
  const displayPct = `${(clampedPct * 100).toFixed(1)}%`;
  const km = Math.round(clampedPct * totalKm);
  const finished = clampedPct >= 1;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-[var(--hud-top,88px)]
        px-[max(0.75rem,env(safe-area-inset-left))]
        sm:px-[max(1.25rem,env(safe-area-inset-left))]"
      aria-label={`Runner at ${km} of ${totalKm} km`}
    >
      {/* Road track */}
      <div className="relative">
        {/* Start / finish flags */}
        <span className="absolute -top-5 left-0 select-none text-xs text-white/40">🏁</span>
        <span className="absolute -top-5 right-0 select-none text-xs text-white/40">🏆</span>

        {/* Distance label that follows the runner */}
        <span
          className="absolute -top-6 -translate-x-1/2 whitespace-nowrap select-none text-[11px] font-medium text-white/70 transition-[left] duration-300 ease-out"
          style={{ left: displayPct }}
        >
          {km} km
        </span>

        {/* Track road */}
        <div className="relative h-3 w-full overflow-visible rounded-full border border-white/10 bg-white/5">
          {/* Dashed center line */}
          <div className="pointer-events-none absolute inset-x-1 inset-y-0 flex items-center">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 border-r border-dashed border-white/10 last:border-r-0"
              />
            ))}
          </div>

          {/* Fill */}
          <div
            className="h-full rounded-full bg-blue-500 transition-[width] duration-300 ease-out"
            style={{ width: displayPct }}
          />

          {/* Runner — flipped to face finish (right), bobbing while racing */}
          <span
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 select-none text-lg leading-none drop-shadow transition-[left] duration-300 ease-out"
            style={{ left: displayPct }}
          >
            <span className={`inline-block ${finished ? "" : "scale-x-[-1]"}`}>
              <span className={`inline-block ${finished ? "" : "animate-runner-run"}`}>
                {finished ? "🥇" : "🏃"}
              </span>
            </span>
          </span>
        </div>

        {/* Bottom label */}
        <div className="mt-1.5 flex justify-between select-none text-[10px] text-white/30">
          <span>Start</span>
          <span>
            {km} / {totalKm} km
          </span>
          <span>Finish</span>
        </div>
      </div>
    </div>
  );
}
