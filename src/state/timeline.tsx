import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import {
  GLOBAL_VIEW,
  THEATERS,
  TIMELINE_END,
  vessels as allVessels,
  type TheaterId,
} from "@/data/vessels";
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

export type FlyRequest = {
  mmsi: string | null;
  lat: number;
  lng: number;
  zoom?: number;
  nonce: number;
};

export type TheaterView = TheaterId | "global";

type TimelineContextValue = {
  currentTime: number;
  setCurrentTime: (t: number) => void;
  derived: DerivedVessel[]; // filtered to current theater (all if global)
  rendezvous: Rendezvous[];
  kpis: Kpis;
  alerts: Alert[];
  selectedMmsi: string | null;
  setSelectedMmsi: (mmsi: string | null) => void;
  flyRequest: FlyRequest | null;
  focusVessel: (mmsi: string) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  theater: TheaterView;
  setTheater: (t: TheaterView) => void;
  theaterDerived: Record<TheaterId, DerivedVessel[]>;
  theaterAlerts: Record<TheaterId, Alert[]>;
};

const TimelineContext = createContext<TimelineContextValue | null>(null);

function createTheaterBuckets<T>(): Record<TheaterId, T[]> {
  return Object.fromEntries(THEATERS.map((t) => [t.id, [] as T[]])) as Record<TheaterId, T[]>;
}

export function TimelineProvider({ children }: { children: ReactNode }) {
  const [currentTime, setCurrentTime] = useState<number>(TIMELINE_END);
  const [selectedMmsi, setSelectedMmsi] = useState<string | null>(null);
  const [flyRequest, setFlyRequest] = useState<FlyRequest | null>(null);
  const [playing, setPlaying] = useState(false);
  const [theater, setTheaterState] = useState<TheaterView>("med");
  const nonceRef = useRef(0);

  // Derive all vessels once; filter per view for display.
  const allDerived = useMemo(() => deriveAll(allVessels, currentTime), [currentTime]);

  const theaterDerived = useMemo(() => {
    const out = createTheaterBuckets<DerivedVessel>();
    for (const d of allDerived) {
      const bucket = out[d.vessel.theaterId];
      if (bucket) bucket.push(d);
    }
    return out;
  }, [allDerived]);

  const theaterAlerts = useMemo(() => {
    const out = createTheaterBuckets<Alert>();
    (Object.keys(out) as TheaterId[]).forEach((id) => {
      const rdv = computeRendezvous(theaterDerived[id]);
      out[id] = computeAlerts(theaterDerived[id], currentTime, rdv);
    });
    return out;
  }, [theaterDerived, currentTime]);

  const derived = theater === "global" ? allDerived : theaterDerived[theater];
  const rendezvous = useMemo(() => computeRendezvous(derived), [derived]);
  const alerts = useMemo(
    () => computeAlerts(derived, currentTime, rendezvous),
    [derived, currentTime, rendezvous],
  );
  const kpis = useMemo(() => computeKpis(derived, rendezvous), [derived, rendezvous]);

  const requestFly = useCallback(
    (req: Omit<FlyRequest, "nonce">) => {
      nonceRef.current += 1;
      setFlyRequest({ ...req, nonce: nonceRef.current });
    },
    [],
  );

  const setTheater = useCallback(
    (t: TheaterView) => {
      setTheaterState(t);
      setSelectedMmsi(null);
      if (t === "global") {
        requestFly({ mmsi: null, lat: GLOBAL_VIEW.center[0], lng: GLOBAL_VIEW.center[1], zoom: GLOBAL_VIEW.zoom });
      } else {
        const cfg = THEATERS.find((x) => x.id === t)!;
        requestFly({ mmsi: null, lat: cfg.center[0], lng: cfg.center[1], zoom: cfg.zoom });
      }
    },
    [requestFly],
  );

  const focusVessel = useCallback(
    (mmsi: string) => {
      const v = allVessels.find((x) => x.mmsi === mmsi);
      if (!v) return;
      // Auto-switch theater if the vessel is in a different one
      if (theater !== "global" && v.theaterId !== theater) {
        setTheaterState(v.theaterId);
      }
      setSelectedMmsi(mmsi);
      const pt =
        [...v.track].reverse().find((p) => p.t <= currentTime) ??
        v.track[v.track.length - 1];
      if (pt) requestFly({ mmsi, lat: pt.lat, lng: pt.lng, zoom: 7 });
    },
    [currentTime, theater, requestFly],
  );

  const value = useMemo<TimelineContextValue>(
    () => ({
      currentTime,
      setCurrentTime,
      derived,
      rendezvous,
      kpis,
      alerts,
      selectedMmsi,
      setSelectedMmsi,
      flyRequest,
      focusVessel,
      playing,
      setPlaying,
      theater,
      setTheater,
      theaterDerived,
      theaterAlerts,
    }),
    [
      currentTime,
      derived,
      rendezvous,
      kpis,
      alerts,
      selectedMmsi,
      flyRequest,
      focusVessel,
      playing,
      theater,
      setTheater,
      theaterDerived,
      theaterAlerts,
    ],
  );

  return <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>;
}

export function useTimeline() {
  const ctx = useContext(TimelineContext);
  if (!ctx) throw new Error("useTimeline must be used within TimelineProvider");
  return ctx;
}
