import { Polygon, Tooltip } from "react-leaflet";
import { SMUGGLING_CORRIDOR } from "@/lib/derive";

export function CorridorLayer() {
  return (
    <Polygon
      positions={SMUGGLING_CORRIDOR as unknown as [number, number][]}
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
          ⚠ Known Smuggling Corridor
        </div>
      </Tooltip>
    </Polygon>
  );
}
