// Single source of truth for the entire app.
// All vessels, tracks, anomalies, KPIs, and alert feed entries are derived
// from this dataset combined with the current timeline value.

export type VesselType = "tanker" | "cargo" | "fishing";

export type TrackPoint = {
  t: number; // epoch ms (UTC)
  lat: number;
  lng: number;
  speed: number; // knots
};

export type Vessel = {
  mmsi: string;
  name: string;
  type: VesselType;
  flag: string; // ISO 3166-1 alpha-2
  track: TrackPoint[];
};

// Scenario clock: 23 May 2026, 12:00–16:00 UTC over the Mediterranean.
export const SCENARIO_DATE = "2026-05-23";
export const TIMELINE_START = Date.UTC(2026, 4, 23, 12, 0, 0);
export const TIMELINE_END = Date.UTC(2026, 4, 23, 16, 0, 0);
const STEP_MS = 15 * 60 * 1000; // 15-minute pings

// ---- helpers (used once to construct the constant dataset) -----------------

// Approx conversion: 1° latitude ≈ 60 nm.
// Course bearing in degrees (0 = north, 90 = east).
function step(lat: number, lng: number, bearingDeg: number, nm: number) {
  const rad = (bearingDeg * Math.PI) / 180;
  const dLat = (Math.cos(rad) * nm) / 60;
  const dLng = (Math.sin(rad) * nm) / (60 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lng: lng + dLng };
}

function makeTrack(
  startLat: number,
  startLng: number,
  bearingDeg: number,
  speedKts: number,
  stops: number = 17, // 17 points = 12:00..16:00 inclusive at 15 min
): TrackPoint[] {
  const pts: TrackPoint[] = [];
  let lat = startLat;
  let lng = startLng;
  for (let i = 0; i < stops; i++) {
    pts.push({
      t: TIMELINE_START + i * STEP_MS,
      lat,
      lng,
      speed: speedKts + (Math.sin(i * 1.3) * 0.4), // micro variation
    });
    const nm = speedKts * 0.25; // 15 min = 0.25 h
    const next = step(lat, lng, bearingDeg, nm);
    lat = next.lat;
    lng = next.lng;
  }
  return pts;
}

// Truncate a track at a given timestamp (vessel goes dark).
function darken(track: TrackPoint[], blackoutAt: number): TrackPoint[] {
  return track.filter((p) => p.t <= blackoutAt);
}

// Inject a single physically-impossible jump at the given index.
function spoof(
  track: TrackPoint[],
  atIndex: number,
  jumpLat: number,
  jumpLng: number,
): TrackPoint[] {
  return track.map((p, i) =>
    i >= atIndex ? { ...p, lat: p.lat + jumpLat, lng: p.lng + jumpLng } : p,
  );
}

// Replace a contiguous slice of pings with a "drift in place" segment near
// (lat,lng) at very low speed, with a small offset for the partner vessel.
function rendezvousSegment(
  track: TrackPoint[],
  fromIndex: number,
  toIndex: number,
  lat: number,
  lng: number,
  offsetNm = 0.15, // ~280 m
): TrackPoint[] {
  // offsetNm to the east-ish for the partner
  const dLat = 0;
  const dLng = offsetNm / (60 * Math.cos((lat * Math.PI) / 180));
  return track.map((p, i) => {
    if (i < fromIndex || i > toIndex) return p;
    const jitter = ((i % 2) - 0.5) * 0.0015;
    return {
      t: p.t,
      lat: lat + dLat + jitter,
      lng: lng + dLng + jitter,
      speed: 0.6 + ((i % 3) * 0.2),
    };
  });
}

// ---- dataset --------------------------------------------------------------

export const vessels: Vessel[] = [
  // --- 2 DARK vessels (signal stops mid-window) ---
  {
    mmsi: "271045892",
    name: "KARADENIZ STAR",
    type: "tanker",
    flag: "TR",
    // Goes dark at 14:00 UTC
    track: darken(makeTrack(36.2, 28.4, 250, 12.5), TIMELINE_START + 8 * STEP_MS),
  },
  {
    mmsi: "237119004",
    name: "AGIOS NIKOLAOS",
    type: "cargo",
    flag: "GR",
    // Goes dark at 13:30 UTC
    track: darken(makeTrack(35.6, 23.1, 110, 14.2), TIMELINE_START + 6 * STEP_MS),
  },

  // --- 2 SPOOFING vessels (single impossible jump) ---
  {
    mmsi: "215772341",
    name: "VALLETTA PRIDE",
    type: "tanker",
    flag: "MT",
    // ~2° latitude (~120 nm) jump in 15 min → ~480 kts. Impossible.
    track: spoof(makeTrack(34.2, 15.6, 90, 11.8), 9, 2.1, 1.4),
  },
  {
    mmsi: "247318906",
    name: "STELLA ADRIATICA",
    type: "cargo",
    flag: "IT",
    // Jump south-west at index 11
    track: spoof(makeTrack(37.4, 13.2, 200, 13.5), 11, -1.8, -1.6),
  },

  // --- 9 NORMAL vessels ---
  {
    mmsi: "271083450",
    name: "ANATOLIA EXPRESS",
    type: "cargo",
    flag: "TR",
    track: makeTrack(36.8, 30.5, 230, 15.1),
  },
  {
    mmsi: "237554120",
    name: "POSEIDON IX",
    type: "fishing",
    flag: "GR",
    track: makeTrack(37.9, 24.8, 70, 8.4),
  },
  {
    mmsi: "215448021",
    name: "MEDITERRANEA",
    type: "tanker",
    flag: "MT",
    track: makeTrack(35.1, 18.9, 285, 12.0),
  },
  {
    mmsi: "247602115",
    name: "GENOVA SPIRIT",
    type: "cargo",
    flag: "IT",
    track: makeTrack(40.1, 12.8, 175, 14.6),
  },
  {
    mmsi: "224015770",
    name: "IBERIAN DAWN",
    type: "tanker",
    flag: "ES",
    track: makeTrack(36.2, 0.8, 95, 13.2),
  },
  {
    mmsi: "226331004",
    name: "MARSEILLE BLEU",
    type: "cargo",
    flag: "FR",
    track: makeTrack(42.6, 6.4, 160, 16.3),
  },
  {
    mmsi: "271202118",
    name: "EGE YILDIZI",
    type: "fishing",
    flag: "TR",
    track: makeTrack(38.2, 26.6, 200, 7.1),
  },
  {
    mmsi: "237890667",
    name: "KRITI WAVE",
    type: "fishing",
    flag: "GR",
    track: makeTrack(34.9, 25.3, 20, 6.8),
  },
  {
    mmsi: "247440812",
    name: "SICILIA NORD",
    type: "cargo",
    flag: "IT",
    track: makeTrack(38.0, 14.5, 80, 12.9),
  },
];
