import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
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

export type FlyRequest = { mmsi: string; lat: number; lng: number; nonce: number };

type TimelineContextValue = {
  currentTime: number;
  setCurrentTime: (t: number) => void;
  derived: DerivedVessel[];
  rendezvous: Rendezvous[];
  kpis: Kpis;
  alerts: Alert[];
  selectedMmsi: string | null;
  setSelectedMmsi: (mmsi: string | null) => void;
  flyRequest: FlyRequest | null;
  focusVessel: (mmsi: string) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
};

const TimelineContext = createContext<TimelineContextValue | null>(null);

export function TimelineProvider({ children }: { children: ReactNode }) {
  const [currentTime, setCurrentTime] = useState<number>(TIMELINE_END);
  const [selectedMmsi, setSelectedMmsi] = useState<string | null>(null);
  const [flyRequest, setFlyRequest] = useState<FlyRequest | null>(null);
  const [playing, setPlaying] = useState(false);
  const nonceRef = useRef(0);

  const derived = useMemo(() => deriveAll(vessels, currentTime), [currentTime]);
  const rendezvous = useMemo(() => computeRendezvous(derived), [derived]);

  const focusVessel = useCallback(
    (mmsi: string) => {
      setSelectedMmsi(mmsi);
      const v = vessels.find((x) => x.mmsi === mmsi);
      if (!v) return;
      const pt =
        [...v.track].reverse().find((p) => p.t <= currentTime) ??
        v.track[v.track.length - 1];
      if (pt) {
        nonceRef.current += 1;
        setFlyRequest({ mmsi, lat: pt.lat, lng: pt.lng, nonce: nonceRef.current });
      }
    },
    [currentTime],
  );

  const value = useMemo<TimelineContextValue>(
    () => ({
      currentTime,
      setCurrentTime,
      derived,
      rendezvous,
      kpis: computeKpis(derived, rendezvous),
      alerts: computeAlerts(derived, currentTime, rendezvous),
      selectedMmsi,
      setSelectedMmsi,
      flyRequest,
      focusVessel,
      playing,
      setPlaying,
    }),
    [currentTime, derived, rendezvous, selectedMmsi, flyRequest, focusVessel, playing],
  );

  return <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>;
}

export function useTimeline() {
  const ctx = useContext(TimelineContext);
  if (!ctx) throw new Error("useTimeline must be used within TimelineProvider");
  return ctx;
}
