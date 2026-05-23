import { Polygon, Tooltip } from "react-leaflet";
import { THEATERS, type TheaterId } from "@/data/vessels";
import { useTimeline } from "@/state/timeline";

export function CorridorLayer() {
  const { theater } = useTimeline();
  const visible = THEATERS.filter(
    (t) => theater === "global" || (theater as TheaterId) === t.id,
  );

  return (
    <>
      {visible.map((t) => (
        <Polygon
          key={t.id}
          positions={t.corridor as unknown as [number, number][]}
          pathOptions={{
            color: "oklch(0.8 0.17 75)",
            weight: 1.2,
            opacity: 0.85,
            dashArray: "4 4",
            fillColor: "oklch(0.8 0.17 75)",
            fillOpacity: 0.07,
          }}
        >
          <Tooltip
            direction="center"
            permanent
            className="vessel-tooltip"
            opacity={0.9}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--amber)",
              }}
            >
              ⚠ {t.corridorLabel}
            </div>
          </Tooltip>
        </Polygon>
      ))}
    </>
  );
}
