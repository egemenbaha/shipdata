// Single source of truth: theaters, each with their own vessels, tracks, and
// smuggling-corridor polygon. The detection engine in `lib/derive.ts` is
// theater-agnostic — same physics, same anomaly rules, any waters.

export type VesselType = "tanker" | "cargo" | "fishing";

export type TrackPoint = {
  t: number;
  lat: number;
  lng: number;
  speed: number;
};

export type Vessel = {
  mmsi: string;
  name: string;
  type: VesselType;
  flag: string;
  theaterId: TheaterId;
  track: TrackPoint[];
};

export type TheaterId = "med" | "black" | "hormuz" | "straits";

export type Theater = {
  id: TheaterId;
  name: string;
  shortName: string;
  blurb: string;
  center: [number, number];
  zoom: number;
  corridor: ReadonlyArray<[number, number]>;
  corridorLabel: string;
};

// Scenario clock: 23 May 2026, 12:00–16:00 UTC.
export const SCENARIO_DATE = "2026-05-23";
export const TIMELINE_START = Date.UTC(2026, 4, 23, 12, 0, 0);
export const TIMELINE_END = Date.UTC(2026, 4, 23, 16, 0, 0);
const STEP_MS = 15 * 60 * 1000;

// Global / world view config
export const GLOBAL_VIEW = {
  center: [32, 35] as [number, number],
  zoom: 3,
};

// ---- helpers --------------------------------------------------------------

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
  stops: number = 17,
): TrackPoint[] {
  const pts: TrackPoint[] = [];
  let lat = startLat;
  let lng = startLng;
  for (let i = 0; i < stops; i++) {
    pts.push({
      t: TIMELINE_START + i * STEP_MS,
      lat,
      lng,
      speed: speedKts + Math.sin(i * 1.3) * 0.4,
    });
    const nm = speedKts * 0.25;
    const next = step(lat, lng, bearingDeg, nm);
    lat = next.lat;
    lng = next.lng;
  }
  return pts;
}

function darken(track: TrackPoint[], blackoutAt: number): TrackPoint[] {
  return track.filter((p) => p.t <= blackoutAt);
}

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

function rendezvousSegment(
  track: TrackPoint[],
  fromIndex: number,
  toIndex: number,
  lat: number,
  lng: number,
  offsetNm = 0.15,
): TrackPoint[] {
  const dLat = 0;
  const dLng = offsetNm / (60 * Math.cos((lat * Math.PI) / 180));
  return track.map((p, i) => {
    if (i < fromIndex || i > toIndex) return p;
    const jitter = ((i % 2) - 0.5) * 0.0015;
    return {
      t: p.t,
      lat: lat + dLat + jitter,
      lng: lng + dLng + jitter,
      speed: 0.6 + (i % 3) * 0.2,
    };
  });
}

// Bind theaterId onto a partial vessel definition.
function withTheater(theaterId: TheaterId, list: Omit<Vessel, "theaterId">[]): Vessel[] {
  return list.map((v) => ({ ...v, theaterId }));
}

// ---- theater configs ------------------------------------------------------

export const THEATERS: Theater[] = [
  {
    id: "med",
    name: "Mediterranean",
    shortName: "Med",
    blurb: "Eastern Med · Libya–Crete smuggling corridor",
    center: [35, 18],
    zoom: 5,
    corridorLabel: "Known Smuggling Corridor",
    corridor: [
      [34.6, 20.2],
      [34.9, 24.8],
      [33.2, 25.4],
      [32.4, 22.6],
      [32.8, 20.0],
    ],
  },
  {
    id: "black",
    name: "Black Sea",
    shortName: "Black Sea",
    blurb: "Russian shadow-fleet tanker activity · AIS spoofing",
    center: [44.0, 34.5],
    zoom: 6,
    corridorLabel: "Shadow-Fleet Transit Lane",
    corridor: [
      [45.3, 32.6],
      [45.2, 36.4],
      [43.6, 36.6],
      [43.4, 33.0],
      [44.2, 32.2],
    ],
  },
  {
    id: "hormuz",
    name: "Strait of Hormuz",
    shortName: "Hormuz",
    blurb: "Sanctions-evasion STS transfers · Iranian-origin crude",
    center: [26.3, 56.4],
    zoom: 7,
    corridorLabel: "Sanctions-Evasion STS Zone",
    corridor: [
      [26.9, 55.4],
      [26.9, 57.0],
      [25.6, 57.4],
      [25.4, 56.0],
      [26.1, 55.2],
    ],
  },
  {
    id: "straits",
    name: "Turkish Straits",
    shortName: "Straits",
    blurb: "Dardanelles · Marmara · Bosphorus chokepoint transit",
    center: [40.9, 28.5],
    zoom: 7,
    corridorLabel: "Chokepoint Transit Lane",
    corridor: [
      [40.05, 26.10],
      [40.20, 26.35],
      [40.45, 26.95],
      [40.55, 27.60],
      [40.80, 28.40],
      [40.95, 28.95],
      [41.15, 29.05],
      [41.55, 29.15],
      [41.65, 29.30],
      [41.20, 29.25],
      [40.85, 28.70],
      [40.55, 28.10],
      [40.35, 27.20],
      [40.10, 26.55],
      [39.95, 26.20],
    ],
  },
];

// ---- Mediterranean dataset ------------------------------------------------

const medVessels = withTheater("med", [
  {
    mmsi: "271045892",
    name: "KARADENIZ STAR",
    type: "tanker",
    flag: "TR",
    track: darken(makeTrack(36.2, 28.4, 250, 12.5), TIMELINE_START + 8 * STEP_MS),
  },
  {
    mmsi: "237119004",
    name: "AGIOS NIKOLAOS",
    type: "cargo",
    flag: "GR",
    track: darken(makeTrack(35.6, 23.1, 110, 14.2), TIMELINE_START + 6 * STEP_MS),
  },
  {
    mmsi: "215772341",
    name: "VALLETTA PRIDE",
    type: "tanker",
    flag: "MT",
    track: spoof(makeTrack(34.2, 15.6, 90, 11.8), 9, 0.525, 0.35),
  },
  {
    mmsi: "247318906",
    name: "STELLA ADRIATICA",
    type: "cargo",
    flag: "IT",
    track: spoof(makeTrack(37.4, 13.2, 200, 13.5), 11, -0.45, -0.4),
  },
  { mmsi: "271083450", name: "ANATOLIA EXPRESS", type: "cargo",   flag: "TR", track: makeTrack(36.8, 30.5, 230, 15.1) },
  { mmsi: "237554120", name: "POSEIDON IX",      type: "fishing", flag: "GR", track: makeTrack(37.9, 24.8,  70,  8.4) },
  { mmsi: "215448021", name: "MEDITERRANEA",     type: "tanker",  flag: "MT", track: makeTrack(35.1, 18.9, 285, 12.0) },
  { mmsi: "247602115", name: "GENOVA SPIRIT",    type: "cargo",   flag: "IT", track: makeTrack(40.1, 12.8, 175, 14.6) },
  { mmsi: "224015770", name: "IBERIAN DAWN",     type: "tanker",  flag: "ES", track: makeTrack(36.2,  0.8,  95, 13.2) },
  { mmsi: "226331004", name: "MARSEILLE BLEU",   type: "cargo",   flag: "FR", track: makeTrack(42.6,  6.4, 160, 16.3) },
  { mmsi: "271202118", name: "EGE YILDIZI",      type: "fishing", flag: "TR", track: makeTrack(38.2, 26.6, 200,  7.1) },
  { mmsi: "237890667", name: "KRITI WAVE",       type: "fishing", flag: "GR", track: makeTrack(34.9, 25.3,  20,  6.8) },
  { mmsi: "247440812", name: "SICILIA NORD",     type: "cargo",   flag: "IT", track: makeTrack(38.0, 14.5,  80, 12.9) },
  {
    mmsi: "271604233",
    name: "ZEYTUN HORIZON",
    type: "tanker",
    flag: "TR",
    track: rendezvousSegment(makeTrack(33.60, 22.70, 30, 5.0), 4, 16, 33.70, 22.80, 0),
  },
  {
    mmsi: "215889017",
    name: "NEPHELE M",
    type: "cargo",
    flag: "MT",
    track: rendezvousSegment(makeTrack(33.80, 22.90, 210, 5.0), 4, 16, 33.70, 22.80, 0.15),
  },
]);

// ---- Black Sea dataset ----------------------------------------------------
// Russian shadow-fleet scenario: 2 spoofing tankers (RU), 2 dark, 4 normal.

const blackVessels = withTheater("black", [
  {
    mmsi: "273456001",
    name: "VOLGA PRIMORYE",
    type: "tanker",
    flag: "RU",
    // Massive AIS jump from off Sevastopol to off Novorossiysk
    track: spoof(makeTrack(44.4, 33.2, 80, 11.5), 8, 0.075, 0.6),
  },
  {
    mmsi: "273912004",
    name: "NEVA OBSKAYA",
    type: "tanker",
    flag: "RU",
    // Spoof: teleport south of Kerch
    track: spoof(makeTrack(45.0, 36.1, 200, 10.8), 10, -0.35, -0.425),
  },
  {
    mmsi: "273100847",
    name: "AZOV PIONEER",
    type: "tanker",
    flag: "RU",
    // Dark at 13:15 — vanishes in the transit lane
    track: darken(makeTrack(44.6, 35.2, 240, 9.8), TIMELINE_START + 5 * STEP_MS),
  },
  {
    mmsi: "271709332",
    name: "BOSPHORUS KARTAL",
    type: "cargo",
    flag: "TR",
    // Dark at 14:00
    track: darken(makeTrack(43.2, 31.6, 60, 12.3), TIMELINE_START + 8 * STEP_MS),
  },
  { mmsi: "273004511", name: "DON STELLAR",      type: "cargo",   flag: "RU", track: makeTrack(45.1, 36.8, 210, 13.4) },
  { mmsi: "271811220", name: "KARADENIZ FENER",  type: "tanker",  flag: "TR", track: makeTrack(43.0, 31.2,  90, 11.7) },
  { mmsi: "207443100", name: "VARNA AURORA",     type: "cargo",   flag: "BG", track: makeTrack(43.4, 30.0, 130, 14.0) },
  { mmsi: "264887721", name: "CONSTANTA SOARE",  type: "fishing", flag: "RO", track: makeTrack(44.2, 30.4, 100,  7.6) },
]);

// ---- Strait of Hormuz dataset ---------------------------------------------
// Sanctions-evasion STS scenario: rendezvous pair in the corridor, plus a
// spoofing and a dark case, plus normals.

const hormuzVessels = withTheater("hormuz", [
  // STS pair inside the corridor (~26.3N 56.3E)
  {
    mmsi: "422991008",
    name: "SHAHID BAHRAM",
    type: "tanker",
    flag: "IR",
    track: rendezvousSegment(makeTrack(26.10, 56.10, 40, 5.5), 4, 16, 26.32, 56.35, 0),
  },
  {
    mmsi: "352001147",
    name: "OCEAN PEARL VII",
    type: "tanker",
    flag: "PA", // Panama flag-of-convenience
    track: rendezvousSegment(makeTrack(26.50, 56.60, 220, 5.5), 4, 16, 26.32, 56.35, 0.16),
  },
  {
    mmsi: "470117044",
    name: "AL MARWAH",
    type: "tanker",
    flag: "AE",
    // Spoof: implausible 1.6° jump in 15 min
    track: spoof(makeTrack(25.7, 57.2, 290, 12.6), 9, 0.35, -0.4),
  },
  {
    mmsi: "422118207",
    name: "PERSIAN MEHR",
    type: "cargo",
    flag: "IR",
    // Dark at 13:45 inside the corridor
    track: darken(makeTrack(26.6, 55.9, 110, 11.0), TIMELINE_START + 7 * STEP_MS),
  },
  { mmsi: "563122889", name: "STAR OF SINGAPORE", type: "cargo",  flag: "SG", track: makeTrack(25.2, 57.8, 290, 15.2) },
  { mmsi: "470008011", name: "DUBAI MERIDIAN",    type: "tanker", flag: "AE", track: makeTrack(25.4, 56.4, 110, 12.8) },
  { mmsi: "457302118", name: "MUSCAT WIND",       type: "cargo",  flag: "OM", track: makeTrack(24.8, 58.1, 320, 13.6) },
  { mmsi: "403555401", name: "JAZIRA CRESCENT",   type: "fishing", flag: "SA", track: makeTrack(26.9, 55.4, 150, 7.2) },
]);

// ---- Turkish Straits dataset ----------------------------------------------
// Chokepoint scenario: vessel goes dark inside the Bosphorus; a tanker
// "teleports" across the Marmara (spoofing); STS pair drifting in mid-Marmara.

const straitsVessels = withTheater("straits", [
  // STS pair drifting in mid-Marmara (~40.75N 28.30E)
  {
    mmsi: "271990441",
    name: "MARMARA SAHIN",
    type: "tanker",
    flag: "TR",
    track: rendezvousSegment(makeTrack(40.60, 28.10, 60, 5.0), 4, 16, 40.75, 28.30, 0),
  },
  {
    mmsi: "636019887",
    name: "LIBERIAN CREST",
    type: "tanker",
    flag: "LR",
    track: rendezvousSegment(makeTrack(40.90, 28.55, 240, 5.0), 4, 16, 40.75, 28.30, 0.16),
  },
  {
    mmsi: "273881002",
    name: "ROSTOV TRANSIT",
    type: "tanker",
    flag: "RU",
    // Dark inside the Bosphorus at 13:30
    track: darken(makeTrack(41.10, 29.04, 10, 9.5), TIMELINE_START + 6 * STEP_MS),
  },
  {
    mmsi: "271554118",
    name: "BOGAZ YILDIZ",
    type: "cargo",
    flag: "TR",
    // Spoof: implausible jump across the Marmara
    track: spoof(makeTrack(40.30, 26.80, 60, 12.0), 9, 0.125, 0.45),
  },
  { mmsi: "271770044", name: "ISTANBUL DAWN",  type: "cargo",  flag: "TR", track: makeTrack(41.20, 29.10, 190, 11.5) },
  { mmsi: "271223301", name: "CANAKKALE EXP",  type: "cargo",  flag: "TR", track: makeTrack(40.15, 26.40,  60, 13.2) },
  { mmsi: "636024118", name: "PIRAEUS RUNNER", type: "tanker", flag: "LR", track: makeTrack(40.50, 27.40,  70, 12.6) },
  { mmsi: "207990012", name: "BURGAS ANCHOR",  type: "fishing", flag: "BG", track: makeTrack(41.40, 29.20,  20,  7.0) },
]);

// ---- exports --------------------------------------------------------------

export const THEATER_VESSELS: Record<TheaterId, Vessel[]> = {
  med: medVessels,
  black: blackVessels,
  hormuz: hormuzVessels,
  straits: straitsVessels,
};

export const vessels: Vessel[] = [
  ...medVessels,
  ...blackVessels,
  ...hormuzVessels,
  ...straitsVessels,
];
