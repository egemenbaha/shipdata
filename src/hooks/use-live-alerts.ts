import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type DbAlertType = "DARK" | "COURSE_DEV" | "SPOOFING" | "STS";

export type DbAlertDetails = {
  // DARK
  minutes_dark?: number;
  last_seen?: string;
  // STS
  distance_m?: number;
  partner_mmsi?: string;
  partner_name?: string;
  partner_lat?: number;
  partner_lng?: number;
  mmsi_a?: string;
  mmsi_b?: string;
  // COURSE_DEV
  prev_heading?: number;
  new_heading?: number;
  delta_deg?: number;
  // SPOOFING
  implied_speed_kn?: number;
  // Free-form passthrough
  [k: string]: unknown;
};

export type DbAlert = {
  id: string;
  mmsi: string;
  vessel_name: string | null;
  alert_type: DbAlertType;
  risk_score: number;
  lat: number | null;
  lng: number | null;
  heading: number | null;
  message: string | null;
  resolved: boolean;
  created_at: string;
  details?: DbAlertDetails | null;
};

/**
 * Subscribes to the alerts table and returns the latest N rows, newest first.
 * Realtime is enabled on the table so new inserts appear instantly.
 */
export function useLiveAlerts(limit = 100): DbAlert[] {
  const [alerts, setAlerts] = useState<DbAlert[]>([]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    try {
      supabase
        .from("alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit)
        .then(
          ({ data, error }) => {
            if (cancelled) return;
            if (error) {
              console.warn("[alerts] load failed", error.message);
              return;
            }
            setAlerts((data ?? []) as unknown as DbAlert[]);
          },
          (err) => {
            if (cancelled) return;
            console.warn("[alerts] load threw", err);
          },
        );

      channel = supabase
        .channel("alerts-feed")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "alerts" },
          (payload) => {
            try {
              setAlerts((prev) => [payload.new as DbAlert, ...prev].slice(0, limit));
            } catch (err) {
              console.warn("[alerts] realtime handler error", err);
            }
          },
        )
        .subscribe();
    } catch (err) {
      console.warn("[alerts] subscription setup failed", err);
    }

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [limit]);

  return alerts;
}
