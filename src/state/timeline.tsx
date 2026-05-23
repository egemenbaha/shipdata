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
import { useAisStream, type LiveShip } from "@/hooks/use-ais-stream";

// Map AISStream ship_type integer to our internal vessel type bucket.
function liveShipType(code?: number): "tanker" | "cargo" | "fishing" {
  if (!code) return "cargo";
  if (code >= 80 && code <= 89) return "tanker";
  if (code === 30) return "fishing";
  if (code >= 70 && code <= 79) return "cargo";
  return "cargo";
}

// Build a synthetic DerivedVessel from a live AIS ping. Live ships are always
// treated as nominal — the historical anomaly engine doesn't apply to a single
// real-time fix.
function liveToDerived(s: LiveShip): DerivedVessel {
  const point = { t: Date.now(), lat: s.lat, lng: s.lng, speed: s.speed };
  const prev = {
    t: point.t - 60_000,
    lat: s.lat,
    lng: s.lng,
    speed: s.speed,
  };
  return {
    vessel: {
      mmsi: s.mmsi,
      name: s.name?.trim() || `MMSI ${s.mmsi}`,
      type: liveShipType(s.shipType),
      flag: "LIVE",
      theaterId: "straits",
      track: [prev, point],
    },
    visibleTrack: [prev, point],
    lastPoint: point,
    status: "nominal",
    minutesDark: 0,
    spoofJump: null,
    inCorridor: false,
  };
}

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

  // Live AIS feed (Turkish Straits bounding box).
  const { ships: liveShips } = useAisStream();
  const liveDerived = useMemo(() => {
    const out: DerivedVessel[] = [];
    liveShips.forEach((s) => out.push(liveToDerived(s)));
    return out;
  }, [liveShips]);

  // Derive all vessels once; filter per view for display.
  const mockDerived = useMemo(() => deriveAll(allVessels, currentTime), [currentTime]);
  const allDerived = useMemo(
    () => [...mockDerived, ...liveDerived],
    [mockDerived, liveDerived],
  );

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
