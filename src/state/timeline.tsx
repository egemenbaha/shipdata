import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { vessels, TIMELINE_END } from "@/data/vessels";
import {
  computeAlerts,
  computeKpis,
  deriveAll,
  type Alert,
  type DerivedVessel,
  type Kpis,
} from "@/lib/derive";

type TimelineContextValue = {
  currentTime: number;
  setCurrentTime: (t: number) => void;
  derived: DerivedVessel[];
  kpis: Kpis;
  alerts: Alert[];
};

const TimelineContext = createContext<TimelineContextValue | null>(null);

export function TimelineProvider({ children }: { children: ReactNode }) {
  // Default to the end of the scenario window so all anomalies are visible.
  const [currentTime, setCurrentTime] = useState<number>(TIMELINE_END);

  const value = useMemo<TimelineContextValue>(() => {
    const derived = deriveAll(vessels, currentTime);
    return {
      currentTime,
      setCurrentTime,
      derived,
      kpis: computeKpis(derived),
      alerts: computeAlerts(derived, currentTime),
    };
  }, [currentTime]);

  return <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>;
}

export function useTimeline() {
  const ctx = useContext(TimelineContext);
  if (!ctx) throw new Error("useTimeline must be used within TimelineProvider");
  return ctx;
}
