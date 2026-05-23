import { EyeOff, Radio, Inbox, ArrowLeftRight, Compass } from "lucide-react";
import { useMemo } from "react";
import { useTimeline } from "@/state/timeline";
import { formatUtc, type Alert } from "@/lib/derive";
import { useLiveAlerts, type DbAlert } from "@/hooks/use-live-alerts";

type FeedAlert = Alert & { riskScore?: number };

function alertMeta(type: FeedAlert["type"]) {
  switch (type) {
    case "dark":
      return { Icon: EyeOff, accent: "var(--danger)", label: "SIGNAL LOSS" };
    case "spoofing":
      return { Icon: Radio, accent: "var(--danger)", label: "SPOOFING" };
    case "course_dev":
      return { Icon: Compass, accent: "var(--amber)", label: "COURSE DEV" };
    case "rendezvous":
    default:
      return { Icon: ArrowLeftRight, accent: "var(--amber)", label: "RENDEZVOUS" };
  }
}

function AlertRow({ alert, now, onClick }: { alert: FeedAlert; now: number; onClick: () => void }) {
  const { Icon, accent, label } = alertMeta(alert.type);
  const ageMin = Math.max(0, Math.round((now - alert.since) / 60_000));
  const isHigh = alert.severity === 3 || (alert.riskScore ?? 0) >= 80;

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
            <div className="flex items-center gap-1.5">
              {alert.riskScore !== undefined && (
                <span
                  className="rounded-sm px-1.5 py-px font-mono text-[9px] tabular-nums"
                  style={{
                    color: accent,
                    background: `color-mix(in oklab, ${accent} 14%, transparent)`,
                  }}
                >
                  RISK {alert.riskScore}
                </span>
              )}
              <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                T-{ageMin}m
              </span>
            </div>
          </div>
          <div className="mt-1 truncate font-mono text-[12px] text-foreground">
            {alert.name}
          </div>
          <div className="mt-0.5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            <span>{alert.flag}</span>
            <span className="text-border">·</span>
            <span className="tabular-nums">MMSI {alert.mmsi}</span>
          </div>
          <div className="mt-1.5 font-mono text-[10px] text-muted-foreground/90">
            {alert.detail}
          </div>
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
    a.alert_type === "DARK" ? "dark" : a.alert_type === "COURSE_DEV" ? "course_dev" : "spoofing";
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
  };
}

export function AlertFeed() {
  const { alerts, currentTime, focusVessel } = useTimeline();
  const dbAlerts = useLiveAlerts(50);

  const merged: FeedAlert[] = useMemo(() => {
    const live = dbAlerts.map(dbToFeed);
    // Dedupe: a live DB alert for an MMSI hides the computed one of the same type.
    const liveKey = new Set(live.map((a) => `${a.mmsi}-${a.type}`));
    const filtered = alerts.filter((a) => !liveKey.has(`${a.mmsi}-${a.type}`));
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
            Alert Feed
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
            <AlertRow key={a.id} alert={a} now={Math.max(currentTime, Date.now())} onClick={() => focusVessel(a.mmsi)} />
          ))
        )}
      </div>
    </div>
  );
}
