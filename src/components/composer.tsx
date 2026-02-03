"use client";

import { Send } from "lucide-react";
import { useState } from "react";

export default function Composer({
  onSend,
  disabled,
  placeholder = 'Ask anything… e.g. "Create a learning roadmap for Machine Learning"',
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");

  function submit() {
    const v = value.trim();
    if (!v || disabled) return;
    onSend(v);
    setValue("");
  }

  return (
    <div className="border-t border-neutral-800 bg-gradient-to-t from-neutral-950 via-neutral-950/95 to-transparent p-4">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 focus-within:ring-1 focus-within:ring-orange-500">
        <textarea
          rows={1}
          className="w-full resize-none bg-transparent px-4 py-3 outline-none"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex items-center justify-end px-2 pb-2">
          <button
            onClick={submit}
            disabled={disabled || !value.trim()}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
              !disabled && value.trim()
                ? "bg-orange-500 text-white hover:bg-orange-600"
                : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
            }`}
          >
            <Send size={16} />
            Send
          </button>
        </div>
      </div>
      <p className="text-[11px] text-neutral-500 mt-2 text-center">
        Press Enter to send • Shift+Enter for newline
      </p>
    </div>
  );
}
