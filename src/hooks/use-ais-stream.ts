import { useEffect, useRef, useState } from "react";

export type LiveShip = {
  mmsi: string;
  lat: number;
  lng: number;
  speed: number; // knots
  course: number; // degrees
  lastUpdate: number; // ms
  // From ShipStaticData
  name?: string;
  imo?: number;
  shipType?: number;
};

// Bounding box per user spec — Turkish Straits + Marmara.
const BBOX: [number, number][][] = [[[40.0, 26.0], [41.7, 30.3]]];

const STREAM_URL = "wss://stream.aisstream.io/v0/stream";

/**
 * Connects to AISStream.io and exposes a live MMSI → LiveShip map.
 * The map is replaced on every update so React detects the change.
 */
export function useAisStream(): {
  ships: Map<string, LiveShip>;
  status: "idle" | "connecting" | "open" | "closed" | "error" | "no-key";
} {
  const [ships, setShips] = useState<Map<string, LiveShip>>(new Map());
  const [status, setStatus] = useState<
    "idle" | "connecting" | "open" | "closed" | "error" | "no-key"
  >("idle");
  const shipsRef = useRef(ships);
  shipsRef.current = ships;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const apiKey = import.meta.env.VITE_AISSTREAM_API_KEY as string | undefined;
    if (!apiKey) {
      setStatus("no-key");
      return;
    }

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let pending: Map<string, LiveShip> | null = null;

    const scheduleFlush = (next: Map<string, LiveShip>) => {
      pending = next;
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        if (pending) {
          setShips(pending);
          shipsRef.current = pending;
          pending = null;
        }
      }, 250);
    };

    const connect = () => {
      setStatus("connecting");
      ws = new WebSocket(STREAM_URL);

      ws.onopen = () => {
        setStatus("open");
        ws?.send(
          JSON.stringify({
            APIKey: apiKey,
            BoundingBoxes: BBOX,
            FilterMessageTypes: ["PositionReport", "ShipStaticData"],
          }),
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          const type: string | undefined = msg.MessageType;
          const meta = msg.MetaData ?? {};
          const mmsi = String(meta.MMSI ?? "");
          if (!mmsi) return;

          const current = pending ?? new Map(shipsRef.current);
          const prev = current.get(mmsi);

          if (type === "PositionReport") {
            const pr = msg.Message?.PositionReport;
            if (!pr) return;
            const lat = Number(pr.Latitude ?? meta.latitude);
            const lng = Number(pr.Longitude ?? meta.longitude);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
            current.set(mmsi, {
              ...(prev ?? { mmsi }),
              mmsi,
              lat,
              lng,
              speed: Number(pr.Sog ?? 0),
              course: Number(pr.Cog ?? 0),
              lastUpdate: Date.now(),
            });
            scheduleFlush(current);
          } else if (type === "ShipStaticData") {
            const sd = msg.Message?.ShipStaticData;
            if (!sd) return;
            const lat = Number(prev?.lat ?? meta.latitude ?? 0);
            const lng = Number(prev?.lng ?? meta.longitude ?? 0);
            current.set(mmsi, {
              ...(prev ?? {
                mmsi,
                lat,
                lng,
                speed: 0,
                course: 0,
                lastUpdate: Date.now(),
              }),
              name: String(sd.Name ?? prev?.name ?? "").trim() || prev?.name,
              imo: Number(sd.ImoNumber ?? prev?.imo ?? 0) || prev?.imo,
              shipType: Number(sd.Type ?? prev?.shipType ?? 0) || prev?.shipType,
            });
            scheduleFlush(current);
          }
        } catch (err) {
          console.warn("[aisstream] parse error", err);
        }
      };

      ws.onerror = () => setStatus("error");

      ws.onclose = () => {
        setStatus("closed");
        if (closed) return;
        reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (flushTimer) clearTimeout(flushTimer);
      ws?.close();
    };
  }, []);

  return { ships, status };
}
