import { Inbox } from "lucide-react";

export function AlertFeed() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-y border-border bg-surface-0 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--cyan)] shadow-[0_0_8px_var(--cyan)]" />
          <h2 className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Alert Feed
          </h2>
        </div>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          PRIORITY · DESC
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Placeholder empty state */}
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <div className="rounded-sm border border-dashed border-border bg-surface-1 p-4">
            <Inbox className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            No active alerts
          </p>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">
            Awaiting AIS telemetry stream
          </p>
        </div>
      </div>
    </div>
  );
}
