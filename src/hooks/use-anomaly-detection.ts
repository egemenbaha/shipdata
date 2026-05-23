import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { LiveShip } from "@/hooks/use-ais-stream";

export type LiveStatus = "nominal" | "dark" | "course_dev";

export type LiveAnomaly = {
  mmsi: string;
  status: LiveStatus;
  riskScore: number;
  /** course delta in degrees, if course_dev */
  courseDelta?: number;
  /** minutes since last position report, if dark */
  minutesDark?: number;
  /** last known heading (for dead-reckoning projection) */
  heading: number;
};

/** Hard thresholds per user spec. */
const DARK_THRESHOLD_MS = 15 * 60 * 1000;
const COURSE_DEV_DEG = 45;
/** Short window for course-deviation evaluation. */
const COURSE_WINDOW_MS = 10 * 60 * 1000;
/** Re-arm an alert of the same type for the same MMSI after this gap. */
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;

type HistoryEntry = {
  course: number;
  lat: number;
  lng: number;
  ts: number;
};

/**
 * Watches the live AIS ship map and:
 *   1. Flags ships as DARK after 15+ min without a PositionReport.
 *   2. Flags ships as COURSE_DEV on >45° heading change in <10 min.
 *   3. Inserts a deduped row into the `alerts` table for each new event.
 *
 * Returns a Map<mmsi, LiveAnomaly> for the UI layer to render badges /
 * dead-reckoning projections.
 */
export function useAnomalyDetection(ships: Map<string, LiveShip>): Map<string, LiveAnomaly> {
  const [anomalies, setAnomalies] = useState<Map<string, LiveAnomaly>>(new Map());
  const historyRef = useRef<Map<string, HistoryEntry>>(new Map());
  // Per-MMSI cooldown timestamps per alert type so we don't spam DB inserts.
  const lastAlertRef = useRef<Map<string, number>>(new Map());

  // 1) Update course/position history whenever a fresh ping arrives.
  useEffect(() => {
    const hist = historyRef.current;
    ships.forEach((s, mmsi) => {
      const prev = hist.get(mmsi);
      if (!prev || prev.ts !== s.lastUpdate) {
        hist.set(mmsi, {
          course: s.course,
          lat: s.lat,
          lng: s.lng,
          ts: s.lastUpdate,
        });
      }
    });
  }, [ships]);

  // 2) Tick every 10s: evaluate dark + course-dev, emit alerts.
  useEffect(() => {
    const evaluate = () => {
      const now = Date.now();
      const next = new Map<string, LiveAnomaly>();

      ships.forEach((s, mmsi) => {
        const age = now - s.lastUpdate;

        // --- DARK ---
        if (age > DARK_THRESHOLD_MS) {
          const minutesDark = age / 60_000;
          next.set(mmsi, {
            mmsi,
            status: "dark",
            riskScore: 85,
            minutesDark,
            heading: s.course,
          });
          maybeInsertAlert(s, "DARK", 85, `No AIS ping for ${Math.round(minutesDark)} min`);
          return;
        }

        // --- COURSE_DEV ---
        // Compare current course to a baseline captured ~COURSE_WINDOW_MS ago
        // (the very first ping we saw within that window).
        const hist = historyRef.current.get(mmsi);
        if (hist && now - hist.ts < COURSE_WINDOW_MS) {
          const delta = courseDelta(hist.course, s.course);
          if (delta > COURSE_DEV_DEG && s.speed > 1) {
            next.set(mmsi, {
              mmsi,
              status: "course_dev",
              riskScore: 50,
              courseDelta: delta,
              heading: s.course,
            });
            maybeInsertAlert(
              s,
              "COURSE_DEV",
              50,
              `Heading change ${Math.round(delta)}° in <10 min`,
            );
            return;
          }
        }
      });

      setAnomalies(next);
    };

    function maybeInsertAlert(
      s: LiveShip,
      type: "DARK" | "COURSE_DEV",
      riskScore: number,
      message: string,
    ) {
      const key = `${s.mmsi}:${type}`;
      const last = lastAlertRef.current.get(key) ?? 0;
      if (Date.now() - last < ALERT_COOLDOWN_MS) return;
      lastAlertRef.current.set(key, Date.now());

      void supabase
        .from("alerts")
        .insert({
          mmsi: s.mmsi,
          vessel_name: s.name ?? null,
          alert_type: type,
          risk_score: riskScore,
          lat: s.lat,
          lng: s.lng,
          heading: s.course,
          message,
        })
        .then(({ error }) => {
          if (error) console.warn("[alerts] insert failed", error.message);
        });
    }

    evaluate();
    const id = setInterval(evaluate, 10_000);
    return () => clearInterval(id);
  }, [ships]);

  return anomalies;
}

/** Smallest absolute angular difference between two compass headings. */
function courseDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
