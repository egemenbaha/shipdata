import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { TimelineProvider, useTimeline } from "@/state/timeline";
import { formatUtc } from "@/lib/derive";
import { TimelineSlider } from "@/components/timeline-slider";

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
          "Dark-themed maritime cyber situational awareness dashboard. Detect AIS signal loss and spoofing across vessel traffic in the Mediterranean.",
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
          <HudOverlays />
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
  const { currentTime, kpis } = useTimeline();
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

      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] flex gap-2">
        <Legend swatch="nominal" label="Nominal" />
        <Legend swatch="amber" label="Course Deviation" />
        <Legend swatch="danger" label="Dark / Spoofed" />
      </div>
    </>
  );
}

function Legend({ swatch, label }: { swatch: "nominal" | "amber" | "danger"; label: string }) {
  const map = {
    nominal: "bg-[var(--nominal)] shadow-[0_0_6px_var(--nominal)]",
    amber: "bg-[var(--amber)] shadow-[0_0_6px_var(--amber)]",
    danger: "bg-[var(--danger)] shadow-[0_0_6px_var(--danger)]",
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
