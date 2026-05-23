import { Fragment } from "react";
import { Marker, Polyline, Tooltip } from "react-leaflet";
import L from "leaflet";
import { useTimeline } from "@/state/timeline";
import { formatMinutes } from "@/lib/derive";

function rendezvousIcon() {
  return L.divIcon({
    className: "rendezvous-marker",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `
      <div style="
        position:relative;width:22px;height:22px;border-radius:9999px;
        background:rgba(0,0,0,.55);
        border:1.5px solid var(--amber);
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 0 12px -2px var(--amber);
      ">
        <span style="
          position:absolute;inset:-5px;border-radius:9999px;
          border:1px solid var(--amber);opacity:.45;
          animation:pulse-ring 1.8s ease-out infinite;
        "></span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
             stroke="var(--amber)" stroke-width="2.4"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 12h6"/>
          <path d="M14 12h6"/>
          <path d="M9 8l-4 4 4 4"/>
          <path d="M15 8l4 4-4 4"/>
        </svg>
      </div>
    `,
  });
}

export function RendezvousLayer() {
  const { rendezvous, currentTime } = useTimeline();

  return (
    <>
      {rendezvous.map((r) => {
        if (!r.a.lastPoint || !r.b.lastPoint) return null;
        const a: [number, number] = [r.a.lastPoint.lat, r.a.lastPoint.lng];
        const b: [number, number] = [r.b.lastPoint.lat, r.b.lastPoint.lng];
        const mid: [number, number] = [r.midpoint.lat, r.midpoint.lng];
        const durMin = (Math.min(currentTime, r.lastT) - r.since) / 60_000;

        return (
          <Fragment key={r.id}>
            <Polyline
              positions={[a, b]}
              pathOptions={{ color: "var(--amber)", weight: 8, opacity: 0.18 }}
            />
            <Polyline
              positions={[a, b]}
              pathOptions={{
                color: "var(--amber)",
                weight: 1.6,
                opacity: 0.95,
                dashArray: "2 4",
              }}
            />
            <Marker position={mid} icon={rendezvousIcon()}>
              <Tooltip
                direction="top"
                offset={[0, -10]}
                opacity={1}
                className="vessel-tooltip"
              >
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  <div style={{ color: "var(--amber)", letterSpacing: ".12em" }}>
                    POSSIBLE STS TRANSFER
                  </div>
                  <div style={{ color: "var(--muted-foreground)" }}>
                    {r.a.vessel.name} ↔ {r.b.vessel.name}
                  </div>
                  <div style={{ color: "var(--amber)", marginTop: 4 }}>
                    {Math.round(r.minSeparationNm * 1852)} m ·{" "}
                    {formatMinutes(durMin)} sustained
                  </div>
                </div>
              </Tooltip>
            </Marker>
          </Fragment>
        );
      })}
    </>
  );
}
