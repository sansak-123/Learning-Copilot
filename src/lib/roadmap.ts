export type RoadmapSubtopic = { type: "SUBTOPIC"; name: string };
export type RoadmapTopic = { type: "TOPIC"; name: string; subtopics: RoadmapSubtopic[] };
export type Roadmap = RoadmapTopic[];

export function tryExtractRoadmapFromText(text: string): Roadmap | null {
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first === -1 || last === -1 || last <= first) return null;
  try {
    const parsed = JSON.parse(text.slice(first, last + 1));
    if (!Array.isArray(parsed)) return null;
    const ok = parsed.every(
      (t: any) =>
        t?.type === "TOPIC" &&
        typeof t.name === "string" &&
        Array.isArray(t.subtopics) &&
        t.subtopics.every((s: any) => s?.type === "SUBTOPIC" && typeof s.name === "string")
    );
    return ok ? (parsed as Roadmap) : null;
  } catch {
    return null;
  }
}

/**
 * Make the AI intro line feel different each time.
 */
export function leadInForRoadmap(plan: Roadmap) {
  const topics = plan.length;
  const first = plan[0]?.name ?? "Getting Started";
  const variants = [
    `Here’s a custom roadmap with **${topics} stages**. We’ll kick off at **${first}**.`,
    `I sketched a learning path (x${topics}). First stop: **${first}**.`,
    `Built a step-by-step plan for you. Starting at **${first}** and expanding onward.`,
    `Mapped out your journey in ${topics} chunks. Begin with **${first}**.`,
    `Roadmap ready! ${topics} topics total; start at **${first}**.`,
  ];
  return variants[Math.floor(Math.random() * variants.length)];
}

/** Remove the raw JSON before displaying. */
export function stripRoadmapJsonFromText(text: string) {
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first === -1 || last === -1 || last <= first) return text;
  const before = text.slice(0, first).trim();
  const after = text.slice(last + 1).trim();
  return [before, after].filter(Boolean).join("\n\n").trim();
}
    