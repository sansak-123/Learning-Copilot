"use client";

import { useEffect, useRef } from "react";
import Bubble from "./bubble";

export type ChatMessage = {
  id: string;
  type: "user" | "ai";
  content: string;
  timestamp: number;
};

export default function MessageList({
  messages,
  isTyping,
  onCopy,
}: {
  messages: ChatMessage[];
  isTyping: boolean;
  onCopy?: (content: string) => void;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(
    () => endRef.current?.scrollIntoView({ behavior: "smooth" }),
    [messages, isTyping]
  );

  return (
    <div className="space-y-6">
      {messages.map((m) => (
        <Bubble
          key={m.id}
          role={m.type}
          content={m.content}
          time={m.timestamp}
          onCopy={() => onCopy?.(m.content)}
        />
      ))}
      {isTyping && (
        <div className="flex gap-3 items-center text-neutral-400">
          <div className="h-8 w-8 rounded-full bg-neutral-800 grid place-items-center text-xs text-orange-400">
            AI
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3">
            <span className="inline-flex gap-1">
              <span className="inline-block h-1.5 w-1.5 bg-neutral-500 rounded-full animate-bounce [animation-delay:-0.2s]" />
              <span className="inline-block h-1.5 w-1.5 bg-neutral-500 rounded-full animate-bounce" />
              <span className="inline-block h-1.5 w-1.5 bg-neutral-500 rounded-full animate-bounce [animation-delay:0.2s]" />
            </span>
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
