import { Anchor, Activity } from "lucide-react";
import { KpiPanel } from "./kpi-panel";
import { AlertFeed } from "./alert-feed";

export function Sidebar() {
  return (
    <aside className="flex h-full w-[340px] flex-col border-r border-border bg-sidebar">
      {/* Header */}
      <div className="border-b border-border bg-surface-0 px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-[var(--cyan)]/10 ring-1 ring-[var(--cyan)]/40">
            <Anchor className="h-3.5 w-3.5 text-[var(--cyan)]" />
          </div>
          <div className="flex-1 leading-tight">
            <div className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-foreground">
              MARLOCK / CSA
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
              Maritime Cyber Awareness
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Activity className="h-3 w-3 text-[var(--cyan)] animate-pulse" />
            <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--cyan)]">
              Live
            </span>
          </div>
        </div>
      </div>

      <KpiPanel />

      <AlertFeed />

      {/* Footer status */}
      <div className="border-t border-border bg-surface-0 px-3 py-1.5">
        <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          <span>AIS · OFFLINE</span>
          <span className="tabular-nums">UTC 00:00:00</span>
        </div>
      </div>
    </aside>
  );
}
