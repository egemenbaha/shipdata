import { X, Shield, AlertTriangle, EyeOff, Radio, ArrowLeftRight, Compass, MapPin } from "lucide-react";
import { useEffect } from "react";
import type { DbAlert } from "@/hooks/use-live-alerts";

type Props = {
  alert: DbAlert | null;
  onClose: () => void;
  onFocus?: (mmsi: string) => void;
};

function classification(score: number) {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MODERATE";
  if (score >= 20) return "LOW";
  return "INFO";
}

function meta(type: DbAlert["alert_type"]) {
  switch (type) {
    case "DARK":
      return { Icon: EyeOff, accent: "var(--danger)", label: "SIGNAL LOSS / DARK VESSEL" };
    case "SPOOFING":
      return { Icon: Radio, accent: "var(--danger)", label: "AIS SPOOFING" };
    case "STS":
      return { Icon: ArrowLeftRight, accent: "var(--amber)", label: "SHIP-TO-SHIP TRANSFER" };
    case "COURSE_DEV":
    default:
      return { Icon: Compass, accent: "var(--amber)", label: "COURSE DEVIATION" };
  }
}

function fmtUtc(iso: string) {
  const d = new Date(iso);
  return `${d.toISOString().slice(11, 19)}Z ${d.toISOString().slice(0, 10)}`;
}

function fmtCoord(lat?: number | null, lng?: number | null) {
  if (lat == null || lng == null) return "—";
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${ns}  ${Math.abs(lng).toFixed(4)}°${ew}`;
}

function detailLines(a: DbAlert): Array<[string, string]> {
  const d = a.details ?? {};
  const out: Array<[string, string]> = [];
  if (a.alert_type === "DARK") {
    if (typeof d.minutes_dark === "number") out.push(["DURATION DARK", `${Math.round(d.minutes_dark)} min`]);
    if (typeof d.last_seen === "string") out.push(["LAST CONTACT", fmtUtc(d.last_seen)]);
  }
  if (a.alert_type === "STS") {
    if (typeof d.distance_m === "number") out.push(["SEPARATION", `${Math.round(d.distance_m)} m`]);
    if (d.partner_name || d.partner_mmsi) {
      out.push(["PARTNER", `${d.partner_name ?? "—"}  (MMSI ${d.partner_mmsi ?? "—"})`]);
    }
  }
  if (a.alert_type === "COURSE_DEV") {
    if (typeof d.prev_heading === "number" && typeof d.new_heading === "number") {
      out.push(["HEADING CHANGE", `${Math.round(d.prev_heading)}° → ${Math.round(d.new_heading)}°`]);
    }
    if (typeof d.delta_deg === "number") out.push(["DELTA", `${Math.round(d.delta_deg)}°`]);
  }
  if (a.alert_type === "SPOOFING") {
    const impl = d.implied_speed_kn as number | undefined;
    if (typeof impl === "number") out.push(["IMPLIED SPEED", `${Math.round(impl)} kn`]);
    out.push(["ASSESSMENT", "Physically impossible — likely AIS spoofing"]);
  }
  // Generic passthrough for anything else in details JSONB.
  const known = new Set([
    "minutes_dark", "last_seen", "distance_m", "partner_mmsi", "partner_name",
    "partner_lat", "partner_lng", "mmsi_a", "mmsi_b",
    "prev_heading", "new_heading", "delta_deg", "implied_speed_kn",
  ]);
  for (const [k, v] of Object.entries(d)) {
    if (known.has(k)) continue;
    if (v == null) continue;
    if (typeof v === "object") continue;
    out.push([k.replace(/_/g, " ").toUpperCase(), String(v)]);
  }
  return out;
}

export function AlertBriefModal({ alert, onClose, onFocus }: Props) {
  useEffect(() => {
    if (!alert) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [alert, onClose]);

  if (!alert) return null;
  const { Icon, accent, label } = meta(alert.alert_type);
  const cls = classification(alert.risk_score);
  const lines = detailLines(alert);

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] border bg-surface-0 shadow-2xl animate-scale-in"
        style={{ borderColor: accent, boxShadow: `0 0 32px -8px ${accent}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-4 py-2.5"
          style={{
            borderColor: accent,
            background: `linear-gradient(90deg, color-mix(in oklab, ${accent} 18%, transparent), transparent)`,
          }}
        >
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5" style={{ color: accent }} />
            <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-foreground">
              AI Intelligence Brief
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Classification banner */}
        <div
          className="flex items-center justify-between px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em]"
          style={{
            background: `color-mix(in oklab, ${accent} 12%, transparent)`,
            color: accent,
          }}
        >
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            CLASSIFICATION · {cls}
          </span>
          <span className="tabular-nums">REF/{alert.id.slice(0, 8).toUpperCase()}</span>
        </div>

        {/* Body */}
        <div className="space-y-4 px-4 py-4">
          {/* Title */}
          <div className="flex items-start gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border"
              style={{ borderColor: accent, color: accent, background: `color-mix(in oklab, ${accent} 8%, transparent)` }}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: accent }}>
                {label}
              </div>
              <div className="mt-0.5 truncate font-mono text-[14px] text-foreground">
                {alert.vessel_name?.trim() || `MMSI ${alert.mmsi}`}
              </div>
              <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                MMSI {alert.mmsi}
              </div>
            </div>
          </div>

          {/* Risk gauge */}
          <div>
            <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span>Risk Score</span>
              <span className="tabular-nums" style={{ color: accent }}>
                {alert.risk_score} / 100
              </span>
            </div>
            <RiskBar score={alert.risk_score} />
          </div>

          {/* Coordinates */}
          <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-3 font-mono text-[10px]">
            <div>
              <div className="uppercase tracking-[0.18em] text-muted-foreground">Position</div>
              <div className="mt-1 flex items-center gap-1.5 tabular-nums text-foreground">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                {fmtCoord(alert.lat, alert.lng)}
              </div>
            </div>
            <div>
              <div className="uppercase tracking-[0.18em] text-muted-foreground">Detected</div>
              <div className="mt-1 tabular-nums text-foreground">{fmtUtc(alert.created_at)}</div>
            </div>
          </div>

          {/* Type-specific details */}
          {lines.length > 0 && (
            <div className="border-t border-border/60 pt-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Tactical Data
              </div>
              <dl className="mt-2 space-y-1.5 font-mono text-[11px]">
                {lines.map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3">
                    <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</dt>
                    <dd className="text-right text-foreground" style={{ color: accent }}>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Narrative */}
          {alert.message && (
            <div className="border-t border-border/60 pt-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Analyst Note
              </div>
              <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-foreground/90">
                {alert.message}
              </p>
            </div>
          )}

          {/* Actions */}
          {onFocus && (
            <div className="flex justify-end gap-2 border-t border-border/60 pt-3">
              <button
                type="button"
                onClick={onClose}
                className="border border-border bg-surface-1 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:bg-surface-2"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => { onFocus(alert.mmsi); onClose(); }}
                className="border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em]"
                style={{ borderColor: accent, color: accent, background: `color-mix(in oklab, ${accent} 14%, transparent)` }}
              >
                Focus on Map →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RiskBar({ score }: { score: number }) {
  const s = Math.max(0, Math.min(100, score));
  // Green → amber → red gradient stop at the current score.
  const stops = `linear-gradient(90deg,
    var(--nominal) 0%,
    var(--amber) 50%,
    var(--danger) 100%)`;
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-sm bg-surface-2">
      <div
        className="absolute inset-y-0 left-0"
        style={{ width: `${s}%`, background: stops }}
      />
    </div>
  );
}
