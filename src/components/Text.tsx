// src/components/Text.tsx
"use client";

import { useState } from "react";
import { gradeText } from "@/app/actions/grade";

export type TextAnswerCardProps = {
  prompt: string;
  context?: string;
  /** Optional: disable server grading (for demos/offline) */
  disableGrading?: boolean;
  /** Notify parent so we can update meta.performance */
  onGraded?: (payload: { question: string; score: number }) => void;
};

export function TextAnswerCard({
  prompt,
  context,
  disableGrading = false,
  onGraded,
}: TextAnswerCardProps) {
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [res, setRes] = useState<{
    score: number;
    verdict: "PASS" | "REVISE" | string;
    feedback: string;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const content = answer.trim();
    if (!content) return;
    setSubmitting(true);
    setErr(null);
    try {
      if (disableGrading) {
        const score =
          content.length > 60 ? 0.8 : content.length > 25 ? 0.6 : 0.4;
        const out = {
          score,
          verdict: score >= 0.6 ? "PASS" : "REVISE",
          feedback:
            "Demo mode: heuristic grade. Provide more specifics and examples to increase your score.",
        };
        setRes(out);
        onGraded?.({ question: prompt, score: out.score });
      } else {
        const out = await gradeText({ prompt, userAnswer: content, context });
        setRes({
          score: out.score,
          verdict: out.verdict,
          feedback: out.feedback,
        });
        onGraded?.({ question: prompt, score: out.score });
      }
    } catch (e: any) {
      setErr(e?.message ?? "Failed to grade.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-neutral-800/50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-purple-400 text-sm font-medium">
          Short Answer
        </span>
      </div>

      <p className="text-sm text-neutral-200 mb-2">{prompt}</p>

      <textarea
        rows={5}
        className="w-full rounded bg-neutral-900 border border-neutral-700 text-sm text-neutral-200 p-3 outline-none focus:border-orange-500"
        placeholder="Type your answer here..."
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
      />

      <div className="flex flex-col gap-2 mt-3">
        <button
          onClick={submit}
          disabled={!answer.trim() || submitting}
          className={`px-3 py-2 w-fit text-sm rounded ${
            answer.trim() && !submitting
              ? "bg-orange-500 text-white hover:bg-orange-600"
              : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
          }`}
        >
          {submitting ? "Grading..." : "Submit"}
        </button>

        {res && (
          <div className="text-xs text-neutral-400">
            Score: {(res.score * 100).toFixed(0)}% •{" "}
            <span
              className={
                res.verdict === "PASS" ? "text-green-400" : "text-yellow-400"
              }
            >
              {res.verdict}
            </span>
            <div className="mt-1 text-neutral-500">{res.feedback}</div>
          </div>
        )}
        {err && <div className="text-xs text-red-400">{err}</div>}
      </div>
    </div>
  );
}

export default TextAnswerCard;
