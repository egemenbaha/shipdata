import { useTimeline } from "@/state/timeline";
import { TIMELINE_START, TIMELINE_END } from "@/data/vessels";
import { formatUtc } from "@/lib/derive";
import { Slider } from "@/components/ui/slider";
import { useMemo } from "react";

const STEP_MS = 60_000; // 1 minute scrubbing resolution

export function TimelineSlider() {
  const { currentTime, setCurrentTime, kpis } = useTimeline();

  const ticks = useMemo(() => {
    const out: { t: number; label: string }[] = [];
    for (let t = TIMELINE_START; t <= TIMELINE_END; t += 30 * 60_000) {
      out.push({ t, label: formatUtc(t).slice(0, 5) });
    }
    return out;
  }, []);

  const pct = ((currentTime - TIMELINE_START) / (TIMELINE_END - TIMELINE_START)) * 100;

  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 z-[400] w-[min(720px,calc(100%-1.5rem))] -translate-x-1/2 rounded-sm border border-border bg-surface-0/85 px-4 py-3 backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
        <span>Timeline · UTC</span>
        <span className="text-[var(--cyan)] tabular-nums">
          T {formatUtc(currentTime)} · {kpis.activeAlerts} alerts
        </span>
      </div>

      <div className="relative">
        <Slider
          min={TIMELINE_START}
          max={TIMELINE_END}
          step={STEP_MS}
          value={[currentTime]}
          onValueChange={([v]) => setCurrentTime(v)}
          aria-label="Scenario time"
        />
        <div
          className="pointer-events-none absolute -top-1 h-3 w-px bg-[var(--cyan)] opacity-60"
          style={{ left: `${pct}%` }}
        />
      </div>

      <div className="mt-1.5 flex justify-between font-mono text-[9px] tabular-nums text-muted-foreground/70">
        {ticks.map((tk) => (
          <span key={tk.t}>{tk.label}</span>
        ))}
      </div>
    </div>
  );
}
