// Secure proxy to AISStream.io + DB persistence layer.
//
// • Browser opens a WebSocket to this function (no API key required).
// • This function opens its own WS to AISStream with the server-held key.
// • Every PositionReport → INSERT into `positions` + UPSERT into `vessels`.
// • Every ShipStaticData → UPSERT static fields (name, imo, ship_type) into `vessels`.
//
// Geometry is written as EWKT (`SRID=4326;POINT(lon lat)`) which PostGIS
// accepts directly for `geometry(Point,4326)` columns via PostgREST.

const AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream";

const DEFAULT_BBOX = [[[40.0, 26.0], [41.7, 30.3]]];
const DEFAULT_FILTERS = ["PositionReport", "ShipStaticData"];

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// --- Throttle & spoofing detection (per worker instance) -------------------
const WRITE_THROTTLE_MS = 10_000;      // per-vessel DB write floor
const MAX_PLAUSIBLE_KN = 50;           // > this implies teleportation
const SPOOF_WINDOW_H = 0.25;           // ignore deltas older than 15 min
const SPOOF_COOLDOWN_MS = 10 * 60_000; // don't re-raise within 10 min

const lastWrite = new Map<string, number>();
const lastPos = new Map<string, { lat: number; lon: number; t: number }>();
const lastSpoofAt = new Map<string, number>();

function haversineNm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
) {
  const R = 3440.065; // earth radius in nautical miles
  const toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR;
  const dLon = (b.lon - a.lon) * toR;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// PostgREST helpers — service role, RLS bypassed for ingest only.
async function pgrest(
  path: string,
  init: RequestInit & { prefer?: string } = {},
) {
  const headers: Record<string, string> = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.prefer) headers["Prefer"] = init.prefer;
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers });
}

function ewktPoint(lon: number, lat: number) {
  return `SRID=4326;POINT(${lon} ${lat})`;
}

async function raiseSpoofing(
  mmsi: string,
  impliedKn: number,
  lat: number,
  lon: number,
) {
  const now = Date.now();
  if (now - (lastSpoofAt.get(mmsi) ?? 0) < SPOOF_COOLDOWN_MS) return;
  lastSpoofAt.set(mmsi, now);

  // Skip if there's already an unresolved SPOOFING alert for this vessel.
  const check = await pgrest(
    `alerts?mmsi=eq.${mmsi}&alert_type=eq.SPOOFING&resolved=eq.false&select=id&limit=1`,
    { method: "GET" },
  );
  if (check.ok) {
    const rows = (await check.json()) as Array<{ id: string }>;
    if (rows.length > 0) return;
  }

  const res = await pgrest("alerts", {
    method: "POST",
    body: JSON.stringify({
      mmsi,
      alert_type: "SPOOFING",
      risk_score: 85,
      lat,
      lng: lon,
      message: `Implied speed ${Math.round(impliedKn)} kn — physically impossible`,
      details: { implied_speed_kn: Math.round(impliedKn) },
    }),
    prefer: "return=minimal",
  });
  if (!res.ok) {
    console.warn("[ais-proxy] spoofing alert insert", res.status, await res.text());
  }
}

async function resolveDarkAlerts(mmsi: string) {
  // A vessel just reported in — clear any unresolved DARK alerts.
  const res = await pgrest(
    `alerts?mmsi=eq.${mmsi}&alert_type=eq.DARK&resolved=eq.false`,
    {
      method: "PATCH",
      body: JSON.stringify({ resolved: true }),
      prefer: "return=minimal",
    },
  );
  if (!res.ok && res.status !== 404) {
    console.warn("[ais-proxy] resolve dark", res.status, await res.text());
  }
}


async function persistPosition(mmsi: string, msg: Record<string, unknown>) {
  const meta = (msg.MetaData ?? {}) as Record<string, unknown>;
  const pr = ((msg.Message ?? {}) as Record<string, unknown>)
    .PositionReport as Record<string, unknown> | undefined;
  if (!pr) return;

  const lat = Number(pr.Latitude ?? meta.latitude);
  const lon = Number(pr.Longitude ?? meta.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

  const speed = Number(pr.Sog ?? 0);
  const cog = Number(pr.Cog ?? 0);
  const heading = Number(pr.TrueHeading ?? pr.Cog ?? 0);
  const ts = new Date().toISOString();
  const geom = ewktPoint(lon, lat);

  // INSERT into positions (history)
  const posRes = await pgrest("positions", {
    method: "POST",
    body: JSON.stringify({ mmsi, lat, lon, geom, speed, cog, heading, ts }),
    prefer: "return=minimal",
  });
  if (!posRes.ok) {
    console.warn("[ais-proxy] positions insert", posRes.status, await posRes.text());
  }

  // UPSERT into vessels (current state)
  const vesRes = await pgrest("vessels?on_conflict=mmsi", {
    method: "POST",
    body: JSON.stringify({
      mmsi,
      last_lat: lat,
      last_lon: lon,
      last_geom: geom,
      last_speed: speed,
      last_cog: cog,
      last_heading: heading,
      last_seen: ts,
      status: "ACTIVE",
    }),
    prefer: "resolution=merge-duplicates,return=minimal",
  });
  if (!vesRes.ok) {
    console.warn("[ais-proxy] vessels upsert", vesRes.status, await vesRes.text());
  }
}

async function persistStatic(mmsi: string, msg: Record<string, unknown>) {
  const sd = ((msg.Message ?? {}) as Record<string, unknown>)
    .ShipStaticData as Record<string, unknown> | undefined;
  if (!sd) return;

  const name = String(sd.Name ?? "").trim();
  const imo = Number(sd.ImoNumber ?? 0) || null;
  const shipType = Number(sd.Type ?? 0) || null;

  const res = await pgrest("vessels?on_conflict=mmsi", {
    method: "POST",
    body: JSON.stringify({
      mmsi,
      ...(name ? { name } : {}),
      ...(imo ? { imo } : {}),
      ...(shipType ? { ship_type: shipType } : {}),
    }),
    prefer: "resolution=merge-duplicates,return=minimal",
  });
  if (!res.ok) {
    console.warn("[ais-proxy] vessels static upsert", res.status, await res.text());
  }
}

Deno.serve((req) => {
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  const apiKey = Deno.env.get("AISSTREAM_API_KEY");
  if (!apiKey) {
    return new Response("AISSTREAM_API_KEY not configured", { status: 500 });
  }

  const { socket: client, response } = Deno.upgradeWebSocket(req);

  let upstream: WebSocket | null = null;
  let clientOpen = false;
  let upstreamOpen = false;
  let subscription = {
    BoundingBoxes: DEFAULT_BBOX as number[][][],
    FilterMessageTypes: DEFAULT_FILTERS as string[],
  };

  const sendSubscription = () => {
    if (!upstream || upstream.readyState !== WebSocket.OPEN) return;
    upstream.send(
      JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: subscription.BoundingBoxes,
        FilterMessageTypes: subscription.FilterMessageTypes,
      }),
    );
  };

  const openUpstream = () => {
    upstream = new WebSocket(AISSTREAM_URL);

    upstream.onopen = () => {
      upstreamOpen = true;
      sendSubscription();
    };

    upstream.onmessage = async (ev) => {
      // Pass through to client (so existing clients still get the firehose
      // if they want it). The DB is the source of truth for new code.
      if (clientOpen && client.readyState === WebSocket.OPEN) {
        client.send(ev.data);
      }
      // Persist to DB.
      try {
        const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
        const type = msg.MessageType as string | undefined;
        const meta = (msg.MetaData ?? {}) as Record<string, unknown>;
        const mmsi = String(meta.MMSI ?? "");
        if (!mmsi) return;
        if (type === "PositionReport") await persistPosition(mmsi, msg);
        else if (type === "ShipStaticData") await persistStatic(mmsi, msg);
      } catch (err) {
        console.warn("[ais-proxy] persist error", err);
      }
    };

    upstream.onerror = (err) => {
      console.error("[ais-proxy] upstream error", err);
    };

    upstream.onclose = (ev) => {
      upstreamOpen = false;
      if (clientOpen && client.readyState === WebSocket.OPEN) {
        client.close(1011, `upstream closed: ${ev.code}`);
      }
    };
  };

  client.onopen = () => {
    clientOpen = true;
    openUpstream();
  };

  client.onmessage = (ev) => {
    try {
      const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
      if (msg && typeof msg === "object") {
        if (Array.isArray(msg.BoundingBoxes)) subscription.BoundingBoxes = msg.BoundingBoxes;
        if (Array.isArray(msg.FilterMessageTypes)) subscription.FilterMessageTypes = msg.FilterMessageTypes;
        if (upstreamOpen) sendSubscription();
      }
    } catch {
      // ignore non-JSON pings
    }
  };

  client.onclose = () => {
    clientOpen = false;
    if (upstream && upstream.readyState === WebSocket.OPEN) upstream.close();
  };

  client.onerror = (err) => {
    console.error("[ais-proxy] client error", err);
  };

  return response;
});
