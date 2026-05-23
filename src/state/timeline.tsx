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
import { useVessels } from "@/hooks/use-vessels";
import { useAnomalyDetection, type LiveAnomaly } from "@/hooks/use-anomaly-detection";
import type { VesselRow } from "@/types/db";

// Map AISStream ship_type integer to our internal vessel type bucket.
function liveShipType(code?: number | null): "tanker" | "cargo" | "fishing" {
  if (!code) return "cargo";
  if (code >= 80 && code <= 89) return "tanker";
  if (code === 30) return "fishing";
  if (code >= 70 && code <= 79) return "cargo";
  return "cargo";
}

// Adapt a DB vessel row into the LiveShip shape consumed by the anomaly engine.
function vesselToLiveShip(v: VesselRow): LiveShip | null {
  if (v.last_lat == null || v.last_lon == null) return null;
  return {
    mmsi: v.mmsi,
    lat: v.last_lat,
    lng: v.last_lon,
    speed: v.last_speed ?? 0,
    course: v.last_cog ?? v.last_heading ?? 0,
    lastUpdate: v.last_seen ? new Date(v.last_seen).getTime() : Date.now(),
    name: v.name ?? undefined,
    imo: v.imo ?? undefined,
    shipType: v.ship_type ?? undefined,
  };
}

// Build a synthetic DerivedVessel from a DB vessel row + live anomaly status.
function vesselToDerived(v: VesselRow, anomaly?: LiveAnomaly): DerivedVessel | null {
  if (v.last_lat == null || v.last_lon == null) return null;
  const t = v.last_seen ? new Date(v.last_seen).getTime() : Date.now();
  const point = { t, lat: v.last_lat, lng: v.last_lon, speed: v.last_speed ?? 0 };
  const heading = v.last_heading ?? v.last_cog ?? 0;
  const back = backProject(v.last_lat, v.last_lon, heading, 0.5);
  const prev = { t: t - 60_000, lat: back.lat, lng: back.lng, speed: v.last_speed ?? 0 };
  const status: DerivedVessel["status"] = anomaly?.status ?? "nominal";
  return {
    vessel: {
      mmsi: v.mmsi,
      name: v.name?.trim() || `MMSI ${v.mmsi}`,
      type: liveShipType(v.ship_type),
      flag: "LIVE",
      theaterId: "straits",
      track: [prev, point],
    },
    visibleTrack: [prev, point],
    lastPoint: point,
    status,
    minutesDark: anomaly?.minutesDark ?? 0,
    spoofJump: null,
    inCorridor: false,
  };
}

// Walk ~nm backwards along bearing so the vessel marker has a heading vector.
function backProject(lat: number, lng: number, bearing: number, nm: number) {
  const rad = ((bearing + 180) * Math.PI) / 180;
  const dLat = (Math.cos(rad) * nm) / 60;
  const dLng = (Math.sin(rad) * nm) / (60 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lng: lng + dLng };
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

  // Keep the WebSocket proxy connection alive — it triggers the Edge Function
  // which writes UPSERTs into the vessels table. We ignore the relayed
  // messages; the DB subscription below is the source of truth.
  useAisStream();

  // Database-driven live vessels (realtime subscription).
  const { vessels: dbVessels } = useVessels();

  // Adapt to LiveShip shape for the anomaly detector (which already knows
  // how to compute DARK / COURSE_DEV from this).
  const liveShipsForDetection = useMemo(() => {
    const m = new Map<string, LiveShip>();
    dbVessels.forEach((v) => {
      const ls = vesselToLiveShip(v);
      if (ls) m.set(ls.mmsi, ls);
    });
    return m;
  }, [dbVessels]);
  const anomalies = useAnomalyDetection(liveShipsForDetection);

  const liveDerived = useMemo(() => {
    const out: DerivedVessel[] = [];
    dbVessels.forEach((v) => {
      const d = vesselToDerived(v, anomalies.get(v.mmsi));
      if (d) out.push(d);
    });
    return out;
  }, [dbVessels, anomalies]);

  // Derive all vessels once; filter per view for display.
  const mockDerived = useMemo(() => deriveAll(allVessels, currentTime), [currentTime]);
  const allDerived = useMemo(
    () => [...mockDerived, ...liveDerived],
    [mockDerived, liveDerived],
  );

  const theaterDerived = useMemo(() => {
    const out = createTheaterBuckets<DerivedVessel>();
    for (const d of allDerived) {
      const tid = d?.vessel?.theaterId as TheaterId | undefined;
      if (!tid) continue;
      const bucket = out[tid] ?? (out[tid] = []);
      bucket.push(d);
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
