import { useTimeline } from "@/state/timeline";
import { TIMELINE_START, TIMELINE_END } from "@/data/vessels";
import { formatUtc } from "@/lib/derive";
import { Slider } from "@/components/ui/slider";
import { useEffect, useMemo, useRef } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";

const STEP_MS = 60_000; // 1 minute scrubbing resolution
const PLAY_TICK_MS = 120;
const PLAY_STEP_MS = 2 * 60_000; // 2 scenario minutes per tick

export function TimelineSlider() {
  const { currentTime, setCurrentTime, kpis, playing, setPlaying } = useTimeline();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  void intervalRef;


  // Stable tick that advances time without re-subscribing the interval
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setCurrentTime(
        currentTime + PLAY_STEP_MS > TIMELINE_END
          ? TIMELINE_END
          : currentTime + PLAY_STEP_MS,
      );
    }, PLAY_TICK_MS);
    return () => clearInterval(id);
  }, [playing, currentTime, setCurrentTime]);

  // Auto-stop at end
  useEffect(() => {
    if (playing && currentTime >= TIMELINE_END) setPlaying(false);
  }, [playing, currentTime, setPlaying]);

  const ticks = useMemo(() => {
    const out: { t: number; label: string }[] = [];
    for (let t = TIMELINE_START; t <= TIMELINE_END; t += 30 * 60_000) {
      out.push({ t, label: formatUtc(t).slice(0, 5) });
    }
    return out;
  }, []);

  const pct = ((currentTime - TIMELINE_START) / (TIMELINE_END - TIMELINE_START)) * 100;
  const atEnd = currentTime >= TIMELINE_END;

  const togglePlay = () => {
    if (atEnd && !playing) {
      setCurrentTime(TIMELINE_START);
      setPlaying(true);
    } else {
      setPlaying(!playing);
    }
  };

  const reset = () => {
    setPlaying(false);
    setCurrentTime(TIMELINE_START);
  };

  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 z-[400] w-[min(720px,calc(100%-1.5rem))] -translate-x-1/2 rounded-sm border border-border bg-surface-0/85 px-4 py-3 backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
        <span>Timeline · UTC</span>
        <span className="text-[var(--cyan)] tabular-nums">
          T {formatUtc(currentTime)} · {kpis.activeAlerts} alerts
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
            className="flex h-7 w-7 items-center justify-center rounded-sm border border-[var(--cyan)]/40 bg-[var(--cyan)]/10 text-[var(--cyan)] transition-colors hover:bg-[var(--cyan)]/20"
          >
            {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </button>
          <button
            type="button"
            onClick={reset}
            aria-label="Reset"
            className="flex h-7 w-7 items-center justify-center rounded-sm border border-border bg-surface-1 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>

        <div className="relative flex-1">
          <Slider
            min={TIMELINE_START}
            max={TIMELINE_END}
            step={STEP_MS}
            value={[currentTime]}
            onValueChange={([v]) => {
              if (playing) setPlaying(false);
              setCurrentTime(v);
            }}
            aria-label="Scenario time"
          />
          <div
            className="pointer-events-none absolute -top-1 h-3 w-px bg-[var(--cyan)] opacity-60"
            style={{ left: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mt-1.5 flex justify-between font-mono text-[9px] tabular-nums text-muted-foreground/70">
        {ticks.map((tk) => (
          <span key={tk.t}>{tk.label}</span>
        ))}
      </div>
    </div>
  );
}
