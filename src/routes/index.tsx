import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { EyeOff, Radio, ArrowLeftRight } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { TimelineProvider, useTimeline } from "@/state/timeline";
import { formatUtc } from "@/lib/derive";
import { TimelineSlider } from "@/components/timeline-slider";
import { VesselDetailPanel } from "@/components/vessel-detail-panel";
import { TheaterSwitcher } from "@/components/theater-switcher";
import { THEATERS, GLOBAL_VIEW } from "@/data/vessels";

const TacticalMap = lazy(() =>
  import("@/components/tactical-map").then((m) => ({ default: m.TacticalMap })),
);

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "MARLOCK · Maritime Cyber Situational Awareness" },
      {
        name: "description",
        content:
          "Multi-theater maritime cyber situational awareness — Mediterranean, Black Sea, and Strait of Hormuz. Detect AIS signal loss, spoofing, and STS transfers from one engine.",
      },
    ],
  }),
});

function Dashboard() {
  return (
    <TimelineProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
        <Sidebar />
        <main className="relative flex-1">
          <MapStage />
          <TheaterSwitcher />
          <HudOverlays />
          <VesselDetailPanel />
          <TimelineSlider />
        </main>
      </div>
    </TimelineProvider>
  );
}


function MapStage() {
  // Leaflet touches `window` at import time → only render after client mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-0">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--cyan)] animate-pulse">
          Initializing tactical map…
        </span>
      </div>
    );
  }
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center bg-surface-0">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--cyan)] animate-pulse">
            Loading tiles…
          </span>
        </div>
      }
    >
      <TacticalMap />
    </Suspense>
  );
}

function HudOverlays() {
  const { currentTime, kpis, alerts } = useTimeline();
  const counts = {
    dark: alerts.filter((a) => a.type === "dark").length,
    spoofing: alerts.filter((a) => a.type === "spoofing").length,
    rendezvous: alerts.filter((a) => a.type === "rendezvous").length,
  };
  return (
    <>
      <div className="pointer-events-none absolute left-3 top-3 z-[400] rounded-sm border border-border bg-surface-0/80 px-2.5 py-1.5 backdrop-blur-md">
        <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
          AOR · Mediterranean
        </div>
        <div className="font-mono text-[10px] tabular-nums text-[var(--cyan)]">
          35.000°N · 018.000°E · Z5
        </div>
      </div>

      <div className="pointer-events-none absolute right-3 top-3 z-[400] flex items-center gap-2 rounded-sm border border-border bg-surface-0/80 px-2.5 py-1.5 backdrop-blur-md">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--cyan)] shadow-[0_0_6px_var(--cyan)]" />
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
          T {formatUtc(currentTime)} · {kpis.totalVessels} tracks
        </span>
      </div>

      <div className="pointer-events-none absolute left-1/2 top-3 z-[400] flex -translate-x-1/2 items-center gap-0 overflow-hidden rounded-sm border border-border bg-surface-0/85 backdrop-blur-md">
        <CountChip icon={EyeOff} label="DARK" value={counts.dark} accent="var(--danger)" />
        <span className="h-4 w-px bg-border" />
        <CountChip icon={Radio} label="SPOOF" value={counts.spoofing} accent="var(--danger)" />
        <span className="h-4 w-px bg-border" />
        <CountChip
          icon={ArrowLeftRight}
          label="STS"
          value={counts.rendezvous}
          accent="var(--amber)"
        />
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] flex flex-wrap gap-2">
        <Legend swatch="nominal" label="Nominal" />
        <Legend swatch="amber" label="Course Deviation" />
        <Legend swatch="danger" label="Dark / Spoofed" />
        <Legend swatch="corridor" label="Smuggling Corridor" />
      </div>
    </>
  );
}

function CountChip({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof EyeOff;
  label: string;
  value: number;
  accent: string;
}) {
  const dim = value === 0;
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5">
      <Icon
        className="h-3 w-3"
        style={{ color: dim ? "var(--muted-foreground)" : accent, opacity: dim ? 0.5 : 1 }}
      />
      <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </span>
      <span
        className="font-mono text-[11px] tabular-nums"
        style={{ color: dim ? "var(--muted-foreground)" : accent }}
      >
        {value}
      </span>
    </div>
  );
}


function Legend({ swatch, label }: { swatch: "nominal" | "amber" | "danger" | "corridor"; label: string }) {
  const map = {
    nominal: "bg-[var(--nominal)] shadow-[0_0_6px_var(--nominal)]",
    amber: "bg-[var(--amber)] shadow-[0_0_6px_var(--amber)]",
    danger: "bg-[var(--danger)] shadow-[0_0_6px_var(--danger)]",
    corridor:
      "bg-transparent border border-dashed border-[var(--amber)] shadow-[0_0_6px_var(--amber)]",
  } as const;
  return (
    <div className="flex items-center gap-1.5 rounded-sm border border-border bg-surface-0/80 px-2 py-1 backdrop-blur-md">
      <span className={`h-1.5 w-1.5 rounded-full ${map[swatch]}`} />
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
