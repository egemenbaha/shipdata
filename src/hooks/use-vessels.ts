import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { VesselRow } from "@/types/db";

/**
 * Loads the current vessel fleet from the `vessels` table and keeps it in sync
 * via a realtime channel. The Edge Function (`ais-proxy`) writes UPSERTs into
 * this table on every PositionReport / ShipStaticData message — so we just
 * listen to it.
 */
export function useVessels(): {
  vessels: Map<string, VesselRow>;
  status: "loading" | "ready" | "error";
} {
  const [vessels, setVessels] = useState<Map<string, VesselRow>>(new Map());
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const flushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Map<string, VesselRow> | null>(null);

  const scheduleFlush = (next: Map<string, VesselRow>) => {
    pendingRef.current = next;
    if (flushRef.current) return;
    flushRef.current = setTimeout(() => {
      flushRef.current = null;
      if (pendingRef.current) {
        setVessels(pendingRef.current);
        pendingRef.current = null;
      }
    }, 300);
  };

  // Keep a stable ref to current state for the realtime callback.
  const vesselsRef = useRef(vessels);
  vesselsRef.current = vessels;

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    try {
      // 1) initial snapshot — cast via `any` because the generated Supabase
      // types may not include `vessels` until the schema cache refreshes.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("vessels")
        .select("*")
        .then(
          ({ data, error }: { data: VesselRow[] | null; error: { message: string } | null }) => {
            if (cancelled) return;
            if (error) {
              console.warn("[vessels] load failed", error.message);
              setStatus("error");
              return;
            }
            const map = new Map<string, VesselRow>();
            for (const row of data ?? []) {
              if (row?.mmsi) map.set(row.mmsi, row);
            }
            setVessels(map);
            setStatus("ready");
          },
          (err: unknown) => {
            if (cancelled) return;
            console.warn("[vessels] load threw", err);
            setStatus("error");
          },
        );

      // 2) realtime — apply both INSERT and UPDATE events
      channel = supabase
        .channel("vessels-live")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "vessels" },
          (payload) => {
            try {
              const row = payload.new as VesselRow | undefined;
              if (!row?.mmsi) return;
              const current = pendingRef.current ?? new Map(vesselsRef.current);
              current.set(row.mmsi, row);
              scheduleFlush(current);
            } catch (err) {
              console.warn("[vessels] realtime handler error", err);
            }
          },
        )
        .subscribe();
    } catch (err) {
      console.warn("[vessels] subscription setup failed", err);
      setStatus("error");
    }

    return () => {
      cancelled = true;
      if (flushRef.current) clearTimeout(flushRef.current);
      if (channel) void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { vessels, status };
}
