"use client";

import { Copy, RefreshCw } from "lucide-react";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  role: "user" | "ai";
  content: string;
  time: number;
  onCopy?: () => void;
  onRegenerate?: () => void;
};

export default function Bubble({
  role,
  content,
  time,
  onCopy,
  onRegenerate,
}: Props) {
  const isAI = role === "ai";
  const date = new Date(time);
  const ts = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={`flex gap-3 ${isAI ? "items-start" : "items-end justify-end"}`}
    >
      {/* Avatar */}
      <div
        className={`h-8 w-8 rounded-full grid place-items-center text-[10px] font-semibold
        ${isAI ? "bg-neutral-800 text-orange-400" : "bg-orange-500 text-white"} 
        ${isAI ? "" : "order-2"}`}
      >
        {isAI ? "AI" : "You"}
      </div>

      {/* Bubble */}
      <div className={`${isAI ? "order-2" : ""} max-w-[70ch]`}>
        <div
          className={`rounded-2xl border px-4 py-3 shadow-sm
          ${
            isAI
              ? "bg-neutral-900 border-neutral-800"
              : "bg-orange-500/95 border-orange-400 text-white"
          }`}
        >
          {isAI ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          ) : (
            <div className="whitespace-pre-wrap">{content}</div>
          )}
        </div>

        {/* Meta row */}
        <div
          className={`mt-1 text-[11px] flex items-center gap-2 
                         ${
                           isAI
                             ? "text-neutral-500"
                             : "text-orange-200/80 justify-end"
                         }`}
        >
          <span>{ts}</span>
          {isAI && (
            <>
              <button
                onClick={onCopy}
                className="hover:text-neutral-300 transition-colors inline-flex items-center gap-1"
                title="Copy"
              >
                <Copy size={12} />
                Copy
              </button>
              {onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="hover:text-neutral-300 transition-colors inline-flex items-center gap-1"
                  title="Regenerate"
                >
                  <RefreshCw size={12} />
                  Retry
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
