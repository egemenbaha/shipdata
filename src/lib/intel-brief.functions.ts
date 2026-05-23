import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  name: z.string().min(1).max(120),
  mmsi: z.string().min(1).max(32),
  flag: z.string().min(1).max(8),
  type: z.enum(["tanker", "cargo", "fishing"]),
  classification: z.enum(["nominal", "dark", "spoofing"]),
  minutesDark: z.number().min(0).max(100000),
  inCorridor: z.boolean(),
  impliedKts: z.number().min(0).max(100000).nullable(),
  maxKtsForType: z.number().min(0).max(200),
  stsPartner: z
    .object({
      name: z.string().min(1).max(120),
      flag: z.string().min(1).max(8),
      separationMeters: z.number().min(0).max(1_000_000),
      sustainedMinutes: z.number().min(0).max(100000),
    })
    .nullable(),
});

export type BriefInput = z.infer<typeof InputSchema>;

function buildPrompt(d: BriefInput): string {
  const lines: string[] = [];
  lines.push(`Vessel: ${d.name} (${d.type}, flag ${d.flag}, MMSI ${d.mmsi})`);
  lines.push(`AIS classification: ${d.classification.toUpperCase()}`);
  if (d.classification === "dark") {
    const h = Math.floor(d.minutesDark / 60);
    const m = Math.round(d.minutesDark % 60);
    lines.push(`Signal loss duration: ${h}h ${m}m since last AIS ping`);
  }
  if (d.classification === "spoofing" && d.impliedKts != null) {
    lines.push(
      `Implied speed between consecutive pings: ${Math.round(d.impliedKts)} kts (physical max for ${d.type}: ${d.maxKtsForType} kts)`,
    );
  }
  lines.push(
    `Geographic context: ${d.inCorridor ? "INSIDE known smuggling corridor" : "outside known smuggling corridor"}`,
  );
  if (d.stsPartner) {
    lines.push(
      `Sustained rendezvous with ${d.stsPartner.name} (flag ${d.stsPartner.flag}): ` +
        `${d.stsPartner.separationMeters} m separation for ${Math.round(d.stsPartner.sustainedMinutes)} minutes — possible STS transfer`,
    );
  }
  return lines.join("\n");
}

export const generateIntelBrief = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "LOVABLE_API_KEY missing" };
    }

    const facts = buildPrompt(data);
    const system =
      "You are a maritime cyber intelligence analyst writing for an operations center. " +
      "Given a set of computed facts about a single vessel, write ONE concise paragraph " +
      "(80–120 words) in professional intelligence-report register. Do NOT invent numbers, " +
      "locations, identities, or events beyond the facts. Do NOT use bullet points or headings. " +
      "Open with classification and severity, integrate corridor proximity, and end with a " +
      "recommended monitoring action. Use neutral tense.";

    try {
      const res = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: system },
              { role: "user", content: `Computed facts:\n${facts}` },
            ],
          }),
        },
      );

      if (res.status === 429) {
        return { ok: false as const, error: "Rate limit exceeded. Please retry shortly." };
      }
      if (res.status === 402) {
        return {
          ok: false as const,
          error: "AI workspace out of credits. Top up at Settings → Workspace → Usage.",
        };
      }
      if (!res.ok) {
        const body = await res.text();
        console.error("AI gateway error", res.status, body);
        return { ok: false as const, error: `AI gateway error (${res.status})` };
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = json.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) {
        return { ok: false as const, error: "Empty response from AI" };
      }
      return { ok: true as const, text };
    } catch (err) {
      console.error("intel brief failed", err);
      return { ok: false as const, error: "Network failure reaching AI gateway" };
    }
  });
