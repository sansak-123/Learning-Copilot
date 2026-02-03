"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";

export type GeneratedMCQ = {
  question: string;
  options: string[];        // length 4
  correctIndex: number;     // 0..3
  explanation?: string;
};

export type GeneratedTextQ = {
  prompt: string;
  context?: string;
};

export type GeneratedPractice = {
  mcqs: GeneratedMCQ[];
  texts: GeneratedTextQ[];
};

type GeneratePracticeInput = {
  topic: string;
  subtopic: string;
  roadmap: any;
  numMcqs?: number; // default 3
  numTexts?: number; // default 2
};

function extractJSONObject(text: string): any | null {
  // Try direct JSON
  try { return JSON.parse(text); } catch {}

  // Try brace object
  const b1 = text.indexOf("{"), b2 = text.lastIndexOf("}");
  if (b1 !== -1 && b2 > b1) {
    const chunk = text.slice(b1, b2 + 1);
    try { return JSON.parse(chunk); } catch {}
  }

  // Try bracket array
  const a1 = text.indexOf("["), a2 = text.lastIndexOf("]");
  if (a1 !== -1 && a2 > a1) {
    const chunk = text.slice(a1, a2 + 1);
    try { return JSON.parse(chunk); } catch {}
  }

  // Try code-fence
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    try { return JSON.parse(fence[1]); } catch {}
  }

  return null;
}

export async function generatePractice(
  input: GeneratePracticeInput
): Promise<GeneratedPractice> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return { mcqs: [], texts: [] };

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1200,
    },
  });

  const numMcqs = Math.max(1, Math.min(input.numMcqs ?? 3, 6));
  const numTexts = Math.max(1, Math.min(input.numTexts ?? 2, 4));

  const instruction = `
You are a tutor. Create ${numMcqs} multiple-choice questions and ${numTexts} short-answer prompts
for the given TOPIC and SUBTOPIC. Use the ROADMAP context to keep phrasing aligned with what's being studied.

Return STRICT JSON ONLY in this exact shape:
{
  "mcqs": [
    { "question": "...", "options": ["A","B","C","D"], "correctIndex": 1, "explanation": "..." }
  ],
  "texts": [
    { "prompt": "...", "context": "optional extra guidance" }
  ]
}

Rules:
- Exactly 4 options per MCQ, and exactly one correct answer.
- Keep questions concise and unambiguous.
- No prose, no markdown fences—JUST the JSON.
`.trim();

  const payload = {
    topic: input.topic,
    subtopic: input.subtopic,
    roadmap: input.roadmap ?? [],
  };

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: instruction + "\n\nINPUT:\n" + JSON.stringify(payload) }],
      },
    ],
  });

  const raw = (result.response?.text() ?? "").trim();
  const parsed = extractJSONObject(raw);

  const mcqs: GeneratedMCQ[] = Array.isArray(parsed?.mcqs)
    ? parsed.mcqs
        .filter(
          (q: any) =>
            typeof q?.question === "string" &&
            Array.isArray(q?.options) &&
            q.options.length === 4 &&
            Number.isInteger(q?.correctIndex) &&
            q.correctIndex >= 0 &&
            q.correctIndex < 4
        )
        .slice(0, numMcqs)
    : [];

  const texts: GeneratedTextQ[] = Array.isArray(parsed?.texts)
    ? parsed.texts
        .filter((t: any) => typeof t?.prompt === "string")
        .slice(0, numTexts)
    : [];

  return { mcqs, texts };
}
