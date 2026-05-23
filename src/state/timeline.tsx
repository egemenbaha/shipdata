import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { vessels, TIMELINE_END } from "@/data/vessels";
import {
  computeAlerts,
  computeKpis,
  computeRendezvous,
  deriveAll,
  type Alert,
  type DerivedVessel,
  type Kpis,
  type Rendezvous,
} from "@/lib/derive";

type TimelineContextValue = {
  currentTime: number;
  setCurrentTime: (t: number) => void;
  derived: DerivedVessel[];
  rendezvous: Rendezvous[];
  kpis: Kpis;
  alerts: Alert[];
  selectedMmsi: string | null;
  setSelectedMmsi: (mmsi: string | null) => void;
};

const TimelineContext = createContext<TimelineContextValue | null>(null);

export function TimelineProvider({ children }: { children: ReactNode }) {
  const [currentTime, setCurrentTime] = useState<number>(TIMELINE_END);
  const [selectedMmsi, setSelectedMmsi] = useState<string | null>(null);

  const value = useMemo<TimelineContextValue>(() => {
    const derived = deriveAll(vessels, currentTime);
    const rendezvous = computeRendezvous(derived);
    return {
      currentTime,
      setCurrentTime,
      derived,
      rendezvous,
      kpis: computeKpis(derived, rendezvous),
      alerts: computeAlerts(derived, currentTime, rendezvous),
      selectedMmsi,
      setSelectedMmsi,
    };
  }, [currentTime, selectedMmsi]);

  return <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>;
}

export function useTimeline() {
  const ctx = useContext(TimelineContext);
  if (!ctx) throw new Error("useTimeline must be used within TimelineProvider");
  return ctx;
}
