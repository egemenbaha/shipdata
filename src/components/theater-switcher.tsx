import { Globe2 } from "lucide-react";
import { THEATERS, type TheaterId } from "@/data/vessels";
import { useTimeline, type TheaterView } from "@/state/timeline";

const ENTRIES: Array<{ id: TheaterView; label: string }> = [
  { id: "med", label: "Mediterranean" },
  { id: "black", label: "Black Sea" },
  { id: "hormuz", label: "Hormuz" },
  { id: "global", label: "Global" },
];

export function TheaterSwitcher() {
  const { theater, setTheater, theaterAlerts } = useTimeline();

  const alertsFor = (id: TheaterView) => {
    if (id === "global") return 0;
    return theaterAlerts[id as TheaterId].length;
  };

  return (
    <div className="pointer-events-auto absolute left-1/2 top-3 z-[450] flex -translate-x-1/2 items-center gap-0 overflow-hidden rounded-sm border border-border bg-surface-0/90 backdrop-blur-md">
      <div className="flex items-center gap-1.5 border-r border-border px-2.5 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--cyan)] shadow-[0_0_6px_var(--cyan)]" />
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
          Theater
        </span>
      </div>
      {ENTRIES.map((e) => {
        const active = theater === e.id;
        const alerts = alertsFor(e.id);
        const isGlobal = e.id === "global";
        return (
          <button
            key={e.id}
            type="button"
            onClick={() => setTheater(e.id)}
            className={`relative flex items-center gap-1.5 border-r border-border px-2.5 py-1.5 transition-colors last:border-r-0 ${
              active
                ? "bg-[var(--cyan)]/15 text-[var(--cyan)]"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            }`}
            aria-pressed={active}
          >
            {isGlobal && <Globe2 className="h-3 w-3" />}
            <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
              {e.label}
            </span>
            {alerts > 0 && (
              <span
                className="font-mono text-[9px] tabular-nums"
                style={{ color: "var(--danger)" }}
              >
                {alerts}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
