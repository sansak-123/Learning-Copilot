"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Classify a prompt as "roadmap" or "chat"
 * Returns: { type: "roadmap" | "chat"; confidence: number }
 */
export async function classifyPrompt(prompt: string) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    // Safe fallback: if no key, treat everything as normal chat
    return { type: "chat" as const, confidence: 0.0 };
  }

  const genai = new GoogleGenerativeAI(apiKey);
  const model = genai.getGenerativeModel({ model: "gemini-2.0-flash" });

  // Keep the instruction short and force strict JSON
  const instruction =
    "You are a classifier. Output ONLY strict JSON with keys: type, confidence. " +
    'type = "roadmap" if the user asks for a study plan/learning roadmap (topics/subtopics), otherwise "chat". ' +
    "confidence is a number 0..1.";

  const classificationPrompt =
    `${instruction}\n\n` +
    `PROMPT:\n${prompt}\n\n` +
    "Roadmap examples: 'Create a roadmap on X', 'Give me a TOPIC/SUBTOPIC plan', 'Create a learning path'.\n" +
    "Chat examples: Q&A, explanations, summaries, conversation.\n\n" +
    'Return JSON like: {"type":"roadmap","confidence":0.92}';

  // IMPORTANT: pass a single string (not {role, parts} objects)
  const resp = await model.generateContent(classificationPrompt);
  let txt = resp.response.text().trim();

  // Be forgiving if the model returns fenced code
  if (txt.startsWith("```")) {
    txt = txt.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }

  try {
    const parsed = JSON.parse(txt);
    const t = parsed?.type === "roadmap" ? "roadmap" : "chat";
    const c = typeof parsed?.confidence === "number" ? parsed.confidence : 0.0;
    return { type: t as "roadmap" | "chat", confidence: c };
  } catch {
    // If Gemini returns anything weird, fail open to chat
    return { type: "chat" as const, confidence: 0.0 };
  }
}
