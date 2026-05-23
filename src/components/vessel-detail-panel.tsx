import { useState } from "react";
import { X, Sparkles, Loader2, Ship, EyeOff, Radio, ArrowLeftRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useTimeline } from "@/state/timeline";
import { MAX_KTS_BY_TYPE, formatMinutes } from "@/lib/derive";
import { generateIntelBrief } from "@/lib/intel-brief.functions";

export function VesselDetailPanel() {
  const { derived, rendezvous, selectedMmsi, setSelectedMmsi } = useTimeline();
  const [brief, setBrief] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const briefFn = useServerFn(generateIntelBrief);

  const d = derived.find((x) => x.vessel.mmsi === selectedMmsi);

  if (!d) return null;

  // Reset transient state when switching vessels via close
  const close = () => {
    setSelectedMmsi(null);
    setBrief(null);
    setError(null);
  };

  const sts = rendezvous.find(
    (r) => r.a.vessel.mmsi === d.vessel.mmsi || r.b.vessel.mmsi === d.vessel.mmsi,
  );
  const partner = sts
    ? sts.a.vessel.mmsi === d.vessel.mmsi
      ? sts.b
      : sts.a
    : null;

  const accent =
    d.status === "dark" || d.status === "spoofing"
      ? "var(--danger)"
      : sts
        ? "var(--amber)"
        : "var(--nominal)";

  const StatusIcon =
    d.status === "dark" ? EyeOff : d.status === "spoofing" ? Radio : sts ? ArrowLeftRight : Ship;
  const statusLabel =
    d.status === "dark"
      ? "SIGNAL LOSS"
      : d.status === "spoofing"
        ? "SPOOFING"
        : "NOMINAL";

  const onGenerate = async () => {
    setLoading(true);
    setError(null);
    setBrief(null);
    try {
      const res = await briefFn({
        data: {
          name: d.vessel.name,
          mmsi: d.vessel.mmsi,
          flag: d.vessel.flag,
          type: d.vessel.type,
          classification: d.status,
          minutesDark: d.minutesDark,
          inCorridor: d.inCorridor,
          impliedKts: d.spoofJump?.impliedKts ?? null,
          maxKtsForType: MAX_KTS_BY_TYPE[d.vessel.type],
          stsPartner: partner
            ? {
                name: partner.vessel.name,
                flag: partner.vessel.flag,
                separationMeters: Math.round((sts?.minSeparationNm ?? 0) * 1852),
                sustainedMinutes: Math.round(((sts?.lastT ?? 0) - (sts?.since ?? 0)) / 60_000),
              }
            : null,
        },
      });
      if (res.ok) setBrief(res.text);
      else setError(res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="pointer-events-auto absolute right-3 top-14 z-[450] w-[320px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-sm border border-border bg-surface-0/95 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.6)] backdrop-blur-md"
      style={{ borderLeft: `2px solid ${accent}` }}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border bg-surface-1 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <StatusIcon className="h-3 w-3" style={{ color: accent }} />
            <span
              className="font-mono text-[9px] uppercase tracking-[0.22em]"
              style={{ color: accent }}
            >
              {statusLabel}
            </span>
          </div>
          <div className="mt-0.5 truncate font-mono text-[13px] text-foreground">
            {d.vessel.name}
          </div>
          <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            {d.vessel.flag} · MMSI {d.vessel.mmsi} · {d.vessel.type}
          </div>
        </div>
        <button
          onClick={close}
          className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-1.5 px-3 py-2 font-mono text-[10px]">
        <Fact label="Classification" value={statusLabel} accent={accent} />
        {d.status === "dark" && (
          <Fact label="Signal lost" value={`${formatMinutes(d.minutesDark)} ago`} />
        )}
        {d.status === "spoofing" && d.spoofJump && (
          <Fact
            label="Implied speed"
            value={`${Math.round(d.spoofJump.impliedKts)} kts (max ${MAX_KTS_BY_TYPE[d.vessel.type]})`}
          />
        )}
        <Fact
          label="Corridor"
          value={d.inCorridor ? "Inside" : "Outside"}
          accent={d.inCorridor ? "var(--amber)" : undefined}
        />
        {partner && sts && (
          <Fact
            label="STS link"
            value={`${partner.vessel.name} · ${Math.round(sts.minSeparationNm * 1852)} m`}
            accent="var(--amber)"
          />
        )}
      </div>

      <div className="border-t border-border bg-surface-1 px-3 py-2">
        <button
          onClick={onGenerate}
          disabled={loading}
          className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-[var(--cyan)]/40 bg-[var(--cyan)]/10 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--cyan)] transition-colors hover:bg-[var(--cyan)]/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Synthesizing…
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3" />
              Generate Intelligence Brief
            </>
          )}
        </button>

        {error && (
          <div
            className="mt-2 rounded-sm border px-2 py-1.5 font-mono text-[10px]"
            style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
          >
            {error}
          </div>
        )}

        {brief && (
          <div className="mt-2 rounded-sm border border-border bg-surface-0 px-2.5 py-2">
            <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
              Assessment
            </div>
            <p className="font-mono text-[11px] leading-relaxed text-foreground/90">
              {brief}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <span
        className="truncate text-right tabular-nums"
        style={{ color: accent ?? "var(--foreground)" }}
      >
        {value}
      </span>
    </div>
  );
}
