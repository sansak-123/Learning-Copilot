"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";

// You must set GOOGLE_API_KEY in your .env
const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.warn("GOOGLE_API_KEY is not set; grading will return a fallback.");
}

function parseJSON<T = any>(text: string): T | null {
  try {
    return JSON.parse(text);
  } catch {
    // try to extract { ... } blob
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {}
    }
    return null;
  }
}

/**
 * Grade an MCQ. We still compare indices locally for correctness,
 * but ask Gemini to validate & explain and produce an accuracy score.
 */
export async function gradeMCQ(params: {
  question: string;
  options: string[];
  correctIndex: number;
  userIndex: number;
}) {
  const { question, options, correctIndex, userIndex } = params;

  // Local correctness (fast & reliable)
  const correct = userIndex === correctIndex;

  // If no API key, return a reasonable fallback
  if (!apiKey) {
    return {
      ok: true as const,
      correct,
      score: correct ? 1 : 0,
      rationale: correct
        ? "Correct. (Local check: matches the expected answer.)"
        : "Incorrect. (Local check: does not match the expected answer.)",
    };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `
You are grading a multiple-choice question. 
Return STRICT JSON with keys: correct (boolean), score (number between 0 and 1), rationale (string).

Question: ${question}

Options (0-indexed):
${options.map((o, i) => `${i}. ${o}`).join("\n")}

Expected correctIndex: ${correctIndex}
User userIndex: ${userIndex}

Rules:
- "correct" MUST be true iff userIndex === correctIndex.
- "score" can reflect reasoning quality (1 for correct, else <= 0.4).
- "rationale" 1-3 concise sentences, no extra keys.
Return JSON only.
  `.trim();

  try {
    const resp = await model.generateContent(prompt);
    const text = resp.response.text();
    const json = parseJSON<any>(text) ?? {
      correct,
      score: correct ? 1 : 0,
      rationale: "Autograde fallback.",
    };

    // Ensure booleans/numbers are in range
    const out = {
      ok: true as const,
      correct: Boolean(json.correct),
      score: Math.max(0, Math.min(1, Number(json.score) || (correct ? 1 : 0))),
      rationale:
        typeof json.rationale === "string"
          ? json.rationale
          : correct
          ? "Correct."
          : "Incorrect.",
    };
    return out;
  } catch (e: any) {
    return {
      ok: true as const,
      correct,
      score: correct ? 1 : 0,
      rationale:
        (e?.message as string) || "Gemini error; returned local correctness.",
    };
  }
}

/**
 * Grade a short text answer.
 * Returns {score: 0..1, verdict: "PASS"/"REVISE", feedback: string}.
 */
export async function gradeText(params: {
  prompt: string;
  userAnswer: string;
  context?: string; // optional topic/subtopic context
}) {
  const { prompt, userAnswer, context } = params;

  if (!apiKey) {
    // Basic heuristic fallback
    const len = userAnswer.trim().length;
    const score = len > 40 ? 0.6 : len > 15 ? 0.4 : 0.2;
    return {
      ok: true as const,
      score,
      verdict: score >= 0.6 ? "PASS" : "REVISE",
      feedback:
        "Local heuristic: answer length-based stub. Set GOOGLE_API_KEY to enable Gemini grading.",
    };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const promptText = `
You grade short answers. Return STRICT JSON with keys:
- score (0..1 number),
- verdict ("PASS" or "REVISE"),
- feedback (string: 2-4 concise sentences).

Task/Prompt:
${prompt}

${context ? `Context:\n${context}\n` : ""}

User's Answer:
${userAnswer}

Scoring guide:
- 0.9–1.0: fully correct, clear, complete.
- 0.7–0.89: mostly correct, minor gaps.
- 0.4–0.69: partially correct; important gaps.
- <0.4: weak or incorrect.

Return JSON only.
  `.trim();

  try {
    const resp = await model.generateContent(promptText);
    const text = resp.response.text();
    const json = parseJSON<any>(text) ?? {
      score: 0.5,
      verdict: "REVISE",
      feedback: "Autograde fallback.",
    };

    const score = Math.max(0, Math.min(1, Number(json.score) || 0.5));
    const verdict = score >= 0.6 ? "PASS" : "REVISE";

    return {
      ok: true as const,
      score,
      verdict: (json.verdict as string) || verdict,
      feedback:
        typeof json.feedback === "string"
          ? json.feedback
          : "Keep refining your answer.",
    };
  } catch (e: any) {
    return {
      ok: true as const,
      score: 0.5,
      verdict: "REVISE",
      feedback: (e?.message as string) || "Gemini error.",
    };
  }
}
