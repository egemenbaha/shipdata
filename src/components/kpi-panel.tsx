import { Ship, AlertTriangle, EyeOff, Radio, ArrowLeftRight, Compass } from "lucide-react";
import { useTimeline } from "@/state/timeline";

type KpiTone = "cyan" | "amber" | "danger";

const tones: Record<KpiTone, { text: string; ring: string; glow: string }> = {
  cyan: { text: "text-[var(--cyan)]", ring: "ring-[var(--cyan)]/30", glow: "shadow-[0_0_24px_-8px_var(--cyan)]" },
  amber: { text: "text-[var(--amber)]", ring: "ring-[var(--amber)]/30", glow: "shadow-[0_0_24px_-8px_var(--amber)]" },
  danger: { text: "text-[var(--danger)]", ring: "ring-[var(--danger)]/40", glow: "shadow-[0_0_24px_-8px_var(--danger)]" },
};

function Kpi({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: KpiTone;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const t = tones[tone];
  return (
    <div
      className={`relative overflow-hidden rounded-sm bg-surface-1 ring-1 ${t.ring} ${t.glow} px-3 py-2.5`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
        <Icon className={`h-3.5 w-3.5 ${t.text}`} />
      </div>
      <div className={`mt-1 font-mono text-2xl font-light tabular-nums ${t.text}`}>
        {String(value).padStart(2, "0")}
      </div>
    </div>
  );
}

export function KpiPanel() {
  const { kpis } = useTimeline();
  return (
    <div className="grid grid-cols-2 gap-2 p-3">
      <Kpi label="Total Vessels" value={kpis.totalVessels} tone="cyan" icon={Ship} />
      <Kpi label="Active Alerts" value={kpis.activeAlerts} tone="amber" icon={AlertTriangle} />
      <Kpi label="Dark Vessels" value={kpis.darkVessels} tone="danger" icon={EyeOff} />
      <Kpi label="Spoofing" value={kpis.spoofingAlerts} tone="danger" icon={Radio} />
      <Kpi label="Rendezvous" value={kpis.rendezvousAlerts} tone="amber" icon={ArrowLeftRight} />
      <Kpi label="Course Dev" value={kpis.courseDevAlerts} tone="amber" icon={Compass} />
    </div>
  );
}
