import { EyeOff, Radio, Inbox, ArrowLeftRight } from "lucide-react";
import { useTimeline } from "@/state/timeline";
import { formatUtc, type Alert } from "@/lib/derive";

function AlertRow({ alert, now, onClick }: { alert: Alert; now: number; onClick: () => void }) {
  const meta =
    alert.type === "dark"
      ? { Icon: EyeOff, accent: "var(--danger)", label: "SIGNAL LOSS" }
      : alert.type === "spoofing"
        ? { Icon: Radio, accent: "var(--danger)", label: "SPOOFING" }
        : { Icon: ArrowLeftRight, accent: "var(--amber)", label: "RENDEZVOUS" };
  const { Icon, accent, label } = meta;
  const ageMin = Math.max(0, Math.round((now - alert.since) / 60_000));

  return (
    <div
      className="group relative cursor-pointer border-b border-border/60 bg-surface-1 px-3 py-2.5 transition-colors hover:bg-surface-2"
      style={{ borderLeft: `2px solid ${accent}` }}
    >
      <div className="flex items-start gap-2">
        <div className="relative mt-0.5">
          <Icon className="h-3.5 w-3.5" style={{ color: accent }} />
          {alert.severity === 3 && (
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
              T-{ageMin}m
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
          <div className="mt-1.5 font-mono text-[10px] text-muted-foreground/90">
            {alert.detail}
          </div>
          <div className="mt-1 font-mono text-[9px] tabular-nums text-muted-foreground/60">
            Since {formatUtc(alert.since)} UTC
          </div>
        </div>
      </div>
    </div>
  );
}

export function AlertFeed() {
  const { alerts, currentTime } = useTimeline();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-y border-border bg-surface-0 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--cyan)] shadow-[0_0_8px_var(--cyan)]" />
          <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Alert Feed
          </h2>
          <span className="font-mono text-[10px] tabular-nums text-[var(--cyan)]">
            {alerts.length}
          </span>
        </div>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          PRIORITY ▼
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="rounded-sm border border-dashed border-border bg-surface-1 p-4">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              No active alerts
            </p>
          </div>
        ) : (
          alerts.map((a) => <AlertRow key={a.id} alert={a} now={currentTime} />)
        )}
      </div>
    </div>
  );
}
