import { Fragment, useMemo } from "react";
import { Circle, Polyline, Tooltip } from "react-leaflet";
import { useLiveAlerts } from "@/hooks/use-live-alerts";
import { useVessels } from "@/hooks/use-vessels";

const MAX_AGE_MS = 30 * 60_000; // hide STS pairs older than 30 minutes

/**
 * Renders a dotted yellow boundary circle around the two vessels involved
 * in an STS (ship-to-ship) interaction. Pulls STS alerts from the DB and
 * looks up live vessel positions.
 */
export function StsPairLayer() {
  const dbAlerts = useLiveAlerts(100);
  const { vessels } = useVessels();

  const pairs = useMemo(() => {
    const cutoff = Date.now() - MAX_AGE_MS;
    const seen = new Set<string>();
    const out: Array<{
      id: string;
      a: { lat: number; lng: number; name: string; mmsi: string };
      b: { lat: number; lng: number; name: string; mmsi: string };
      distanceM: number;
      risk: number;
    }> = [];

    for (const a of dbAlerts) {
      if (a.alert_type !== "STS") continue;
      if (a.resolved) continue;
      const ts = new Date(a.created_at).getTime();
      if (ts < cutoff) continue;

      const d = a.details ?? {};
      const mmsiA = (d.mmsi_a as string) ?? a.mmsi;
      const mmsiB = (d.mmsi_b as string) ?? (d.partner_mmsi as string);
      if (!mmsiA || !mmsiB) continue;

      const key = [mmsiA, mmsiB].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);

      // Resolve positions: prefer live DB vessel; fall back to alert payload.
      const vA = vessels.get(mmsiA);
      const vB = vessels.get(mmsiB);

      const aLat = vA?.last_lat ?? a.lat ?? null;
      const aLng = vA?.last_lon ?? a.lng ?? null;
      const bLat = vB?.last_lat ?? (d.partner_lat as number | undefined) ?? null;
      const bLng = vB?.last_lon ?? (d.partner_lng as number | undefined) ?? null;

      if (aLat == null || aLng == null || bLat == null || bLng == null) continue;

      const distanceM =
        typeof d.distance_m === "number"
          ? d.distance_m
          : haversineMeters(aLat, aLng, bLat, bLng);

      out.push({
        id: a.id,
        a: { lat: aLat, lng: aLng, mmsi: mmsiA, name: vA?.name ?? a.vessel_name ?? mmsiA },
        b: { lat: bLat, lng: bLng, mmsi: mmsiB, name: vB?.name ?? (d.partner_name as string) ?? mmsiB },
        distanceM,
        risk: a.risk_score,
      });
    }
    return out;
  }, [dbAlerts, vessels]);

  return (
    <>
      {pairs.map((p) => {
        const midLat = (p.a.lat + p.b.lat) / 2;
        const midLng = (p.a.lng + p.b.lng) / 2;
        // Radius = half-distance + 200m breathing room; clamp minimum.
        const radiusM = Math.max(400, p.distanceM / 2 + 200);

        return (
          <Fragment key={p.id}>
            {/* Connecting hairline between the pair */}
            <Polyline
              positions={[
                [p.a.lat, p.a.lng],
                [p.b.lat, p.b.lng],
              ]}
              pathOptions={{
                color: "var(--amber)",
                weight: 1.2,
                opacity: 0.9,
                dashArray: "2 4",
              }}
            />
            {/* Inner amber glow */}
            <Circle
              center={[midLat, midLng]}
              radius={radiusM}
              pathOptions={{
                color: "var(--amber)",
                weight: 0,
                fillColor: "var(--amber)",
                fillOpacity: 0.06,
              }}
              interactive={false}
            />
            {/* Dotted boundary */}
            <Circle
              center={[midLat, midLng]}
              radius={radiusM}
              pathOptions={{
                color: "var(--amber)",
                weight: 1.8,
                opacity: 0.95,
                dashArray: "3 6",
                fill: false,
              }}
            >
              <Tooltip
                direction="top"
                offset={[0, -4]}
                opacity={1}
                className="vessel-tooltip"
                sticky
              >
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  <div style={{ color: "var(--amber)", letterSpacing: ".14em" }}>
                    STS INTERACTION · RISK {p.risk}
                  </div>
                  <div style={{ color: "var(--muted-foreground)" }}>
                    {p.a.name} ↔ {p.b.name}
                  </div>
                  <div style={{ color: "var(--amber)", marginTop: 4 }}>
                    {Math.round(p.distanceM)} m separation
                  </div>
                </div>
              </Tooltip>
            </Circle>
          </Fragment>
        );
      })}
    </>
  );
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
