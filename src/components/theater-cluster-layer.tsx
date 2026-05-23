import { Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import { THEATERS } from "@/data/vessels";
import { useTimeline } from "@/state/timeline";

function clusterIcon(count: number, alerts: number) {
  const danger = alerts > 0;
  const size = 56;
  const color = danger ? "var(--danger)" : "var(--cyan)";
  return L.divIcon({
    className: "theater-cluster",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div style="
        position:relative;width:${size}px;height:${size}px;border-radius:9999px;
        background:rgba(8,12,18,.72);
        border:1.5px solid ${color};
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 0 18px -2px ${color};
        font-family:var(--font-mono);
      ">
        ${
          danger
            ? `<span style="
                position:absolute;inset:-6px;border-radius:9999px;
                border:1px solid ${color};opacity:.45;
                animation:pulse-ring 1.8s ease-out infinite;
              "></span>`
            : ""
        }
        <div style="text-align:center;line-height:1;">
          <div style="color:${color};font-size:14px;font-weight:600;letter-spacing:.05em;">${count}</div>
          <div style="color:${danger ? "var(--danger)" : "var(--muted-foreground)"};font-size:8px;letter-spacing:.15em;margin-top:3px;">
            ${danger ? `${alerts} ALERT${alerts === 1 ? "" : "S"}` : "TRACKS"}
          </div>
        </div>
      </div>
    `,
  });
}

export function TheaterClusterLayer() {
  const { theaterDerived, theaterAlerts, setTheater } = useTimeline();

  return (
    <>
      {THEATERS.map((t) => {
        const count = theaterDerived[t.id].filter((d) => d.lastPoint).length;
        const alerts = theaterAlerts[t.id].length;
        return (
          <Marker
            key={t.id}
            position={t.center}
            icon={clusterIcon(count, alerts)}
            eventHandlers={{ click: () => setTheater(t.id) }}
          >
            <Tooltip
              direction="top"
              offset={[0, -28]}
              opacity={1}
              className="vessel-tooltip"
            >
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                <div style={{ color: "var(--cyan)", letterSpacing: ".12em" }}>
                  {t.name.toUpperCase()}
                </div>
                <div style={{ color: "var(--muted-foreground)", marginTop: 2 }}>
                  {t.blurb}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    color: alerts > 0 ? "var(--danger)" : "var(--nominal)",
                  }}
                >
                  {count} tracks · {alerts} active alerts
                </div>
                <div
                  style={{
                    marginTop: 4,
                    color: "var(--muted-foreground)",
                    fontSize: 9,
                    letterSpacing: ".18em",
                  }}
                >
                  CLICK TO ENTER →
                </div>
              </div>
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}
