"use server";

type Recency = "day" | "week" | "month" | "year" | "all";

type WebSearchParams = {
  query: string;
  minChars?: number;        // strict minimum desired characters
  instruction?: string;     // optional big system prompt
  recency?: Recency;        // how fresh to bias results
  model?: "sonar" | "sonar-pro" | "sonar-reasoning" | string;
  metadata?: unknown;       // ← NEW: arbitrary grounding context (chat history, roadmap, etc.)
};

type WebSearchResult = {
  text: string;             // markdown
  sources?: { title?: string; url: string }[];
};

const PPLX_URL = "https://api.perplexity.ai/chat/completions";

export async function webSearchPPLX({
  query,
  minChars = Math.max(1200, query.length * 10),
  instruction,
  recency = "month",
  model = "sonar-pro",
  metadata,                                 // ← accept it
}: WebSearchParams): Promise<WebSearchResult> {
  if (!process.env.PPLX_API_KEY) {
    return {
      text:
        "⚠️ Perplexity API key (PPLX_API_KEY) is missing on the server. " +
        "Add it to your environment and redeploy.",
    };
  }

  // Safely serialize metadata without exploding token count.
  const safeJson = (obj: unknown, max = 8000) => {
    try {
      const json = JSON.stringify(
        obj,
        (_k, v) => (typeof v === "string" && v.length > 600 ? v.slice(0, 600) + "…" : v),
        2
      );
      return json.length > max ? json.slice(0, max) + "…" : json;
    } catch {
      return "";
    }
  };

  const contextBlock = metadata
    ? [
        "",
        "CONTEXT (for grounding; may include prior messages/roadmap/performance):",
        "```json",
        safeJson(metadata),
        "```",
      ].join("\n")
    : "";

  const sys = [
    instruction?.trim() ||
      [
        "You are a meticulous research assistant.",
        "Write Markdown with section headings, math (LaTeX), runnable code blocks, and tables when helpful.",
        "Always ground claims with citations to high-quality sources (papers, docs, reputable media).",
        "Prefer recent information and note what changed recently when relevant.",
      ].join("\n"),
    "",
    `HARD REQUIREMENT: produce at least ${minChars} characters.`,
    "If the draft is shorter, expand with more details, examples, proofs, code, and references until the requirement is met.",
  ].join("\n");

  const baseBody = {
    model,
    messages: [
      { role: "system", content: sys },
      {
        role: "user",
        content: [
          `QUERY: ${query}`,
          contextBlock, // ← inject context after the query
          "",
          "OUTPUT RULES:",
          "- Use clear section headings.",
          "- Use bullet points where clarity improves.",
          "- Put math in $$ display or $inline$.",
          "- Include runnable code blocks in fenced syntax when beneficial.",
          "- Tie each important claim to a short citation.",
          "- End with a concise **Key Takeaways** list.",
        ].join("\n"),
      },
    ],
    temperature: 0.2,
    top_p: 0.9,
    // Perplexity-specific parameters:
    return_citations: true,          // include citations array in response
    search_recency_filter: recency,  // bias toward fresh sources
    stream: false,
    top_k: 0,
    max_output_tokens: 4000,
  };

  async function callOnce(body: any) {
    const res = await fetch(PPLX_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PPLX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        data?.error?.message ||
        JSON.stringify(data || {}, null, 2) ||
        `HTTP ${res.status}`;
      return {
        text:
          "❌ Perplexity error:\n\n```\n" +
          msg +
          "\n```\nCheck API key, model name, and account limits.",
        sources: [],
        raw: data,
      };
    }

    const text =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.delta?.content ??
      "";
    const cites: string[] = Array.isArray(data?.citations) ? data.citations : [];

    return {
      text: String(text || "").trim(),
      sources: cites.map((url: string) => ({ url, title: url })),
      raw: data,
    };
  }

  // First pass
  let { text, sources } = await callOnce(baseBody);

  // If too short, request an expansion (one more pass)
  if (text.length < minChars) {
    const expandBody = {
      ...baseBody,
      messages: [
        ...baseBody.messages,
        { role: "assistant", content: text },
        {
          role: "user",
          content: `Expand substantially until the total length is at least ${minChars} characters. Add more derivations, worked examples, runnable code, and additional high-quality citations.`,
        },
      ],
    };
    const expanded = await callOnce(expandBody);
    if (expanded.text.length > text.length) {
      text = expanded.text;
      // merge unique sources
      const seen = new Set([...(sources || []).map((s) => s.url)]);
      (expanded.sources || []).forEach((s) => {
        if (s.url && !seen.has(s.url)) {
          seen.add(s.url);
          (sources ||= []).push(s);
        }
      });
    } else {
      text += `\n\n> Note: the model returned less than the requested minimum (${minChars} chars) despite an expansion attempt.`;
    }
  }

  return { text, sources };
}
