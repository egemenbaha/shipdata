import { useMemo } from "react";
import { Marker, Polyline, Tooltip } from "react-leaflet";
import L from "leaflet";
import { useTimeline } from "@/state/timeline";
import {
  bearingDeg,
  projectPoint,
  type DerivedVessel,
} from "@/lib/derive";

// ---- icons ---------------------------------------------------------------

const STATUS_COLOR = {
  nominal: "var(--nominal)",
  spoofing: "var(--danger)",
  dark: "var(--danger)",
} as const;

function vesselIcon(d: DerivedVessel, heading: number) {
  const color = STATUS_COLOR[d.status];
  const pulse = d.status !== "nominal";
  return L.divIcon({
    className: "vessel-marker",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `
      <div style="position:relative;width:22px;height:22px;">
        ${
          pulse
            ? `<span style="
                position:absolute;inset:-4px;border-radius:9999px;
                border:1px solid ${color};opacity:.5;
                animation:pulse-ring 1.6s ease-out infinite;
              "></span>`
            : ""
        }
        <svg viewBox="-12 -12 24 24" width="22" height="22"
             style="transform:rotate(${heading}deg);
                    filter:drop-shadow(0 0 4px ${color});">
          <polygon points="0,-9 6,7 0,3 -6,7"
                   fill="${color}"
                   stroke="rgba(0,0,0,.6)" stroke-width="1"/>
        </svg>
      </div>
    `,
  });
}

function signalLostIcon() {
  return L.divIcon({
    className: "signal-lost-marker",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `
      <div style="
        width:28px;height:28px;border-radius:9999px;
        background:rgba(0,0,0,.55);
        border:1.5px dashed var(--danger);
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 0 12px -2px var(--danger);
      ">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="var(--danger)" stroke-width="2.2"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 2l20 20"/>
          <path d="M8.5 16.5a5 5 0 0 1 7 0"/>
          <path d="M5 12.5a10 10 0 0 1 5.2-2.8"/>
          <path d="M19 12.5a10 10 0 0 0-2.8-1.9"/>
          <path d="M2 8.8A15 15 0 0 1 5.5 6.3"/>
          <path d="M22 8.8a15 15 0 0 0-7-3.6"/>
          <circle cx="12" cy="20" r=".9" fill="var(--danger)"/>
        </svg>
      </div>
    `,
  });
}

// ---- zigzag for spoofed jumps -------------------------------------------

function zigzagPath(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  segments = 7,
  amplitudeNm = 8,
): [number, number][] {
  const brg = bearingDeg(
    { lat: from.lat, lng: from.lng, t: 0, speed: 0 },
    { lat: to.lat, lng: to.lng, t: 0, speed: 0 },
  );
  const perp = (brg + 90) % 360;
  const pts: [number, number][] = [[from.lat, from.lng]];
  for (let i = 1; i < segments; i++) {
    const f = i / segments;
    const baseLat = from.lat + (to.lat - from.lat) * f;
    const baseLng = from.lng + (to.lng - from.lng) * f;
    const side = i % 2 === 0 ? -1 : 1;
    const p = projectPoint(baseLat, baseLng, perp, amplitudeNm * side);
    pts.push([p.lat, p.lng]);
  }
  pts.push([to.lat, to.lng]);
  return pts;
}

// ---- main layer ---------------------------------------------------------

export function VesselLayer() {
  const { derived } = useTimeline();

  return (
    <>
      {derived.map((d) => (
        <VesselRender key={d.vessel.mmsi} d={d} />
      ))}
    </>
  );
}

function VesselRender({ d }: { d: DerivedVessel }) {
  const { vessel, visibleTrack, lastPoint, status, minutesDark, spoofJump } = d;
  if (!lastPoint) return null;

  // heading from last two points (fallback 0)
  const heading = useMemo(() => {
    if (visibleTrack.length < 2) return 0;
    return bearingDeg(
      visibleTrack[visibleTrack.length - 2],
      visibleTrack[visibleTrack.length - 1],
    );
  }, [visibleTrack]);

  // trail polyline (last few visible pings)
  const trail: [number, number][] = visibleTrack.map((p) => [p.lat, p.lng]);

  const color =
    status === "nominal" ? "oklch(0.78 0.18 150)" : "oklch(0.65 0.26 22)";

  // For spoofing vessels: split trail around the impossible jump.
  let preJump: [number, number][] = trail;
  let postJump: [number, number][] = [];
  let zigzag: [number, number][] = [];
  if (spoofJump) {
    const idx = visibleTrack.findIndex((p) => p.t === spoofJump.to.t);
    if (idx > 0) {
      preJump = trail.slice(0, idx);
      postJump = trail.slice(idx);
      zigzag = zigzagPath(spoofJump.from, spoofJump.to);
    }
  }

  // Projected heading for dark vessels (~30 nm forward = ~2h at 15 kts).
  const projection =
    status === "dark"
      ? projectPoint(lastPoint.lat, lastPoint.lng, heading, 35)
      : null;

  return (
    <>
      {/* Trail */}
      {status !== "spoofing" ? (
        trail.length > 1 && (
          <Polyline
            positions={trail}
            pathOptions={{
              color,
              weight: 1.4,
              opacity: status === "dark" ? 0.55 : 0.5,
            }}
          />
        )
      ) : (
        <>
          {preJump.length > 1 && (
            <Polyline
              positions={preJump}
              pathOptions={{ color: "oklch(0.78 0.18 150)", weight: 1.4, opacity: 0.4 }}
            />
          )}
          {postJump.length > 1 && (
            <Polyline
              positions={postJump}
              pathOptions={{ color, weight: 1.4, opacity: 0.5, dashArray: "3 4" }}
            />
          )}
          {zigzag.length > 1 && (
            <>
              <Polyline
                positions={zigzag}
                pathOptions={{
                  color: "var(--danger)",
                  weight: 2.4,
                  opacity: 0.95,
                }}
              />
              <Polyline
                positions={zigzag}
                pathOptions={{
                  color: "var(--danger)",
                  weight: 8,
                  opacity: 0.18,
                }}
              />
            </>
          )}
        </>
      )}

      {/* Dark projection: dashed line + ghost endpoint */}
      {projection && (
        <>
          <Polyline
            positions={[
              [lastPoint.lat, lastPoint.lng],
              [projection.lat, projection.lng],
            ]}
            pathOptions={{
              color: "var(--danger)",
              weight: 1.4,
              opacity: 0.75,
              dashArray: "6 6",
            }}
          />
          <Marker
            position={[projection.lat, projection.lng]}
            icon={L.divIcon({
              className: "",
              iconSize: [10, 10],
              iconAnchor: [5, 5],
              html: `<div style="
                width:10px;height:10px;border-radius:9999px;
                border:1px dashed var(--danger);opacity:.7;
              "></div>`,
            })}
            interactive={false}
          />
        </>
      )}

      {/* Vessel marker — at last known point */}
      <Marker
        position={[lastPoint.lat, lastPoint.lng]}
        icon={
          status === "dark"
            ? signalLostIcon()
            : vesselIcon(d, heading)
        }
      >
        <Tooltip
          direction="top"
          offset={[0, -10]}
          opacity={1}
          className="vessel-tooltip"
        >
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
            <div style={{ color: "var(--cyan)", letterSpacing: ".12em" }}>
              {vessel.name}
            </div>
            <div style={{ color: "var(--muted-foreground)" }}>
              {vessel.flag} · MMSI {vessel.mmsi} · {vessel.type.toUpperCase()}
            </div>
            <div style={{ color, marginTop: 4 }}>
              {status === "dark"
                ? `SIGNAL LOST · ${Math.round(minutesDark)}m ago`
                : status === "spoofing"
                  ? `SPOOFING · ${Math.round(spoofJump?.impliedKts ?? 0)} kts implied`
                  : `NOMINAL · ${lastPoint.speed.toFixed(1)} kts · HDG ${Math.round(heading)}°`}
            </div>
          </div>
        </Tooltip>
      </Marker>
    </>
  );
}
