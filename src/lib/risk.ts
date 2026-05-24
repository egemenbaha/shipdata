// Transparent, additive risk scoring. Every contributing factor is named and
// scored so the UI can render a self-justifying breakdown.

import type { DerivedVessel, Rendezvous } from "@/lib/derive";

export type RiskFactor = {
  label: string;
  points: number;
  detail?: string;
};

export type RiskBreakdown = {
  total: number; // 0..100
  factors: RiskFactor[];
};

const SANCTIONED_FLAGS = new Set(["RU", "SY", "IR", "KP"]);
const FOC_FLAGS = new Set(["PA", "LR", "MT", "MH"]);

export function computeRisk(d: DerivedVessel, rendezvous: Rendezvous[]): RiskBreakdown {
  const factors: RiskFactor[] = [];

  // Signal loss: hours_dark × 12 (cap 36)
  if (d.status === "dark" && d.minutesDark > 0) {
    const hours = d.minutesDark / 60;
    const pts = Math.min(36, Math.round(hours * 12));
    if (pts > 0) {
      factors.push({
        label: "Signal loss",
        points: pts,
        detail: `${hours.toFixed(1)}h dark × 12 (cap 36)`,
      });
    }
  }

  // Spoofing detected: +45
  if (d.status === "spoofing") {
    factors.push({
      label: "Spoofing detected",
      points: 45,
      detail: d.spoofJump
        ? `Implied ${Math.round(d.spoofJump.impliedKts)} kts`
        : undefined,
    });
  }

  // Course deviation: +20 (sustained >35° heading change without dark/spoof)
  if (d.status === "course_dev") {
    factors.push({
      label: "Course deviation",
      points: 20,
      detail: "Sustained heading change > 35°",
    });
  }

  // STS / rendezvous: +30, + sustained_hours × 4 (cap +20), + 8 if sep < 300 m
  const sts = rendezvous.find(
    (r) =>
      r.a.vessel.mmsi === d.vessel.mmsi || r.b.vessel.mmsi === d.vessel.mmsi,
  );
  if (sts) {
    factors.push({ label: "STS rendezvous", points: 30 });
    const sustainedHours = Math.max(0, (sts.lastT - sts.since) / 3_600_000);
    const sustainedPts = Math.min(20, Math.round(sustainedHours * 4));
    if (sustainedPts > 0) {
      factors.push({
        label: "Sustained contact",
        points: sustainedPts,
        detail: `${sustainedHours.toFixed(1)}h × 4 (cap 20)`,
      });
    }
    const sepM = sts.minSeparationNm * 1852;
    if (sepM < 300) {
      factors.push({
        label: "Close separation",
        points: 8,
        detail: `${Math.round(sepM)} m (<300 m)`,
      });
    }
  }

  // Inside smuggling corridor: +20
  if (d.inCorridor) {
    factors.push({ label: "Inside smuggling corridor", points: 20 });
  }

  // Flag risk
  const flag = d.vessel.flag?.toUpperCase();
  if (flag && SANCTIONED_FLAGS.has(flag)) {
    factors.push({
      label: "Sanctioned flag",
      points: 18,
      detail: flag,
    });
  } else if (flag && FOC_FLAGS.has(flag)) {
    factors.push({
      label: "Flag of convenience",
      points: 8,
      detail: flag,
    });
  }

  const raw = factors.reduce((s, f) => s + f.points, 0);
  const total = Math.max(0, Math.min(100, raw));
  return { total, factors };
}
