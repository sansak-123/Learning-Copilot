// src/components/mcq.tsx
"use client";

import { useState } from "react";
import { gradeMCQ } from "../app/actions/grade";

export type MCQCardProps = {
  question: string;
  options: string[];
  /** 0-indexed correct option */
  correctIndex: number;
  /** Optional explanation */
  explanation?: string;
  /** Optional: disable calling the server action (for demos/offline) */
  disableGrading?: boolean;
  /** Notify parent so we can update meta.performance */
  onGraded?: (payload: {
    question: string;
    correct: boolean;
    score: number;
  }) => void;
};

export function MCQCard({
  question,
  options,
  correctIndex,
  explanation,
  disableGrading = false,
  onGraded,
}: MCQCardProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    correct: boolean;
    score: number;
    rationale: string;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (picked === null) return;
    setSubmitting(true);
    setErr(null);
    try {
      if (disableGrading) {
        const correct = picked === correctIndex;
        const r = {
          correct,
          score: correct ? 1 : 0,
          rationale: correct
            ? "Demo mode: correct."
            : "Demo mode: not the expected option.",
        };
        setResult(r);
        onGraded?.({ question, correct: r.correct, score: r.score });
      } else {
        const r = await gradeMCQ({
          question,
          options,
          correctIndex,
          userIndex: picked,
        });
        setResult({
          correct: r.correct,
          score: r.score,
          rationale: r.rationale,
        });
        onGraded?.({ question, correct: r.correct, score: r.score });
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
        <span className="text-orange-400 text-sm font-medium">MCQ</span>
      </div>

      <p className="text-sm text-neutral-200 mb-3">{question}</p>

      <div className="space-y-2">
        {options.map((opt, i) => (
          <label
            key={i}
            className={`flex items-center gap-2 p-2 rounded border ${
              picked === i ? "border-orange-500" : "border-neutral-700"
            } bg-neutral-900/60 cursor-pointer`}
          >
            <input
              type="radio"
              name={`mcq-${question.slice(0, 12)}`}
              className="accent-orange-500"
              checked={picked === i}
              onChange={() => setPicked(i)}
            />
            <span className="text-sm text-neutral-300">{opt}</span>
          </label>
        ))}
      </div>

      {explanation && (
        <div className="mt-2 text-xs text-neutral-400">
          <span className="text-neutral-500">Hint: </span>
          {explanation}
        </div>
      )}

      <div className="flex flex-col gap-2 mt-3">
        <button
          onClick={submit}
          disabled={picked === null || submitting}
          className={`px-3 py-2 w-fit text-sm rounded ${
            picked !== null && !submitting
              ? "bg-orange-500 text-white hover:bg-orange-600"
              : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
          }`}
        >
          {submitting ? "Grading..." : "Submit"}
        </button>

        {result && (
          <div className="text-xs text-neutral-400">
            <div>
              Result:{" "}
              <span
                className={result.correct ? "text-green-400" : "text-red-400"}
              >
                {result.correct ? "Correct" : "Incorrect"}
              </span>{" "}
              • Score: {(result.score * 100).toFixed(0)}%
            </div>
            <div className="mt-1 text-neutral-500">{result.rationale}</div>
          </div>
        )}
        {err && <div className="text-xs text-red-400">{err}</div>}
      </div>
    </div>
  );
}

export default MCQCard;
