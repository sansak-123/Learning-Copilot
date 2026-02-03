// src/app/actions/gemini.ts
"use server";

import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

export type GeneratedMCQ = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
};

export type GeneratedTextQ = {
  prompt: string;
  context?: string;
};

const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const API_KEY = process.env.GOOGLE_API_KEY!;
if (!API_KEY) {
  console.warn("[gemini] Missing GOOGLE_API_KEY env var");
}

export async function generateQuizViaGemini(args: {
  topic?: string;
  subtopic?: string;
  prompt: string;             // raw user prompt
  contextString?: string;     // your compact context string
  metadata?: unknown;         // full chat metadata object
  countMcq?: number;          // default 4
  countText?: number;         // default 1
}) {
  const {
    topic,
    subtopic,
    prompt,
    contextString,
    metadata,
    countMcq = 4,
    countText = 1,
  } = args;

  if (!API_KEY) {
    throw new Error("GOOGLE_API_KEY is not configured on the server");
  }

  const genAI = new GoogleGenerativeAI(API_KEY);

  const systemInstruction = [
    "You create high-quality practice material for learners.",
    "Return STRICT JSON with keys: mcqs (array), texts (array).",
    "Each MCQ has: question (string), options (array of 4 strings), correctIndex (0..3), explanation (string).",
    "Each text has: prompt (string), optional context (string).",
    "No markdown, no prose outside JSON.",
  ].join("\n");

  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          mcqs: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                question: { type: SchemaType.STRING },
                options: {
                  type: SchemaType.ARRAY,
                  items: { type: SchemaType.STRING },
                  minItems: 4,
                  maxItems: 4,
                },
                correctIndex: { type: SchemaType.INTEGER },
                explanation: { type: SchemaType.STRING },
              },
              required: ["question", "options", "correctIndex"],
            },
          },
          texts: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                prompt: { type: SchemaType.STRING },
                context: { type: SchemaType.STRING },
              },
              required: ["prompt"],
            },
          },
        },
        required: ["mcqs", "texts"],
      },
    },
  });

  const safeStringify = (obj: unknown) => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return "{}";
    }
  };

  const userPrompt = [
    `PROMPT: ${prompt}`,
    topic ? `TOPIC: ${topic}` : "",
    subtopic ? `SUBTOPIC: ${subtopic}` : "",
    contextString ? `LEARNER_CONTEXT (compact JSON): ${contextString}` : "",
    metadata ? `FULL_CHAT_METADATA (JSON): ${safeStringify(metadata)}` : "",
    "",
    `Create ${countMcq} MCQs (exactly 4 options each) + ${countText} short-answer question(s).`,
    "Difficulty: mixed (easy–moderate). Emphasize conceptual + applied thinking.",
  ]
    .filter(Boolean)
    .join("\n");

  // Because we set responseMimeType+schema, the response is guaranteed JSON
  const res = await model.generateContent(userPrompt);
  const parsed = JSON.parse(res.response.text());

  // minimal validation / normalization
  const mcqsRaw = Array.isArray(parsed?.mcqs) ? parsed.mcqs : [];
  const textsRaw = Array.isArray(parsed?.texts) ? parsed.texts : [];

  const mcqs: GeneratedMCQ[] = mcqsRaw
    .filter(
      (m: any) =>
        m &&
        typeof m.question === "string" &&
        Array.isArray(m.options) &&
        m.options.length === 4
    )
    .map((m: any) => ({
      question: String(m.question),
      options: m.options.slice(0, 4).map(String),
      correctIndex: Math.max(0, Math.min(3, Number(m.correctIndex ?? 0))),
      explanation: m.explanation ? String(m.explanation) : "",
    }));

  const texts: GeneratedTextQ[] = textsRaw
    .filter((t: any) => t && typeof t.prompt === "string")
    .map((t: any) => ({ prompt: String(t.prompt), context: t.context || undefined }));

  return { mcqs, texts };
}
