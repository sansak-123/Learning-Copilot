// src/app/chat/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createChat, listChats } from "@/app/actions/chat";
import {
  MessageSquare,
  Clock3,
  MoreHorizontal,
  Plus,
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  NotebookText,
  Rocket,
} from "lucide-react";

/* =========================
   Types
========================= */
type ChatRow = {
  id: string;
  title: string | null;
  startedAt: string | Date;
  updatedAt: string | Date;
};

/* =========================
   Helpers
========================= */
function decodeDate(v: unknown): Date | string {
  if (typeof v === "string") {
    if (v.startsWith("$D")) return new Date(v.slice(2));
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : d;
  }
  return v as any;
}

function normalizeChats(payload: any): ChatRow[] {
  const rawList =
    (payload && Array.isArray(payload.items) && payload.items) ||
    (Array.isArray(payload) && payload[1]) ||
    [];
  return (rawList as any[]).map((c) => ({
    id: c.id,
    title: c.title ?? null,
    startedAt: decodeDate(c.startedAt),
    updatedAt: decodeDate(c.updatedAt),
  }));
}

function formatWhen(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  const now = new Date();
  const diff = (now.getTime() - date.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleString();
}

/* =========================
   Component
========================= */
export default function StartChatPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [chats, setChats] = useState<ChatRow[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [chatErr, setChatErr] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true); // ← drawer toggle

  async function loadChats() {
    setLoadingChats(true);
    setChatErr(null);
    try {
      const res = await listChats();
      const normalized = normalizeChats(res);
      setChats(normalized);
    } catch (e: any) {
      setChatErr(e?.message ?? "Could not load chats.");
    } finally {
      setLoadingChats(false);
    }
  }

  useEffect(() => {
    loadChats();
  }, []);

  async function start(prefill?: string) {
    setLoading(true);
    setErr(null);
    try {
      const res = await createChat({
        title: (prefill ?? title).trim() || "New Chat",
        initialMessages: [],
        initialRoadmap: null,
      });
      if (!res?.ok) throw new Error("Failed to create chat");
      router.push(`/chat/${res.chatId}`);
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) =>
      (c.title || "Untitled chat").toLowerCase().includes(q)
    );
  }, [chats, query]);

  // Sidebar widths (Claude-like compact collapsed rail)
  const SIDEBAR_W = sidebarOpen ? "w-[280px]" : "w-[76px]";

  return (
    <div className="min-h-screen grid grid-cols-12 bg-[#0b0b0c] text-neutral-100">
      {/* Soft top hairline */}
      <div className="fixed inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neutral-800/70 to-transparent z-20" />

      {/* Sidebar / Drawer */}
      <aside
        className={`col-span-12 md:col-span-4 lg:col-span-3 border-r border-neutral-900/80 bg-[#0a0a0b]/60 backdrop-blur supports-[backdrop-filter]:bg-[#0a0a0b]/50 transition-[width] duration-300 ease-out
        ${SIDEBAR_W} md:static fixed inset-y-0 left-0 z-30`}
      >
        {/* Drawer header with toggle */}
        <div className="p-3 border-b border-neutral-900/80 sticky top-0 bg-[#0a0a0b]/70 backdrop-blur z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen((s) => !s)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-800 bg-neutral-950/60 hover:bg-neutral-900 transition"
                title={sidebarOpen ? "Collapse" : "Expand"}
              >
                {sidebarOpen ? (
                  <ChevronLeft size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
              </button>

              {/* Mini brand mark (hidden when collapsed) */}
              {sidebarOpen && (
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-gradient-to-br from-amber-400/80 via-amber-500 to-amber-600 shadow-[0_0_0_1px_rgba(255,193,7,0.25)]" />
                  <h2 className="text-sm font-semibold text-neutral-200 tracking-tight">
                    Your Chats
                  </h2>
                </div>
              )}
            </div>

            {/* New chat button */}
            <button
              onClick={() => start()}
              disabled={loading}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border transition
                ${
                  !loading
                    ? "border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
                    : "border-neutral-800 text-neutral-500 cursor-not-allowed"
                }`}
              title="New chat"
            >
              {!loading ? (
                <Plus size={14} />
              ) : (
                <Loader2 size={14} className="animate-spin" />
              )}
              {sidebarOpen && "New"}
            </button>
          </div>

          {/* Search (hidden when collapsed) */}
          {sidebarOpen && (
            <div className="mt-3 relative">
              <Search
                size={14}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500"
              />
              <input
                className="w-full rounded-md border border-neutral-800 bg-[#0b0b0c] pl-7 pr-2 py-1.5 text-xs outline-none focus:border-amber-500/50 placeholder:text-neutral-600"
                placeholder="Search chats…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Chat list */}
        <div className="p-2 space-y-1 overflow-y-auto max-h-[calc(100vh-80px)]">
          {loadingChats && (
            <div className="space-y-1.5">
              {Array.from({ length: 7 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 rounded-md border border-neutral-900 bg-neutral-900/40 animate-pulse"
                />
              ))}
            </div>
          )}

          {chatErr && (
            <div className="text-xs text-red-400 px-2 py-2">{chatErr}</div>
          )}

          {!loadingChats && !chatErr && filtered.length === 0 && (
            <div className="text-xs text-neutral-500 px-2 py-2">
              No chats match your search.
            </div>
          )}

          {filtered.map((c) => {
            const Content = (
              <div className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900/70 border border-neutral-800">
                    <MessageSquare
                      size={14}
                      className="text-neutral-400 group-hover:text-amber-300 transition"
                    />
                  </div>

                  {/* Title & meta (hide when collapsed) */}
                  {sidebarOpen ? (
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium truncate">
                        {c.title || "Untitled chat"}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-neutral-500">
                        <Clock3 size={12} className="opacity-80" />
                        <span className="truncate">
                          Updated {formatWhen(c.updatedAt)}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {sidebarOpen && (
                    <MoreHorizontal
                      size={16}
                      className="text-neutral-600 opacity-0 group-hover:opacity-100 transition"
                    />
                  )}
                </div>
              </div>
            );

            return (
              <Link
                key={c.id}
                href={`/chat/${c.id}`}
                className="group block rounded-lg border border-transparent hover:border-neutral-800 bg-transparent hover:bg-neutral-950/60 transition"
                title={sidebarOpen ? undefined : c.title || "Untitled chat"}
              >
                {Content}
              </Link>
            );
          })}
        </div>
      </aside>

      {/* Main Area */}
      <main className="col-span-12 md:col-span-8 lg:col-span-9 relative ml-[76px] md:ml-0">
        {/* Background accents */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[20%] top-10 h-64 w-64 rounded-full blur-3xl opacity-20 bg-amber-500" />
          <div className="absolute right-[20%] bottom-10 h-64 w-64 rounded-full blur-3xl opacity-10 bg-fuchsia-600" />
          <div className="absolute inset-0 opacity-[0.04] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:18px_18px]" />
        </div>

        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-neutral-800 bg-neutral-950/60 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur p-6 md:p-8 space-y-6">
            {/* Hero */}
            <div className="space-y-2 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900/60 px-3 py-1 text-[11px] text-neutral-400">
                <Sparkles size={14} /> Intelligent assistance, minimal noise
              </div>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
                Start learning today
              </h1>
              <p className="text-sm md:text-base text-neutral-400">
                Ask questions, build roadmaps, and keep your progress in one
                place.
              </p>
            </div>

            {/* Quick templates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => start("React Study Plan")}
                disabled={loading}
                className="group rounded-xl border border-neutral-800 bg-[#0b0b0c] hover:bg-neutral-900/70 transition p-4 text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <NotebookText className="opacity-80" size={18} />
                    <span className="text-sm font-medium">
                      React Study Plan
                    </span>
                  </div>
                  <Plus
                    size={16}
                    className="opacity-50 group-hover:opacity-100"
                  />
                </div>
                <p className="mt-2 text-[12px] text-neutral-500">
                  Topics, subtopics, and checkpoints to master React quickly.
                </p>
              </button>

              <button
                onClick={() => start("Data Structures Practice")}
                disabled={loading}
                className="group rounded-xl border border-neutral-800 bg-[#0b0b0c] hover:bg-neutral-900/70 transition p-4 text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Rocket className="opacity-80" size={18} />
                    <span className="text-sm font-medium">DSA Practice</span>
                  </div>
                  <Plus
                    size={16}
                    className="opacity-50 group-hover:opacity-100"
                  />
                </div>
                <p className="mt-2 text-[12px] text-neutral-500">
                  Daily problems, hints, and spaced repetition scheduling.
                </p>
              </button>
            </div>

            {/* Form */}
            <div className="space-y-3">
              <label className="text-[11px] text-neutral-400">Chat title</label>
              <div className="flex items-center gap-2">
                <input
                  className="w-full rounded-lg border border-neutral-800 bg-[#0b0b0c] p-2 text-sm outline-none focus:border-amber-500/50 placeholder:text-neutral-600"
                  placeholder="e.g., “Git & GitHub Crash Course”"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !loading) start();
                  }}
                />
                <button
                  onClick={() => start()}
                  disabled={loading}
                  className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition border shadow-sm
                    ${
                      !loading
                        ? "bg-gradient-to-b from-amber-500 to-amber-600 text-black border-amber-500 hover:brightness-105"
                        : "bg-neutral-900 text-neutral-500 border-neutral-800 cursor-not-allowed"
                    }`}
                >
                  {!loading ? (
                    <>
                      <Plus size={16} /> Start
                    </>
                  ) : (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Creating…
                    </>
                  )}
                </button>
              </div>
              {err && (
                <p className="text-xs text-red-400 border border-red-900/40 bg-red-950/30 rounded-md px-3 py-2">
                  {err}
                </p>
              )}
              <p className="text-[11px] text-neutral-500">
                You’ll be taken to the conversation page once the chat is
                created.
              </p>
            </div>

            {/* Helpful footer line */}
            <div className="pt-2 border-t border-neutral-900/60 text-center text-[11px] text-neutral-500">
              Pro tip: Press{" "}
              <span className="px-1 py-0.5 rounded border border-neutral-800 bg-neutral-900">
                Enter
              </span>{" "}
              to create immediately.
            </div>
          </div>
        </div>
      </main>

      {/* Mobile overlay when sidebar expanded (so it feels like a drawer) */}
      {!sidebarOpen ? null : (
        <div
          className="fixed inset-0 z-20 bg-black/0 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
