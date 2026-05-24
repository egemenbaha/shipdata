// All derived state for the dashboard. Pure functions of (vessels, currentTime).

import { THEATERS, type TrackPoint, type Vessel } from "@/data/vessels";
import { computeRisk } from "@/lib/risk";

// Great-circle distance in nautical miles.
export function haversineNm(a: TrackPoint, b: TrackPoint): number {
  const R = 3440.065; // Earth radius in nm
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const dφ = ((b.lat - a.lat) * Math.PI) / 180;
  const dλ = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Initial bearing from a → b, in degrees (0=N, 90=E).
export function bearingDeg(a: TrackPoint, b: TrackPoint): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

// Project a point N nautical miles along bearing.
export function projectPoint(
  lat: number,
  lng: number,
  bearing: number,
  nm: number,
): { lat: number; lng: number } {
  const rad = (bearing * Math.PI) / 180;
  const dLat = (Math.cos(rad) * nm) / 60;
  const dLng = (Math.sin(rad) * nm) / (60 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lng: lng + dLng };
}

// A vessel is considered "dark" when its last AIS ping is older than this
// (relative to the current timeline value).
const DARK_THRESHOLD_MIN = 25;

// Realistic max plausible speeds per vessel type, in knots. A SPOOFING alert
// fires when the implied speed between two consecutive AIS pings exceeds the
// type max by a clear margin (× SPOOF_TRIGGER_MULT) to avoid false positives
// from normal GPS jitter.
//
// Reference figures for genuine ships:
//   container/cargo 25 · tanker 17 · bulk 16 · general cargo 20
//   fishing 15 · passenger/fast ferry 40 · tug/other 14
// Our internal VesselType union only exposes tanker/cargo/fishing; the rest
// are kept in EXTENDED_MAX_KTS for the live AIS pipeline.
export const MAX_KTS_BY_TYPE: Record<Vessel["type"], number> = {
  tanker: 17,
  cargo: 25,
  fishing: 15,
};

export const EXTENDED_MAX_KTS = {
  container: 25,
  tanker: 17,
  bulk: 16,
  general_cargo: 20,
  fishing: 15,
  passenger: 40,
  tug: 14,
  other: 14,
} as const;

/** Multiplier applied to the type max before a jump counts as spoofing. */
export const SPOOF_TRIGGER_MULT = 1.3;

// Known smuggling/transit corridor for the Mediterranean theater. Kept as a
// named export for back-compat; the runtime check below considers ALL theaters.
export const SMUGGLING_CORRIDOR: ReadonlyArray<[number, number]> =
  THEATERS.find((t) => t.id === "med")!.corridor;

// Point-in-polygon (ray casting) for a [lat,lng] polygon.
function pointInPolygon(
  lat: number,
  lng: number,
  poly: ReadonlyArray<[number, number]>,
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// True if the point falls inside ANY theater's corridor. One engine, any waters.
export function pointInCorridor(lat: number, lng: number): boolean {
  return THEATERS.some((t) => pointInPolygon(lat, lng, t.corridor));
}

export type VesselStatus = "nominal" | "dark" | "spoofing" | "course_dev";

export type DerivedVessel = {
  vessel: Vessel;
  visibleTrack: TrackPoint[]; // points at or before currentTime
  lastPoint: TrackPoint | null;
  status: VesselStatus;
  minutesDark: number; // 0 unless status === "dark"
  spoofJump: { from: TrackPoint; to: TrackPoint; impliedKts: number } | null;
  inCorridor: boolean;
};

export function deriveVessel(vessel: Vessel, currentTime: number): DerivedVessel {
  const visibleTrack = vessel.track.filter((p) => p.t <= currentTime);
  const lastPoint = visibleTrack.at(-1) ?? null;

  // Spoofing: implied speed above type max × trigger multiplier.
  const maxKts = MAX_KTS_BY_TYPE[vessel.type];
  const triggerKts = maxKts * SPOOF_TRIGGER_MULT;
  let spoofJump: DerivedVessel["spoofJump"] = null;
  for (let i = 1; i < visibleTrack.length; i++) {
    const a = visibleTrack[i - 1];
    const b = visibleTrack[i];
    const hours = (b.t - a.t) / 3_600_000;
    if (hours <= 0) continue;
    const kts = haversineNm(a, b) / hours;
    if (kts > triggerKts) {
      spoofJump = { from: a, to: b, impliedKts: kts };
      break;
    }
  }

  // Dark: vessel has prior pings but the most recent one is older than threshold,
  // AND no further pings exist in its track (i.e. it stopped, didn't just lag).
  let status: VesselStatus = "nominal";
  let minutesDark = 0;
  if (spoofJump) {
    status = "spoofing";
  } else if (lastPoint) {
    const gapMin = (currentTime - lastPoint.t) / 60_000;
    const noFuturePings = vessel.track.every((p) => p.t <= lastPoint.t);
    if (gapMin > DARK_THRESHOLD_MIN && noFuturePings) {
      status = "dark";
      minutesDark = gapMin;
    }
  }

  const inCorridor = lastPoint
    ? pointInCorridor(lastPoint.lat, lastPoint.lng)
    : false;

  return { vessel, visibleTrack, lastPoint, status, minutesDark, spoofJump, inCorridor };
}

export function deriveAll(vessels: Vessel[], currentTime: number): DerivedVessel[] {
  return vessels.map((v) => deriveVessel(v, currentTime));
}

// ---- rendezvous detection -----------------------------------------------

// 500 m ≈ 0.27 nm. Allow a touch more for AIS jitter.
const RENDEZVOUS_NM = 0.32;
// Both vessels effectively stationary / drifting.
const RENDEZVOUS_MAX_KTS = 2.5;
// Sustained: at least N consecutive shared pings (≥45 min at 15-min cadence).
const RENDEZVOUS_MIN_PINGS = 3;

export type Rendezvous = {
  id: string;
  a: DerivedVessel;
  b: DerivedVessel;
  since: number;
  lastT: number;
  minSeparationNm: number;
  midpoint: { lat: number; lng: number };
};

export function computeRendezvous(derived: DerivedVessel[]): Rendezvous[] {
  const out: Rendezvous[] = [];
  for (let i = 0; i < derived.length; i++) {
    for (let j = i + 1; j < derived.length; j++) {
      const A = derived[i];
      const B = derived[j];
      if (!A.lastPoint || !B.lastPoint) continue;

      // Walk shared timestamps, count longest run satisfying the criteria.
      const byT = new Map(B.visibleTrack.map((p) => [p.t, p]));
      let runStart: number | null = null;
      let bestStart: number | null = null;
      let bestEnd: number | null = null;
      let bestLen = 0;
      let bestMinSep = Infinity;
      let runMinSep = Infinity;

      for (const pa of A.visibleTrack) {
        const pb = byT.get(pa.t);
        const ok =
          pb &&
          pa.speed <= RENDEZVOUS_MAX_KTS &&
          pb.speed <= RENDEZVOUS_MAX_KTS &&
          haversineNm(pa, pb) <= RENDEZVOUS_NM;
        if (ok && pb) {
          const sep = haversineNm(pa, pb);
          if (runStart === null) {
            runStart = pa.t;
            runMinSep = sep;
          } else {
            runMinSep = Math.min(runMinSep, sep);
          }
          const len =
            A.visibleTrack.filter((p) => p.t >= runStart! && p.t <= pa.t).length;
          if (len > bestLen) {
            bestLen = len;
            bestStart = runStart;
            bestEnd = pa.t;
            bestMinSep = runMinSep;
          }
        } else {
          runStart = null;
          runMinSep = Infinity;
        }
      }

      if (bestLen >= RENDEZVOUS_MIN_PINGS && bestStart && bestEnd) {
        const midLat = (A.lastPoint.lat + B.lastPoint.lat) / 2;
        const midLng = (A.lastPoint.lng + B.lastPoint.lng) / 2;
        out.push({
          id: `rdv-${A.vessel.mmsi}-${B.vessel.mmsi}`,
          a: A,
          b: B,
          since: bestStart,
          lastT: bestEnd,
          minSeparationNm: bestMinSep,
          midpoint: { lat: midLat, lng: midLng },
        });
      }
    }
  }
  return out;
}

export type Kpis = {
  totalVessels: number;
  activeAlerts: number;
  darkVessels: number;
  spoofingAlerts: number;
  rendezvousAlerts: number;
};

export function computeKpis(derived: DerivedVessel[], rendezvous: Rendezvous[] = []): Kpis {
  const visible = derived.filter((d) => d.lastPoint !== null);
  const dark = derived.filter((d) => d.status === "dark").length;
  const spoof = derived.filter((d) => d.status === "spoofing").length;
  return {
    totalVessels: visible.length,
    activeAlerts: dark + spoof + rendezvous.length,
    darkVessels: dark,
    spoofingAlerts: spoof,
    rendezvousAlerts: rendezvous.length,
  };
}

export type Alert = {
  id: string;
  mmsi: string;
  name: string;
  flag: string;
  type: "dark" | "spoofing" | "rendezvous" | "course_dev";
  severity: 1 | 2 | 3;
  since: number;
  detail: string;
  riskScore: number;
  riskFactors: { label: string; points: number; detail?: string }[];
};

export function computeAlerts(
  derived: DerivedVessel[],
  currentTime: number,
  rendezvous: Rendezvous[] = [],
): Alert[] {
  const alerts: Alert[] = [];
  for (const d of derived) {
    const risk = computeRisk(d, rendezvous);
    if (d.status === "dark" && d.lastPoint) {
      const baseSev: 1 | 2 | 3 = d.minutesDark > 60 ? 3 : 2;
      alerts.push({
        id: `${d.vessel.mmsi}-dark`,
        mmsi: d.vessel.mmsi,
        name: d.vessel.name,
        flag: d.vessel.flag,
        type: "dark",
        severity: d.inCorridor ? 3 : baseSev,
        since: d.lastPoint.t,
        detail: `Last AIS ping ${formatMinutes(d.minutesDark)} ago${d.inCorridor ? " · inside smuggling corridor" : ""}`,
        riskScore: risk.total,
        riskFactors: risk.factors,
      });
    } else if (d.status === "course_dev" && d.lastPoint) {
      alerts.push({
        id: `${d.vessel.mmsi}-coursedev`,
        mmsi: d.vessel.mmsi,
        name: d.vessel.name,
        flag: d.vessel.flag,
        type: "course_dev",
        severity: 2,
        since: d.lastPoint.t,
        detail: `Sudden course deviation > 45°`,
        riskScore: risk.total,
        riskFactors: risk.factors,
      });
    } else if (d.status === "spoofing" && d.spoofJump) {
      alerts.push({
        id: `${d.vessel.mmsi}-spoof`,
        mmsi: d.vessel.mmsi,
        name: d.vessel.name,
        flag: d.vessel.flag,
        type: "spoofing",
        severity: 3,
        since: d.spoofJump.to.t,
        detail: `Implied ${Math.round(d.spoofJump.impliedKts)} kts (max ${MAX_KTS_BY_TYPE[d.vessel.type]} kts for ${d.vessel.type})${d.inCorridor ? " · inside smuggling corridor" : ""}`,
        riskScore: risk.total,
        riskFactors: risk.factors,
      });
    }
  }
  for (const r of rendezvous) {
    const inCorr =
      pointInCorridor(r.midpoint.lat, r.midpoint.lng) ||
      r.a.inCorridor ||
      r.b.inCorridor;
    const durMin = (r.lastT - r.since) / 60_000;
    // Use the higher-risk side of the pair as the rendezvous alert's score.
    const riskA = computeRisk(r.a, rendezvous);
    const riskB = computeRisk(r.b, rendezvous);
    const risk = riskA.total >= riskB.total ? riskA : riskB;
    alerts.push({
      id: r.id,
      mmsi: `${r.a.vessel.mmsi}↔${r.b.vessel.mmsi}`,
      name: `${r.a.vessel.name} ↔ ${r.b.vessel.name}`,
      flag: `${r.a.vessel.flag}/${r.b.vessel.flag}`,
      type: "rendezvous",
      severity: inCorr ? 3 : 2,
      since: r.since,
      detail: `Possible STS transfer · ${Math.round(r.minSeparationNm * 1852)} m separation · ${formatMinutes(durMin)} sustained${inCorr ? " · inside smuggling corridor" : ""}`,
      riskScore: risk.total,
      riskFactors: risk.factors,
    });
  }
  // Priority: computed risk desc, then most-recent first
  alerts.sort((a, b) => b.riskScore - a.riskScore || b.since - a.since);
  void currentTime;
  return alerts;
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatUtc(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
