// All derived state for the dashboard. Pure functions of (vessels, currentTime).

import type { TrackPoint, Vessel } from "@/data/vessels";

// Great-circle distance in nautical miles.
function haversineNm(a: TrackPoint, b: TrackPoint): number {
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

// A vessel is considered "dark" when its last AIS ping is older than this.
const DARK_THRESHOLD_MIN = 25;

// Implied speed above this between two consecutive pings is physically
// impossible for surface vessels — flag as spoofing.
const IMPOSSIBLE_KTS = 60;

export type VesselStatus = "nominal" | "dark" | "spoofing";

export type DerivedVessel = {
  vessel: Vessel;
  visibleTrack: TrackPoint[]; // points at or before currentTime
  lastPoint: TrackPoint | null;
  status: VesselStatus;
  minutesDark: number; // 0 unless status === "dark"
  spoofJump: { from: TrackPoint; to: TrackPoint; impliedKts: number } | null;
};

export function deriveVessel(vessel: Vessel, currentTime: number): DerivedVessel {
  const visibleTrack = vessel.track.filter((p) => p.t <= currentTime);
  const lastPoint = visibleTrack.at(-1) ?? null;

  // Spoofing: scan visible pairs for impossible implied speed
  let spoofJump: DerivedVessel["spoofJump"] = null;
  for (let i = 1; i < visibleTrack.length; i++) {
    const a = visibleTrack[i - 1];
    const b = visibleTrack[i];
    const hours = (b.t - a.t) / 3_600_000;
    if (hours <= 0) continue;
    const kts = haversineNm(a, b) / hours;
    if (kts > IMPOSSIBLE_KTS) {
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

  return { vessel, visibleTrack, lastPoint, status, minutesDark, spoofJump };
}

export function deriveAll(vessels: Vessel[], currentTime: number): DerivedVessel[] {
  return vessels.map((v) => deriveVessel(v, currentTime));
}

export type Kpis = {
  totalVessels: number;
  activeAlerts: number;
  darkVessels: number;
  spoofingAlerts: number;
};

export function computeKpis(derived: DerivedVessel[]): Kpis {
  const visible = derived.filter((d) => d.lastPoint !== null);
  const dark = derived.filter((d) => d.status === "dark").length;
  const spoof = derived.filter((d) => d.status === "spoofing").length;
  return {
    totalVessels: visible.length,
    activeAlerts: dark + spoof,
    darkVessels: dark,
    spoofingAlerts: spoof,
  };
}

export type Alert = {
  id: string;
  mmsi: string;
  name: string;
  flag: string;
  type: VesselStatus & ("dark" | "spoofing");
  severity: 1 | 2 | 3; // 3 = highest
  since: number; // epoch ms when condition started
  detail: string;
};

export function computeAlerts(derived: DerivedVessel[], currentTime: number): Alert[] {
  const alerts: Alert[] = [];
  for (const d of derived) {
    if (d.status === "dark" && d.lastPoint) {
      alerts.push({
        id: `${d.vessel.mmsi}-dark`,
        mmsi: d.vessel.mmsi,
        name: d.vessel.name,
        flag: d.vessel.flag,
        type: "dark",
        severity: d.minutesDark > 60 ? 3 : 2,
        since: d.lastPoint.t,
        detail: `Last AIS ping ${formatMinutes(d.minutesDark)} ago`,
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
        detail: `Implied ${Math.round(d.spoofJump.impliedKts)} kts between pings`,
      });
    }
  }
  // Priority: severity desc, then most-recent first
  alerts.sort((a, b) => b.severity - a.severity || b.since - a.since);
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
