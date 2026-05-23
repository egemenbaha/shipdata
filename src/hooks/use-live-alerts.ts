import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type DbAlert = {
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
};

/**
 * Subscribes to the alerts table and returns the latest N rows, newest first.
 * Realtime is enabled on the table so new inserts appear instantly.
 */
export function useLiveAlerts(limit = 100): DbAlert[] {
  const [alerts, setAlerts] = useState<DbAlert[]>([]);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("alerts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn("[alerts] load failed", error.message);
          return;
        }
        setAlerts((data ?? []) as DbAlert[]);
      });

    const channel = supabase
      .channel("alerts-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alerts" },
        (payload) => {
          setAlerts((prev) => [payload.new as DbAlert, ...prev].slice(0, limit));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [limit]);

  return alerts;
}
