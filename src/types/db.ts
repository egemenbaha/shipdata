// Hand-written DB interfaces matching the SQL schema (vessels, positions, alerts).
// Independent of Supabase's generated types so the frontend keeps building even
// if schema introspection is delayed.

export interface VesselRow {
  mmsi: string;
  name: string | null;
  imo: number | null;
  ship_type: number | null;
  last_lat: number | null;
  last_lon: number | null;
  /** PostGIS column — opaque on the client; we use last_lat/last_lon instead. */
  last_geom: unknown;
  last_speed: number | null;
  last_cog: number | null;
  last_heading: number | null;
  status: string | null;
  last_seen: string | null;
}

export interface PositionRow {
  id: string;
  mmsi: string;
  lat: number;
  lon: number;
  geom: unknown;
  speed: number | null;
  cog: number | null;
  heading: number | null;
  ts: string;
}

export interface AlertRow {
  id: string;
  mmsi: string;
  vessel_name: string | null;
  alert_type: "DARK" | "COURSE_DEV" | "SPOOFING";
  risk_score: number;
  lat: number | null;
  lng: number | null;
  heading: number | null;
  message: string | null;
  resolved: boolean;
  created_at: string;
}
