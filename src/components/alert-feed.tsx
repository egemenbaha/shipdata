import { EyeOff, Radio, Inbox, ArrowLeftRight, Compass } from "lucide-react";
import { useMemo, useState } from "react";
import { useTimeline } from "@/state/timeline";
import { formatUtc, type Alert } from "@/lib/derive";
import { useLiveAlerts, type DbAlert, type DbAlertType } from "@/hooks/use-live-alerts";
import { AlertBriefModal } from "./alert-brief-modal";

type FeedAlert = {
  // Original computed alert fields (subset)
  id: string;
  mmsi: string;
  name: string;
  flag: string;
  type: "dark" | "spoofing" | "course_dev" | "rendezvous" | "sts";
  severity: 1 | 2 | 3;
  since: number;
  detail: string;
  // Live-only
  riskScore?: number;
  dbType?: DbAlertType;
  details?: DbAlert["details"];
  dbRow?: DbAlert;
};

function alertMeta(type: FeedAlert["type"]) {
  switch (type) {
    case "dark":
      return { Icon: EyeOff, accent: "var(--danger)", label: "SIGNAL LOSS" };
    case "spoofing":
      return { Icon: Radio, accent: "var(--danger)", label: "SPOOFING" };
    case "course_dev":
      return { Icon: Compass, accent: "var(--amber)", label: "COURSE DEV" };
    case "sts":
      return { Icon: ArrowLeftRight, accent: "var(--amber)", label: "STS TRANSFER" };
    case "rendezvous":
    default:
      return { Icon: ArrowLeftRight, accent: "var(--amber)", label: "RENDEZVOUS" };
  }
}

// Type-specific subtitle pulled from details JSONB.
function typeDetail(a: FeedAlert): string | null {
  const d = a.details ?? {};
  if (a.type === "dark" && typeof d.minutes_dark === "number") {
    return `Dark for ${Math.round(d.minutes_dark)} min`;
  }
  if (a.type === "sts" && typeof d.distance_m === "number") {
    return `Separation ${Math.round(d.distance_m)} m`;
  }
  if (a.type === "course_dev" && typeof d.delta_deg === "number") {
    return `ΔHDG ${Math.round(d.delta_deg)}°`;
  }
  if (a.type === "spoofing" && typeof d.implied_speed_kn === "number") {
    return `Implied ${Math.round(d.implied_speed_kn)} kn (impossible)`;
  }
  return null;
}

function RiskBar({ score }: { score: number }) {
  const s = Math.max(0, Math.min(100, score));
  const stops = `linear-gradient(90deg, var(--nominal) 0%, var(--amber) 50%, var(--danger) 100%)`;
  return (
    <div className="relative h-1 w-full overflow-hidden rounded-sm bg-surface-2">
      <div className="absolute inset-y-0 left-0" style={{ width: `${s}%`, background: stops }} />
    </div>
  );
}

function AlertRow({ alert, now, onClick }: { alert: FeedAlert; now: number; onClick: () => void }) {
  const { Icon, accent, label } = alertMeta(alert.type);
  const ageMin = Math.max(0, Math.round((now - alert.since) / 60_000));
  const ageLabel = ageMin === 0 ? "just now" : `${formatMinutes(ageMin)} ago`;
  const score = alert.riskScore ?? alert.severity * 30;
  const isHigh = score >= 80;
  const sub = typeDetail(alert);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative block w-full cursor-pointer border-b border-border/60 bg-surface-1 px-3 py-2.5 text-left transition-colors hover:bg-surface-2 focus:outline-none focus-visible:bg-surface-2"
      style={{
        borderLeft: `2px solid ${accent}`,
        background: isHigh
          ? `linear-gradient(90deg, color-mix(in oklab, ${accent} 8%, transparent), transparent)`
          : undefined,
      }}
    >
      <div className="flex items-start gap-2">
        <div className="relative mt-0.5">
          <Icon className="h-3.5 w-3.5" style={{ color: accent }} />
          {isHigh && (
            <span
              className="absolute -inset-1 rounded-full alert-pulse"
              style={{ color: accent }}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span
              className="font-mono text-[10px] font-medium uppercase tracking-[0.18em]"
              style={{ color: accent }}
            >
              {label}
            </span>
            <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
              Detected {ageLabel}
            </span>
          </div>
          <div className="mt-1 truncate font-mono text-[12px] text-foreground">
            {alert.name}
          </div>
          <div className="mt-0.5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            <span>{alert.flag}</span>
            <span className="text-border">·</span>
            <span className="tabular-nums">MMSI {alert.mmsi}</span>
          </div>

          {/* Risk score bar */}
          <div className="mt-2 flex items-center gap-2">
            <RiskBar score={score} />
            <span
              className="shrink-0 rounded-sm px-1.5 py-px font-mono text-[9px] tabular-nums"
              style={{
                color: accent,
                background: `color-mix(in oklab, ${accent} 14%, transparent)`,
              }}
            >
              {Math.round(score)}
            </span>
          </div>

          {sub && (
            <div className="mt-1.5 font-mono text-[10px] tabular-nums" style={{ color: accent }}>
              {sub}
            </div>
          )}
          {alert.detail && !sub && (
            <div className="mt-1.5 font-mono text-[10px] text-muted-foreground/90">
              {alert.detail}
            </div>
          )}
          <div className="mt-1 font-mono text-[9px] tabular-nums text-muted-foreground/60">
            Since {formatUtc(alert.since)} UTC
          </div>
        </div>
      </div>
    </button>
  );
}

function dbToFeed(a: DbAlert): FeedAlert {
  const type: FeedAlert["type"] =
    a.alert_type === "DARK"
      ? "dark"
      : a.alert_type === "COURSE_DEV"
        ? "course_dev"
        : a.alert_type === "STS"
          ? "sts"
          : "spoofing";
  const severity: 1 | 2 | 3 = a.risk_score >= 80 ? 3 : a.risk_score >= 40 ? 2 : 1;
  return {
    id: `db-${a.id}`,
    mmsi: a.mmsi,
    name: a.vessel_name?.trim() || `MMSI ${a.mmsi}`,
    flag: "LIVE",
    type,
    severity,
    since: new Date(a.created_at).getTime(),
    detail: a.message ?? "",
    riskScore: a.risk_score,
    dbType: a.alert_type,
    details: a.details ?? undefined,
    dbRow: a,
  };
}

function computedToFeed(a: Alert): FeedAlert {
  return {
    id: a.id,
    mmsi: a.mmsi,
    name: a.name,
    flag: a.flag,
    type: a.type,
    severity: a.severity,
    since: a.since,
    detail: a.detail,
    riskScore: a.riskScore,
  };
}

export function AlertFeed() {
  const { alerts, currentTime, focusVessel } = useTimeline();
  const dbAlerts = useLiveAlerts(50);
  const [briefAlert, setBriefAlert] = useState<DbAlert | null>(null);

  const merged: FeedAlert[] = useMemo(() => {
    const live = dbAlerts.map(dbToFeed);
    const liveKey = new Set(live.map((a) => `${a.mmsi}-${a.type}`));
    const filtered = alerts
      .filter((a) => !liveKey.has(`${a.mmsi}-${a.type}`))
      .map(computedToFeed);
    return [...live, ...filtered].sort(
      (a, b) =>
        (b.riskScore ?? b.severity * 30) - (a.riskScore ?? a.severity * 30) ||
        b.since - a.since,
    );
  }, [alerts, dbAlerts]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-y border-border bg-surface-0 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--cyan)] shadow-[0_0_8px_var(--cyan)]" />
          <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Alerts Center
          </h2>
          <span className="font-mono text-[10px] tabular-nums text-[var(--cyan)]">
            {merged.length}
          </span>
        </div>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          RISK ▼
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {merged.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="rounded-sm border border-dashed border-border bg-surface-1 p-4">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              No active alerts
            </p>
          </div>
        ) : (
          merged.map((a) => (
            <AlertRow
              key={a.id}
              alert={a}
              now={Math.max(currentTime, Date.now())}
              onClick={() => {
                if (a.dbRow) setBriefAlert(a.dbRow);
                else focusVessel(a.mmsi);
              }}
            />
          ))
        )}
      </div>

      <AlertBriefModal
        alert={briefAlert}
        onClose={() => setBriefAlert(null)}
        onFocus={focusVessel}
      />
    </div>
  );
}
