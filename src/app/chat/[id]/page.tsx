// src/app/chat/[id]/page.tsx
"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import {
  Send,
  Sparkles,
  BookOpen,
  Brain,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { webSearchPPLX } from "@/app/actions/websearch";
import { generateQuizViaGemini } from "@/app/actions/gemini";
import {
  saveChatSnapshot,
  savePlanAsPathway,
  getChatSnapshot,
} from "@/app/actions/chat";
import { classifyPrompt } from "@/app/actions/nlu";
import {
  generatePractice,
  type GeneratedMCQ,
  type GeneratedTextQ,
} from "@/app/actions/quiz";
import { appendPerformanceEvent } from "@/app/actions/progress";

import MCQCard from "../../../components/mcq"; // kept for compatibility
import TextAnswerCard from "../../../components/Text"; // kept for compatibility
import YoutubeRecs from "../../../components/YoutubeRecs";

/* =========================
   Types
========================= */
type BaseMessage = { id: string; timestamp: number };
type TextMessage = BaseMessage & { type: "user" | "ai"; content: string };

type RoadmapSubtopic = { type: "SUBTOPIC"; name: string; content?: string };
type RoadmapTopic = {
  type: "TOPIC";
  name: string;
  subtopics: RoadmapSubtopic[];
};
type Roadmap = RoadmapTopic[];

type PdfQueryResponse = {
  query: string;
  answer: string | Roadmap; // backend may return plain text or a roadmap
  context_used?: string;
  source?: string;
  metadata_patch?: SourceDoc;
};

type RoadmapMessage = BaseMessage & {
  type: "roadmap";
  plan: Roadmap;
  note?: string;
};
type ChatMessage = TextMessage | RoadmapMessage;

type ContentItem = { type: string; content: string };

type SourceDoc = {
  type: "pdf";
  filename: string;
  context_excerpt: string;
  context_hash: string;
  bytes_used?: number;
  source?: string;
};

// Long-term learning context
type Meta = {
  history: Array<{ ts: number; user: string; ai?: string }>;
  performance: Array<{
    ts: number;
    kind: "mcq" | "text";
    question: string;
    accuracy: number; // 0..1
  }>;
  sources?: SourceDoc[];
  // optional extension for quiz seeds
  quizSeeds?: Array<{
    ts: number;
    topic: string;
    subtopic: string;
    countMcq: number;
    countText: number;
  }>;
};

/* =========================
   Config
========================= */
const API_BASE = "https://4ba87256ffd0.ngrok-free.app";
const ROADMAP_GET = (q: string, ctx?: string) =>
  `${API_BASE}/ask?q=${encodeURIComponent(q)}${
    ctx ? `&context=${encodeURIComponent(ctx)}` : ""
  }&_ngrok_skip_browser_warning=true`;
const CHAT_POST = `${API_BASE}/general`;
const PDF_QUERY_POST = `${API_BASE}/pdf/query`;
const WEB_SEARCH_POST = `${API_BASE}/web/search`; // ← implement this on your backend
const CONTENT_GET = (q: string, ctx?: string) =>
  `${API_BASE}/ask?q=${encodeURIComponent(q)}${
    ctx ? `&context=${encodeURIComponent(ctx)}` : ""
  }&_ngrok_skip_browser_warning=true`;

/* =========================
   Helpers
========================= */
function tryExtractRoadmapFromText(text: string): Roadmap | null {
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first === -1 || last === -1 || last <= first) return null;
  try {
    const json = text.slice(first, last + 1).trim();
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return null;
    const ok = parsed.every(
      (t: any) =>
        t?.type === "TOPIC" &&
        typeof t.name === "string" &&
        Array.isArray(t.subtopics) &&
        t.subtopics.every(
          (s: any) => s?.type === "SUBTOPIC" && typeof s.name === "string"
        )
    );
    return ok ? (parsed as Roadmap) : null;
  } catch {
    return null;
  }
}
function stripRoadmapJsonFromText(text: string): string {
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first === -1 || last === -1 || last <= first) return text;
  const before = text.slice(0, first).trim();
  const after = text.slice(last + 1).trim();
  return [before, after].filter(Boolean).join("\n\n").trim();
}
function roadmapLeadIn(plan: Roadmap): string {
  const topics = plan.map((t) => t.name).slice(0, 6);
  const tail = plan.length > 6 ? "…" : "";
  return `I created a roadmap (${topics.join(
    " → "
  )}${tail}). Click a topic to explore subtopics.`;
}
function buildPayloadMetadata(
  messages: ChatMessage[],
  latestPlan: Roadmap | null,
  meta: Meta,
  prompt: string
) {
  return {
    events: [],
    roadmap: latestPlan ?? [],
    meta,
    prompt,
    messages: messages
      .filter((m): m is TextMessage => m.type === "user" || m.type === "ai")
      .map((m) => ({
        id: m.id,
        type: m.type,
        content: (m as TextMessage).content,
        timestamp: m.timestamp,
      })),
  } as const;
}

// NEW: build a compact context string that we can pass to every route
function buildContextString(opts: {
  chatId?: string | null;
  messages: ChatMessage[];
  meta: Meta;
  selectedTopic?: { topicName: string; subtopicName: string } | null;
  lastRoadmap?: Roadmap | null;
}) {
  const { chatId, messages, meta, selectedTopic, lastRoadmap } = opts;
  const turns = messages
    .filter((m): m is TextMessage => m.type === "user" || m.type === "ai")
    .slice(-8)
    .map((m) => ({ role: m.type, content: m.content, ts: m.timestamp }));

  const perf = meta.performance.slice(-12);
  const srcs = (meta.sources || []).slice(-6).map((s) => ({
    type: s.type,
    filename: s.filename,
    context_excerpt: s.context_excerpt,
  }));

  const ctx = {
    chatId,
    focus: selectedTopic
      ? { topic: selectedTopic.topicName, subtopic: selectedTopic.subtopicName }
      : undefined,
    lastRoadmapTopics: lastRoadmap?.map((t) => t.name),
    recentTurns: turns,
    recentPerformance: perf,
    recentSources: srcs,
  };

  try {
    return JSON.stringify(ctx);
  } catch {
    return "{}";
  }
}

async function askPdfQuery(
  file: File,
  question: string,
  contextString?: string,
  metadataString?: string
): Promise<PdfQueryResponse> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("query", question || "Summarize key ideas and definitions.");
  if (contextString) fd.append("context", contextString);
  if (metadataString) fd.append("metadata", metadataString);

  const res = await fetch(PDF_QUERY_POST, {
    method: "POST",
    body: fd,
    headers: { "ngrok-skip-browser-warning": "true" },
    mode: "cors",
  });

  const text = await res.text();
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/html") || text.includes("ERR_NGROK_6024")) {
    throw new Error("Ngrok splash intercepted the request.");
  }
  if (!res.ok) {
    throw new Error(`Backend error ${res.status}: ${text.substring(0, 200)}`);
  }
  return JSON.parse(text) as PdfQueryResponse;
}

async function postJSON<T = any>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "ngrok-skip-browser-warning": "true",
      Accept: "application/json,text/plain;q=0.9",
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
    mode: "cors",
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/html") || text.includes("ERR_NGROK_6024")) {
    throw new Error("Ngrok splash intercepted the request.");
  }
  if (!res.ok) {
    throw new Error(`Backend error ${res.status}: ${text.substring(0, 200)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text as any;
  }
}

// Quiz intent helpers
function isQuizIntent(q: string) {
  const s = q.toLowerCase();
  return /(quiz|quizz|mcq|questions?|practice|test|problems?)/i.test(s);
}
/** naive topic extractor: tries “…on/about/for <topic>” */
function guessTopicFromPrompt(q: string) {
  const m = q.match(/\b(?:on|about|for)\s+([A-Za-z0-9 .+\-/#]+)$/i);
  return m ? m[1].trim() : "";
}

/* =========================
   Header
========================= */
function Header() {
  const { data: session } = useSession();
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-900/70 bg-[#0b0b0c]/80 backdrop-blur">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-amber-400/80 via-amber-500 to-amber-600 grid place-items-center shadow-[0_0_0_1px_rgba(255,193,7,0.25)]">
            <Sparkles size={14} className="text-black" />
          </div>
          <span className="text-sm text-neutral-300">Learning Copilot</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-neutral-500 border border-neutral-800 rounded-full px-2 py-1">
            <Brain size={12} /> Smarter with your progress
          </div>
          {session?.user ? (
            <>
              <span className="text-sm text-neutral-300 hidden sm:block">
                {session.user.name}
              </span>
              <Image
                src={session.user.image || "/default-avatar.png"}
                alt={session.user.name || "User"}
                width={28}
                height={28}
                className="rounded-full"
              />
            </>
          ) : (
            <Image
              src="/default-avatar.png"
              alt="Guest"
              width={28}
              height={28}
              className="rounded-full"
            />
          )}
        </div>
      </div>
    </header>
  );
}

/* =========================
   Learning Content (RIGHT PANEL)
========================= */
function LearningContent({
  query,
  contextString,
}: {
  query: string;
  contextString?: string;
}) {
  const [items, setItems] = useState<ContentItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!query) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      setItems(null);
      try {
        const url = CONTENT_GET(query, contextString);
        const res = await fetch(url, {
          method: "GET",
          mode: "cors",
          headers: {
            "ngrok-skip-browser-warning": "true",
            Accept: "application/json,text/plain;q=0.9",
            "Cache-Control": "no-cache",
          },
        });
        const ct = res.headers.get("content-type") || "";
        const bodyText = await res.text();
        if (ct.includes("text/html") || bodyText.includes("ERR_NGROK_6024")) {
          throw new Error("Ngrok splash intercepted the request.");
        }
        if (!res.ok) throw new Error(`Backend error ${res.status}`);
        const parsed = JSON.parse(bodyText);
        if (!Array.isArray(parsed))
          throw new Error("Unexpected /content shape.");
        if (alive) setItems(parsed as ContentItem[]);
      } catch (e: any) {
        if (alive) setErr(e?.message ?? "Failed to load content.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [query, contextString]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-center gap-2 text-sm text-neutral-400">
          <div className="h-2 w-2 rounded-full bg-neutral-500 animate-pulse" />
          Loading study materials…
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-2xl border border-red-900/40 bg-red-950/40 p-4 text-sm text-red-300">
        {err}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
        No study materials found for this topic.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-900/60 flex items-center gap-2">
        <BookOpen size={16} className="text-neutral-400" />
        <div className="text-sm font-semibold text-neutral-100">
          Study materials
        </div>
        <div className="text-xs text-neutral-500">· {query}</div>
      </div>
      <div className="divide-y divide-neutral-800">
        {items.map((it, idx) => (
          <div key={idx} className="p-4 space-y-1.5">
            <div className="text-sm whitespace-pre-wrap text-neutral-200">
              {it.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================
   D3 Roadmap (visual polish)
========================= */
function InteractiveRoadmap({
  roadmap,
  onSubtopicClick,
}: {
  roadmap: Roadmap;
  onSubtopicClick: (topicName: string, subtopic: string) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<number | null>(null);

  const { nodes, links } = useMemo(() => {
    type Node = {
      id: string;
      label: string;
      index: number;
      x: number;
      y: number;
    };
    type Link = { source: string; target: string };
    const n: Node[] = [];
    const l: Link[] = [];
    const gapX = 190;
    const centerY = 110;

    roadmap.forEach((topic, i) => {
      const topicId = `topic_${i}`;
      const x = 120 + i * gapX;
      n.push({ id: topicId, label: topic.name, index: i, x, y: centerY });
      if (i > 0) l.push({ source: `topic_${i - 1}`, target: topicId });
    });

    return { nodes: n, links: l };
  }, [roadmap]);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const wrapper = wrapperRef.current;
    const width = wrapper.clientWidth;
    const height = 220;

    let svg = d3.select(svgRef.current) as d3.Selection<
      SVGSVGElement | null,
      unknown,
      null,
      undefined
    >;
    if (svg.empty()) {
      // create an <svg> under the wrapper and keep the DOM ref
      const wrapperSel = d3.select(wrapper);
      const newSvg = wrapperSel.append("svg");
      // store DOM node ref for later direct access
      svgRef.current = newSvg.node() as SVGSVGElement | null;
      svg = newSvg as d3.Selection<
        SVGSVGElement | null,
        unknown,
        null,
        undefined
      >;
    }
    svg
      .attr("width", "100%")
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`);
    svg.selectAll("*").remove();

    // gradient defs
    const defs = svg.append("defs");
    const grad = defs
      .append("linearGradient")
      .attr("id", "edgeGrad")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "100%")
      .attr("y2", "0%");
    grad.append("stop").attr("offset", "0%").attr("stop-color", "#f59e0b");
    grad.append("stop").attr("offset", "100%").attr("stop-color", "#f97316");

    defs
      .append("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 45)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#f59e0b");

    const g = svg.append("g");
    // typed helpers for the zoom block
    interface SVGZoomEvent extends d3.D3ZoomEvent<SVGSVGElement, unknown> {}
    type SVGZoomBehavior = d3.ZoomBehavior<SVGSVGElement, unknown>;
    type GSelection = d3.Selection<SVGGElement, unknown, null, undefined>;

    const gSel = g as GSelection;

    const zoom: SVGZoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.7, 2])
      .on("zoom", (e: SVGZoomEvent) => {
        // ZoomTransform#toString() returns a transform string suitable for attr("transform")
        gSel.attr("transform", (e as any).transform.toString());
      });
    svg.call(zoom as any);

    interface RoadmapLink {
      source: string;
      target: string;
    }

    g.selectAll<SVGLineElement, RoadmapLink>("line.link")
      .data(links as RoadmapLink[])
      .enter()
      .append("line")
      .attr("class", "link")
      .attr("stroke", "url(#edgeGrad)")
      .attr("stroke-width", 2)
      .attr("marker-end", "url(#arrow)")
      .attr(
        "x1",
        (d: RoadmapLink) =>
          (nodes as RoadmapNode[]).find((n) => n.id === d.source)!.x + 40
      )
      .attr(
        "y1",
        (d: RoadmapLink) =>
          (nodes as RoadmapNode[]).find((n) => n.id === d.source)!.y
      )
      .attr(
        "x2",
        (d: RoadmapLink) =>
          (nodes as RoadmapNode[]).find((n) => n.id === d.target)!.x - 40
      )
      .attr(
        "y2",
        (d: RoadmapLink) =>
          (nodes as RoadmapNode[]).find((n) => n.id === d.target)!.y
      );

    interface RoadmapNode {
      id: string;
      label: string;
      index: number;
      x: number;
      y: number;
    }

    const nodeGroup: d3.Selection<
      SVGGElement,
      RoadmapNode,
      SVGGElement,
      unknown
    > = g
      .selectAll<SVGGElement, RoadmapNode>("g.node")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", (d: RoadmapNode) => `translate(${d.x}, ${d.y})`);

    nodeGroup
      .append<SVGCircleElement>("circle")
      .attr("r", 38)
      .attr("fill", (d: RoadmapNode) =>
        selectedTopic === d.index ? "#f59e0b" : "#111827"
      )
      .attr("stroke", "#f59e0b")
      .attr("stroke-width", 2)
      .style("cursor", "pointer")
      .on(
        "mouseover",
        function (this: SVGCircleElement, _e: MouseEvent, _d: RoadmapNode) {
          d3.select<SVGCircleElement, RoadmapNode>(this)
            .attr("fill", "#f59e0b")
            .attr("r", 40);
        }
      )
      .on(
        "mouseout",
        function (this: SVGCircleElement, _e: MouseEvent, d: RoadmapNode) {
          d3.select<SVGCircleElement, RoadmapNode>(this)
            .attr("fill", selectedTopic === d.index ? "#f59e0b" : "#111827")
            .attr("r", 38);
        }
      )
      .on(
        "click",
        function (this: SVGCircleElement, _e: MouseEvent, d: RoadmapNode) {
          setSelectedTopic(selectedTopic === d.index ? null : d.index);
        }
      );

    nodeGroup
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", "11px")
      .attr("fill", "#ffffff")
      .attr("font-weight", "600")
      .style("pointer-events", "none")
      .each(function (this: SVGTextElement, d: any) {
        const text = d3.select<SVGTextElement, any>(this);
        const words = String(d.label).split(/\s+/);
        if (words.length === 1 && d.label.length <= 12) text.text(d.label);
        else if (words.length <= 2) {
          text.selectAll("tspan").remove();
          words.forEach((word: string, i: number) =>
            text
              .append("tspan")
              .attr("x", 0)
              .attr("dy", i === 0 ? "-0.3em" : "1.2em")
              .text(word.length > 10 ? word.slice(0, 8) + "..." : word)
          );
        } else {
          text.text(
            words[0].length > 8
              ? words[0].slice(0, 6) + "..."
              : words[0] + "..."
          );
        }
      });

    const totalWidth =
      nodes.length > 0 ? Math.max(...nodes.map((n) => n.x)) + 130 : width;
    if (totalWidth > width) {
      svg.attr("viewBox", `0 0 ${totalWidth} ${height}`);
      let isScrolling = false,
        startX = 0,
        scrollLeft = 0;
      const handleStart = (x: number) => {
        isScrolling = true;
        startX = x;
        scrollLeft = parseFloat(
          (svg.attr("viewBox") || "0 0 0 0").split(" ")[0]
        );
        svg.style("cursor", "grabbing");
      };
      const handleMove = (x: number) => {
        if (!isScrolling) return;
        const walk = (x - startX) * 2;
        const newLeft = Math.max(
          0,
          Math.min(totalWidth - width, scrollLeft - walk)
        );
        svg.attr("viewBox", `${newLeft} 0 ${width} ${height}`);
      };
      const handleEnd = () => {
        isScrolling = false;
        svg.style("cursor", "grab");
      };
      svg
        .style("cursor", "grab")
        .on("mousedown", (e: any) => handleStart(e.clientX))
        .on("mousemove", (e: any) => handleMove(e.clientX))
        .on("mouseup", handleEnd)
        .on("mouseleave", handleEnd);
    } else {
      svg.attr("viewBox", `0 0 ${width} ${height}`);
    }

    const onResize = () => {
      svg.attr("viewBox", `0 0 ${wrapper.clientWidth} ${height}`);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [nodes, links, selectedTopic]);

  return (
    <div className="space-y-4">
      <div
        ref={wrapperRef}
        className="w-full h-56 overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-900 to-neutral-950 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]"
      />
      {selectedTopic !== null && roadmap[selectedTopic] && (
        <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-neutral-900 to-neutral-950 shadow-[0_0_0_1px_rgba(255,193,7,0.12)] overflow-hidden">
          <div className="bg-gradient-to-r from-amber-500/10 to-transparent p-4 border-b border-amber-500/20">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-amber-500 rounded-full" />
              <h3 className="font-semibold text-amber-400">
                {roadmap[selectedTopic].name}
              </h3>
              <span className="text-xs text-neutral-500 ml-2">
                {roadmap[selectedTopic].subtopics.length} subtopics
              </span>
            </div>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {roadmap[selectedTopic].subtopics.map((subtopic, i) => (
                <div
                  key={i}
                  className="group flex items-center gap-3 text-sm text-neutral-300 bg-neutral-800/50 hover:bg-neutral-800 rounded-lg px-3 py-2.5 transition-colors duration-200 cursor-pointer"
                  onClick={() =>
                    onSubtopicClick(roadmap[selectedTopic].name, subtopic.name)
                  }
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 group-hover:bg-amber-300 transition-colors duration-200 flex-shrink-0" />
                  <span className="group-hover:text-neutral-200 transition-colors duration-200">
                    {subtopic.name}
                  </span>
                  <ChevronRight size={14} className="ml-auto opacity-40" />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-neutral-800">
              <div className="text-xs text-neutral-500">
                💡 Click subtopics to learn more • Click the circle again to
                collapse
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================
   Chat Messages (AI uses Markdown)
========================= */
function ChatMessages({
  messages,
  isTyping,
  onSubtopicClick,
}: {
  messages: ChatMessage[];
  isTyping: boolean;
  onSubtopicClick: (topic: string, subtopic: string) => void;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  return (
    <div className="space-y-5">
      {messages.map((m) => {
        if (m.type === "roadmap") {
          const rm = m as RoadmapMessage;
          return (
            <div key={m.id} className="space-y-3">
              {rm.note && (
                <div className="flex gap-3 w-full">
                  <div className="h-8 w-8 rounded-full bg-neutral-900 border border-neutral-800 grid place-items-center flex-shrink-0">
                    <Sparkles size={14} className="text-amber-400" />
                  </div>
                  <div className="flex-1 rounded-2xl bg-neutral-900/70 border border-neutral-800 px-4 py-3 leading-relaxed whitespace-pre-wrap">
                    {rm.note}
                  </div>
                </div>
              )}
              <InteractiveRoadmap
                roadmap={rm.plan}
                onSubtopicClick={onSubtopicClick}
              />
            </div>
          );
        }

        const tm = m as TextMessage;
        const isAI = tm.type === "ai";
        return isAI ? (
          <div key={m.id} className="flex gap-3 w-full">
            <div className="h-8 w-8 rounded-full bg-neutral-900 border border-neutral-800 grid place-items-center flex-shrink-0">
              <Sparkles size={14} className="text-amber-400" />
            </div>
            <div className="flex-1 rounded-2xl bg-neutral-900/70 border border-neutral-800 px-4 py-3 leading-relaxed prose prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  code(props) {
                    const { children, className, ...rest } = props as any;
                    const isInline = !String(className || "").includes(
                      "language-"
                    );
                    return isInline ? (
                      <code
                        className="px-1.5 py-0.5 rounded bg-neutral-800/70 border border-neutral-800"
                        {...rest}
                      >
                        {children}
                      </code>
                    ) : (
                      <pre
                        className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 overflow-x-auto"
                        {...rest}
                      >
                        <code className={className}>{children}</code>
                      </pre>
                    );
                  },
                  table(props) {
                    return (
                      <div className="overflow-x-auto">
                        <table
                          className="table-auto w-full border-collapse"
                          {...props}
                        />
                      </div>
                    );
                  },
                }}
              >
                {tm.content}
              </ReactMarkdown>
            </div>
          </div>
        ) : (
          <div key={m.id} className="flex w-full justify-end">
            <div className="max-w-[75%] rounded-2xl bg-gradient-to-b from-amber-500 to-amber-600 text-black px-4 py-3 leading-relaxed whitespace-pre-wrap shadow">
              {tm.content}
            </div>
          </div>
        );
      })}
      {isTyping && (
        <div className="flex gap-3 items-center text-neutral-400">
          <div className="h-8 w-8 rounded-full bg-neutral-900 border border-neutral-800 grid place-items-center flex-shrink-0">
            <Sparkles size={14} className="text-amber-400" />
          </div>
          <div className="flex items-center gap-1 text-sm">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-neutral-500 animate-bounce [animation-delay:-.2s]" />
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-neutral-500 animate-bounce" />
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-neutral-500 animate-bounce [animation-delay:.2s]" />
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

/* =========================
   Quick Chips
========================= */
function QuickChips({ onPick }: { onPick: (s: string) => void }) {
  const chips = [
    "Create a roadmap for React",
    "Explain closures with examples",
    "Design a 2-week DSA plan",
    "Summarize GraphQL vs REST",
  ];
  return (
    <div className="flex flex-wrap gap-2 px-1 mb-2">
      {chips.map((c) => (
        <button
          key={c}
          onClick={() => onPick(c)}
          className="text-[11px] px-2 py-1 rounded-full border border-neutral-800 bg-neutral-900/80 hover:bg-neutral-900 text-neutral-400"
        >
          {c}
        </button>
      ))}
    </div>
  );
}

/* =========================
   Chat Input (textarea prompt + attachments + Live Search toggle)
========================= */
function ChatInput({
  currentMessage,
  setCurrentMessage,
  onSend,
  onPickPdf,
  attachments,
  onRemoveAttachment,
  disabled,
  showPracticeToggle,
  practiceOpen,
  onTogglePractice,
  useWebSearch,
  setUseWebSearch,
}: {
  currentMessage: string;
  setCurrentMessage: (message: string) => void;
  onSend: (text: string) => void;
  onPickPdf: (file: File) => void;
  attachments: File[];
  onRemoveAttachment: (index: number) => void;
  disabled: boolean;
  showPracticeToggle: boolean;
  practiceOpen: boolean;
  onTogglePractice: () => void;
  useWebSearch: boolean;
  setUseWebSearch: (v: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="border-t border-neutral-900 bg-gradient-to-t from-[#0a0a0b] via-[#0a0a0b]/95 to-transparent p-4">
      <div className="mx-auto max-w-3xl">
        <QuickChips onPick={(s) => setCurrentMessage(s)} />

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 focus-within:ring-1 focus-within:ring-amber-500/60 overflow-hidden">
          {/* Textarea */}
          <textarea
            rows={1}
            className="w-full resize-none bg-transparent px-4 py-3 outline-none"
            placeholder='Ask anything… e.g. "Create a learning roadmap for Machine Learning"'
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const text = currentMessage.trim();
                if (text || attachments.length > 0) onSend(text);
              }
            }}
          />

          {/* Attachment chips (PDFs) */}
          {attachments.length > 0 && (
            <div className="px-3 pb-2 flex flex-wrap gap-2">
              {attachments.map((f, i) => (
                <div
                  key={`${f.name}-${f.size}-${i}`}
                  className="flex items-center gap-2 text-xs rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1"
                  title={f.name}
                >
                  <BookOpen size={12} className="text-neutral-400" />
                  <span className="text-neutral-300 max-w-[220px] truncate">
                    {f.name}
                  </span>
                  <button
                    onClick={() => onRemoveAttachment(i)}
                    className="text-neutral-500 hover:text-neutral-200"
                    aria-label="Remove attachment"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-2 pb-2">
            <div className="flex items-center gap-2 text-[11px] text-neutral-500 pl-2 flex-wrap">
              <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2 py-1">
                Roadmaps • Practice • Videos
              </span>

              {/* Upload PDF */}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="ml-2 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300"
                title="Upload PDF"
              >
                <BookOpen size={14} /> Upload PDF
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onPickPdf(f);
                  e.currentTarget.value = "";
                }}
              />

              {/* Live web search toggle */}
              <label className="ml-2 inline-flex items-center gap-2 text-[11px] rounded-lg px-2.5 py-1.5 border border-neutral-800 bg-neutral-900">
                <input
                  type="checkbox"
                  className="accent-amber-500"
                  checked={useWebSearch}
                  onChange={(e) => setUseWebSearch(e.target.checked)}
                />
                <span className="text-neutral-300">Web search</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              {showPracticeToggle && (
                <button
                  onClick={onTogglePractice}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-300"
                >
                  {practiceOpen ? (
                    <>
                      <PanelRightClose size={14} /> Hide panel
                    </>
                  ) : (
                    <>
                      <PanelRightOpen size={14} /> Show panel
                    </>
                  )}
                </button>
              )}

              <button
                onClick={() => {
                  const text = currentMessage.trim();
                  if (text || attachments.length > 0) onSend(text);
                }}
                disabled={disabled}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                  !disabled
                    ? "bg-gradient-to-b from-amber-500 to-amber-600 text-black hover:brightness-105"
                    : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                }`}
              >
                <Send size={16} />
                Send
              </button>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-neutral-500 mt-2 text-center">
          Tip: Ask for a roadmap in JSON (TOPIC/SUBTOPIC) to get an interactive
          visualization.
        </p>
      </div>
    </div>
  );
}

/* =========================
   NEW: PracticePanel (2 MCQs + 1 Text, submit together, show solutions, more if <70%)
========================= */
/* =========================
   PracticePanel (adaptive difficulty)
========================= */
function PracticePanel({
  chatId,
  topic,
  subtopic,
  contextString,
  seed,
  onAppendMessage,
  onAppendPerfEvent,
}: {
  chatId: string;
  topic: string;
  subtopic: string;
  contextString: string;
  seed?: { mcqs: GeneratedMCQ[]; texts: GeneratedTextQ[] } | null;
  onAppendMessage: (m: { content: string }) => void;
  onAppendPerfEvent: (e: {
    kind: "mcq" | "text";
    question: string;
    accuracy: number;
    details?: any;
  }) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // active batch (exactly 2 mcqs + 1 text)
  const [mcqs, setMcqs] = useState<GeneratedMCQ[]>([]);
  const [textQ, setTextQ] = useState<GeneratedTextQ | null>(null);

  // user answers
  const [mcqAnswers, setMcqAnswers] = useState<Array<number | null>>([
    null,
    null,
  ]);
  const [textAnswer, setTextAnswer] = useState("");

  // difficulty state
  type Diff = "auto" | "easier" | "same" | "harder";
  const [difficulty, setDifficulty] = useState<Diff>("auto"); // current setting for next batch
  const [suggestedDifficulty, setSuggestedDifficulty] = useState<Diff>("auto"); // suggestion after grading

  // review history (previous rounds)
  type MCQReview = GeneratedMCQ & {
    pickedIndex: number | null;
    correct: boolean;
  };
  type TextReview = {
    prompt: string;
    user: string;
    score: number;
    feedback?: string;
  };
  const [reviews, setReviews] = useState<
    Array<{ mcqs: MCQReview[]; text: TextReview; accuracy: number }>
  >([]);

  const THRESHOLD_OK = 0.7;
  const THRESHOLD_HARDER = 0.9;

  const fullyAnswered =
    mcqAnswers.every((v) => typeof v === "number") &&
    textAnswer.trim().length > 0;

  // merge difficulty into the compact learner context JSON
  function contextWithDifficulty(base: string, d: Diff) {
    try {
      const obj = base ? JSON.parse(base) : {};
      const practice =
        typeof obj.practice === "object" && obj.practice !== null
          ? obj.practice
          : {};
      obj.practice = {
        ...practice,
        difficulty: d,
        // breadcrumbs helpful to the generator:
        lastTopic: topic,
        lastSubtopic: subtopic,
        lastBatchSize: { mcq: 2, text: 1 },
        ts: Date.now(),
      };
      return JSON.stringify(obj);
    } catch {
      // very defensive fallback
      return base;
    }
  }

  async function loadBatch(nextDiff: Diff = difficulty) {
    setLoading(true);
    setErr(null);
    try {
      const effectiveCtx = contextWithDifficulty(contextString, nextDiff);
      const res = await (generatePractice as any)({
        topic,
        subtopic,
        roadmap: [],
        numMcqs: 2,
        numTexts: 1,
        context: effectiveCtx,
        difficulty: nextDiff, // if your server supports it, great; otherwise ignored
      });
      setMcqs(res.mcqs.slice(0, 2));
      setTextQ(
        res.texts[0] ?? { prompt: `In 3–5 sentences, explain: ${subtopic}` }
      );
      setMcqAnswers([null, null]);
      setTextAnswer("");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to generate practice.");
      setMcqs([]);
      setTextQ(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (seed && seed.mcqs?.length) {
      setMcqs(seed.mcqs.slice(0, 2));
      setTextQ(
        seed.texts?.[0] ?? { prompt: `In 3–5 sentences, explain: ${subtopic}` }
      );
      setMcqAnswers([null, null]);
      setTextAnswer("");
      setDifficulty("auto");
      setSuggestedDifficulty("auto");
      return;
    }
    loadBatch("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, subtopic, contextString, seed]);

  async function submitAll() {
    if (!fullyAnswered || !textQ) return;

    // grade MCQs locally
    const gradedMcqs: MCQReview[] = mcqs.map((q, i) => {
      const pickedIndex = mcqAnswers[i] as number;
      const correct = pickedIndex === q.correctIndex;
      return { ...q, pickedIndex, correct };
    });

    // simple text grading heuristic (replace with server grader if you have one)
    let textScore = 0.5;
    let textFeedback = "Thanks! Keep refining key points and structure.";
    const len = textAnswer.trim().length;
    textScore = len > 300 ? 0.9 : len > 120 ? 0.7 : len > 40 ? 0.5 : 0.3;
    textFeedback =
      textScore >= 0.7
        ? "Clear and mostly complete—nice work!"
        : "Missing depth/examples; try defining terms and giving a worked example.";

    // accuracy across 3 items
    const mcqScore =
      (gradedMcqs[0].correct ? 1 : 0) + (gradedMcqs[1].correct ? 1 : 0);
    const accuracy = (mcqScore + textScore) / 3;

    // persist perf events -> parent meta updates -> flows back into contextString
    gradedMcqs.forEach((g) =>
      onAppendPerfEvent({
        kind: "mcq",
        question: g.question,
        accuracy: g.correct ? 1 : 0,
        details: { pickedIndex: g.pickedIndex, correctIndex: g.correctIndex },
      })
    );
    onAppendPerfEvent({
      kind: "text",
      question: textQ.prompt,
      accuracy: textScore,
    });

    // store review (solutions)
    setReviews((prev) => [
      ...prev,
      {
        mcqs: gradedMcqs,
        text: {
          prompt: textQ.prompt,
          user: textAnswer,
          score: textScore,
          feedback: textFeedback,
        },
        accuracy,
      },
    ]);

    // suggest difficulty for NEXT round
    let suggestion: Diff = "same";
    if (accuracy < THRESHOLD_OK) suggestion = "easier";
    else if (accuracy >= THRESHOLD_HARDER) suggestion = "harder";
    setSuggestedDifficulty(suggestion);
    setDifficulty(suggestion);

    // Instead of a generic recap, ask for difficulty preference
    onAppendMessage({
      content:
        `You scored **${(accuracy * 100).toFixed(0)}%** on “${subtopic}”. ` +
        `Want the next round to be **easier**, **same**, or **harder**? ` +
        `(Suggested: **${suggestion}**.)\n\n` +
        `Tell me your preference or use the buttons in the right panel.`,
    });

    // clear current answers; wait for user choice before loading more
    setMcqAnswers([null, null]);
    setTextAnswer("");
  }

  return (
    <div className="space-y-4">
      {/* Current batch */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold text-neutral-100 flex items-center gap-2">
            <BookOpen size={16} className="text-neutral-400" />
            Practice: {subtopic}
          </div>
          {loading && <div className="text-xs text-neutral-500">loading…</div>}
        </div>

        {err && (
          <div className="text-sm text-red-300 bg-red-950/30 border border-red-900/40 rounded p-2 mb-3">
            {err}
          </div>
        )}

        {/* MCQs (2) */}
        {mcqs.slice(0, 2).map((q, i) => (
          <div key={`mcq-${i}`} className="mb-4">
            <div className="text-sm font-medium mb-2">
              {i + 1}. {q.question}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {q.options.map((opt, j) => {
                const selected = mcqAnswers[i] === j;
                return (
                  <button
                    key={j}
                    onClick={() =>
                      setMcqAnswers((prev) => {
                        const copy = [...prev];
                        copy[i] = j;
                        return copy;
                      })
                    }
                    className={`text-left text-sm rounded-lg border px-3 py-2 ${
                      selected
                        ? "border-amber-500 bg-amber-500/10 text-amber-200"
                        : "border-neutral-800 bg-neutral-800/40 hover:bg-neutral-800 text-neutral-200"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Text (1) */}
        {textQ && (
          <div className="mb-4">
            <div className="text-sm font-medium mb-2">3. {textQ.prompt}</div>
            <textarea
              rows={5}
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900 focus:ring-1 focus:ring-amber-500/50 px-3 py-2 text-sm"
              placeholder="Write your answer here…"
            />
            {textQ.context && (
              <div className="mt-2 text-xs text-neutral-500">
                Hint: {textQ.context}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          {/* Difficulty chooser – appears anytime, so learners can steer before submitting */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-neutral-500 mr-1">Next round:</span>
            {(["easier", "same", "harder"] as Diff[]).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`text-xs rounded-lg border px-2 py-1 ${
                  difficulty === d
                    ? "border-amber-500 bg-amber-500/10 text-amber-200"
                    : "border-neutral-800 bg-neutral-800/40 hover:bg-neutral-800 text-neutral-300"
                }`}
                title={
                  suggestedDifficulty === d
                    ? "Suggested based on your last score"
                    : ""
                }
              >
                {d}
                {suggestedDifficulty === d ? " • suggested" : ""}
              </button>
            ))}
          </div>

          <button
            onClick={submitAll}
            disabled={!fullyAnswered || loading}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
              fullyAnswered && !loading
                ? "bg-gradient-to-b from-amber-500 to-amber-600 text-black hover:brightness-105"
                : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
            }`}
          >
            Submit practice (2 MCQ + 1 Text)
          </button>
        </div>
      </div>

      {/* “Load next” control (separate from submission) */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">Ready for more?</span>
          <button
            onClick={() => loadBatch(difficulty)}
            className="text-xs rounded-lg border border-neutral-800 bg-neutral-800/40 hover:bg-neutral-800 text-neutral-200 px-2 py-1"
            disabled={loading}
          >
            Generate next set ({difficulty})
          </button>
        </div>
      </div>

      {/* Reviews (solutions) */}
      {reviews.length > 0 && (
        <div className="space-y-4">
          {reviews
            .slice()
            .reverse()
            .map((r, idx) => (
              <div
                key={`rev-${reviews.length - 1 - idx}`}
                className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold">
                    Previous round • Accuracy: {(r.accuracy * 100).toFixed(0)}%
                  </div>
                </div>

                {/* MCQ review */}
                {r.mcqs.map((q, i) => (
                  <div key={`rev-mcq-${i}`} className="mb-3">
                    <div className="text-sm font-medium mb-1">
                      {i + 1}. {q.question}
                    </div>
                    <div className="text-xs mb-1">
                      Your answer:{" "}
                      <span
                        className={
                          q.correct ? "text-emerald-300" : "text-red-300"
                        }
                      >
                        {typeof (q as any).pickedIndex === "number"
                          ? q.options[(q as any).pickedIndex]
                          : "—"}
                      </span>
                      {"  "}• Correct:{" "}
                      <span className="text-amber-300">
                        {q.options[q.correctIndex]}
                      </span>
                    </div>
                    {(q as any).explanation && (
                      <div className="text-xs text-neutral-400">
                        Why: {(q as any).explanation}
                      </div>
                    )}
                  </div>
                ))}

                {/* Text review */}
                <div className="mt-2">
                  <div className="text-sm font-medium mb-1">Text question</div>
                  <div className="text-xs text-neutral-500 mb-1">
                    Score: {((r.text.score ?? 0) * 100).toFixed(0)}%
                  </div>
                  <div className="text-sm whitespace-pre-wrap rounded border border-neutral-800 bg-neutral-950 px-3 py-2">
                    {r.text.user || "—"}
                  </div>
                  {r.text.feedback && (
                    <div className="text-xs text-neutral-400 mt-2">
                      Feedback: {r.text.feedback}
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/* =========================
   Main Page (Chat by ID)
========================= */
export default function ChatByIdPage() {
  const params = useParams<{ id: string }>();
  const chatId = params?.id ?? null;

  const [currentMessage, setCurrentMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [meta, setMeta] = useState<Meta>({
    history: [],
    performance: [],
    sources: [],
    quizSeeds: [],
  });
  const [selectedLearningTopic, setSelectedLearningTopic] = useState<{
    topicName: string;
    subtopicName: string;
  } | null>(null);

  // attachments for the composer (PDFs)
  const [attachments, setAttachments] = useState<File[]>([]);
  const [useWebSearch, setUseWebSearch] = useState<boolean>(false);

  // Hydrate from server
  useEffect(() => {
    let canceled = false;
    (async () => {
      if (!chatId) return;

      try {
        const snap = await getChatSnapshot(chatId);
        if (!snap?.ok || canceled) return;

        const textMsgs: TextMessage[] = (snap.chat.messages ?? []) as any;
        const msgs: ChatMessage[] = [...textMsgs];
        const plan = (snap.chat as any).roadmap as Roadmap | null;

        if (plan && Array.isArray(plan) && plan.length) {
          msgs.push({
            id: crypto.randomUUID(),
            type: "roadmap",
            plan,
            note: roadmapLeadIn(plan),
            timestamp: Date.now(),
          } as RoadmapMessage);
        }

        setMessages(
          msgs.length
            ? msgs
            : [
                {
                  id: crypto.randomUUID(),
                  type: "ai",
                  content:
                    "Hi! I’m your learning copilot. Ask anything.\nTry: “Create a learning roadmap for Machine Learning (TOPIC/SUBTOPIC JSON)”",
                  timestamp: Date.now(),
                } as TextMessage,
              ]
        );

        const hist = ((snap.chat as any).history ?? []) as Meta["history"];
        const perf = ((snap.chat as any).performance ??
          []) as Meta["performance"];
        const sources = ((snap.chat as any).sources ?? []) as Meta["sources"];
        const quizSeeds =
          ((snap.chat as any).meta?.quizSeeds as Meta["quizSeeds"]) ?? [];

        setMeta({
          history: Array.isArray(hist) ? hist : [],
          performance: Array.isArray(perf) ? perf : [],
          sources: Array.isArray(sources) ? sources : [],
          quizSeeds: Array.isArray(quizSeeds) ? quizSeeds : [],
        });
      } catch {
        setMessages([
          {
            id: crypto.randomUUID(),
            type: "ai",
            content:
              "Hi! I’m your learning copilot. Ask anything.\nTry: “Create a learning roadmap for Machine Learning (TOPIC/SUBTOPIC JSON)”",
            timestamp: Date.now(),
          } as TextMessage,
        ]);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [chatId]);
  // replace your current getAskRaw with this
  async function getAskRaw(
    query: string,
    contextString?: string
  ): Promise<string> {
    // build URL safely
    const url = new URL(`${API_BASE}/ask`);
    url.searchParams.set("q", query);
    if (contextString && contextString.trim()) {
      url.searchParams.set("context", contextString);
    }
    // optional: tune retrieval size (backend supports it)
    url.searchParams.set("top_k", "6");
    url.searchParams.set("_ngrok_skip_browser_warning", "true");

    const res = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
      headers: {
        "ngrok-skip-browser-warning": "true",
        Accept: "application/json,text/plain;q=0.9",
        "Cache-Control": "no-cache",
      },
    });

    const bodyText = await res.text();
    const ct = res.headers.get("content-type") || "";

    if (ct.includes("text/html") || bodyText.includes("ERR_NGROK_6024")) {
      throw new Error("Ngrok splash intercepted the request.");
    }
    if (!res.ok) {
      throw new Error(
        `Backend error ${res.status}: ${bodyText.substring(0, 200)}`
      );
    }

    // Backend returns JSON (array of topics). We return a string so downstream
    // code can do tryExtractRoadmapFromText on it.
    // If it's already JSON, keep it as the original JSON string; otherwise pass through.
    if (ct.includes("application/json")) {
      // bodyText is already the JSON string representing the roadmap array
      return bodyText;
    }
    return bodyText;
  }

  // ---- helpers (quiz intent) ----
  function isQuizIntent(q: string) {
    const s = q.toLowerCase();
    return /(quiz|quizz|mcq|questions?|practice|test|problems?)/i.test(s);
  }

  /** naive topic extractor from trailing "... on/about/for <topic>" */
  function guessTopicFromPrompt(q: string) {
    const m = q.match(/\b(?:on|about|for)\s+([A-Za-z0-9 .+\-/#]+)$/i);
    return m ? m[1].trim() : "";
  }

  // ---- extra UI state for seeded quizzes (Gemini) ----
  const [practiceSeed, setPracticeSeed] = useState<{
    mcqs: GeneratedMCQ[];
    texts: GeneratedTextQ[];
  } | null>(null);

  // --- send handler ---
  async function handleSend(text: string) {
    if (!chatId) return;
    const question = text.trim(); // may be empty if only PDFs attached
    setCurrentMessage("");

    // If we have attachments, run PDF flow for each using the textarea prompt, then clear attachments.
    if (attachments.length > 0) {
      const localFiles = [...attachments];
      setAttachments([]); // clear UI immediately

      for (const file of localFiles) {
        const userMsg: TextMessage = {
          id: crypto.randomUUID(),
          type: "user",
          content: `📄 Attached PDF: ${file.name}\n\nPrompt: ${
            question || "(no prompt entered)"
          }`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, userMsg]);
        const msgsAfter = [...messages, userMsg];
        const pdfPrompt = question || `Summarize key ideas from "${file.name}"`;
        const pdfMetadata = buildPayloadMetadata(
          msgsAfter,
          null,
          meta,
          pdfPrompt
        );
        const pdfMetadataString = JSON.stringify(pdfMetadata);

        setIsTyping(true);
        try {
          const res = await askPdfQuery(
            file,
            pdfPrompt,
            undefined,
            pdfMetadataString
          );
          // helper: roadmap check
          const looksLikeRoadmap = (val: any): val is Roadmap =>
            Array.isArray(val) &&
            val.every(
              (t) =>
                t &&
                t.type === "TOPIC" &&
                typeof t.name === "string" &&
                Array.isArray(t.subtopics) &&
                t.subtopics.every(
                  (s: any) =>
                    s && s.type === "SUBTOPIC" && typeof s.name === "string"
                )
            );

          const patch = res.metadata_patch as SourceDoc | undefined;
          const nextMeta: Meta = {
            ...meta,
            history: [
              ...meta.history,
              {
                ts: Date.now(),
                user: `PDF: ${file.name} • ${question || "(no prompt)"}`,
                ai: "PDF processed.",
              },
            ],
            sources: patch
              ? [...(meta.sources || []), patch]
              : meta.sources || [],
          };
          setMeta(nextMeta);

          if (looksLikeRoadmap(res.answer)) {
            const plan = res.answer;

            const lead: TextMessage = {
              id: crypto.randomUUID(),
              type: "ai",
              content:
                roadmapLeadIn(plan) +
                (res.source ? `\n\nSource: ${res.source}` : ""),
              timestamp: Date.now(),
            };

            const road: RoadmapMessage = {
              id: crypto.randomUUID(),
              type: "roadmap",
              plan,
              note: undefined,
              timestamp: Date.now(),
            };

            setMessages((prev) => [...prev, lead, road]);

            await savePlanAsPathway({
              plan,
              title: `Learning Path from ${file.name}`,
              chatId,
              status: "ACTIVE",
            });

            await saveChatSnapshot({
              chatId,
              messages: [...messages, userMsg, lead].filter(
                (m): m is TextMessage => m.type === "user" || m.type === "ai"
              ),
              roadmap: plan,
              titleFallback: `PDF: ${file.name}`,
              meta: nextMeta as any,
            });
          } else {
            const aiMsg: TextMessage = {
              id: crypto.randomUUID(),
              type: "ai",
              content:
                (typeof res.answer === "string"
                  ? res.answer
                  : JSON.stringify(res.answer)) +
                (res.source ? `\n\nSource: ${res.source}` : ""),
              timestamp: Date.now(),
            };

            setMessages((prev) => [...prev, aiMsg]);

            await saveChatSnapshot({
              chatId,
              messages: [...messages, userMsg, aiMsg].filter(
                (m): m is TextMessage => m.type === "user" || m.type === "ai"
              ),
              roadmap: null,
              titleFallback: `PDF: ${file.name}`,
              meta: nextMeta as any,
            });
          }
        } catch (err: any) {
          const aiErr: TextMessage = {
            id: crypto.randomUUID(),
            type: "ai",
            content: `Could not process PDF "${file.name}":\n\n${
              err?.message ?? "Unknown error"
            }`,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, aiErr]);
        } finally {
          setIsTyping(false);
        }
      }

      return; // stop here (PDF flow handled). If user also had text, it was used as the prompt.
    }

    // If no attachments and no text, do nothing
    if (!question) return;

    // ------- NORMAL or WEB-SEARCH (with early GEMINI QUIZ branch) -------
    const userMsg: TextMessage = {
      id: crypto.randomUUID(),
      type: "user",
      content: question,
      timestamp: Date.now(),
    };

    const newMeta: Meta = {
      ...meta,
      history: [...meta.history, { ts: Date.now(), user: question }],
    };
    setMeta(newMeta);

    let afterUser: ChatMessage[] = [];
    setMessages((prev) => (afterUser = [...prev, userMsg]));

    setIsTyping(true);
    try {
      // ======== GEMINI QUIZ INTENT (short-circuits the rest) ========
      if (isQuizIntent(question)) {
        const topicGuess =
          guessTopicFromPrompt(question) ||
          selectedLearningTopic?.topicName ||
          "General";
        const subGuess = selectedLearningTopic?.subtopicName || topicGuess;

        // Inside handleSend (quiz-intent branch)

        // Build both:
        const contextString = buildContextString({
          chatId,
          messages: afterUser,
          meta: newMeta,
          selectedTopic: selectedLearningTopic,
          lastRoadmap: null,
        });
        const metadata = buildPayloadMetadata(
          afterUser,
          null,
          newMeta,
          question
        );

        // Call Gemini with context + metadata
        const quiz = await generateQuizViaGemini({
          topic: topicGuess,
          subtopic: subGuess,
          prompt: question,
          contextString,
          metadata, // <-- NEW: pass the full metadata too
          countMcq: 4,
          countText: 1,
        });

        // Persist a breadcrumb in meta for audit/analytics
        const newMetaWithQuiz: Meta & {
          quizSeeds?: Array<{
            ts: number;
            topic: string;
            subtopic: string;
            countMcq: number;
            countText: number;
          }>;
        } = {
          ...(newMeta as any),
          quizSeeds: [
            ...((newMeta as any).quizSeeds ?? []),
            {
              ts: Date.now(),
              topic: topicGuess,
              subtopic: subGuess,
              countMcq: quiz.mcqs.length,
              countText: quiz.texts.length,
            },
          ],
        };
        setMeta(newMetaWithQuiz);

        await saveChatSnapshot({
          chatId,
          messages: afterUser.filter(
            (m): m is TextMessage => m.type === "user" || m.type === "ai"
          ),
          roadmap: null,
          titleFallback: afterUser.length <= 2 ? question.slice(0, 60) : null,
          meta: newMetaWithQuiz as any,
        });

        // Open right panel and seed PracticePanel
        setSelectedLearningTopic({
          topicName: topicGuess,
          subtopicName: subGuess,
        });
        setPracticeSeed({ mcqs: quiz.mcqs, texts: quiz.texts });

        // Optional nudge in chat stream
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            type: "ai",
            content: `I created a quiz on **${subGuess}** (Gemini). Open on the right to begin.`,
            timestamp: Date.now(),
          } as TextMessage,
        ]);

        return; // stop here (don’t run web/general flow)
      }

      if (useWebSearch) {
        // 1) Build metadata for context (same shape you already use elsewhere)
        const metadataForSearch = buildPayloadMetadata(
          afterUser,
          null,
          newMeta,
          question
        );

        // 2) Stronger, shorter instruction (math/citations/quiz-handoff friendly)
        const minChars = Math.max(1200, question.length * 10);
        const webInstruction = [
          "OBJECTIVE:",
          "Write a current, well-sourced answer tailored to the learner's context (messages + progress metadata).",
          "",
          "REQUIREMENTS:",
          "- Include ISO dates for time-sensitive facts.",
          "- Add short inline source attributions and a **References** list at the end (≥6 when topic is broad).",
          "- Typeset math in LaTeX: inline $a^2+b^2=c^2$ and display $$E=mc^2$$.",
          "- Prefer clear headings and bullets; include small tables where useful.",
          "- Add a brief 'What changed recently' section when relevant.",
          "",
          "QUIZ HANDOFF:",
          "- If you give any practice questions, ALWAYS include the correct answer and a brief explanation for each (MCQ or short-answer).",
          "",
          "OUTPUT:",
          "- Markdown only.",
          "- End with a concise 'Key Takeaways' list.",
          "",
          "METADATA:",
          JSON.stringify(metadataForSearch, null, 2),
        ].join("\n");

        // 3) Pass metadata to the server action
        const result = await webSearchPPLX({
          query: question,
          minChars,
          instruction: webInstruction,
          recency: "month",
          model: "sonar-pro",
          metadata: {
            chatId,
            userGoal: "learning copilot",
            prompt: question, // <-- ensure this line exists
            messages: afterUser
              .filter((m) => m.type === "user" || m.type === "ai")
              .slice(-8)
              .map((m) => ({ role: m.type, content: (m as any).content })),
            roadmap: [],
            meta: newMeta,
          },
        });

        const textOut = result.text || "No content returned.";
        const refs =
          Array.isArray(result.sources) && result.sources.length
            ? `\n\n---\n**References**\n${result.sources
                .map((s, i) => `- [${i + 1}] ${s.title || s.url || ""}`)
                .join("\n")}`
            : "";

        const aiWeb: TextMessage = {
          id: crypto.randomUUID(),
          type: "ai",
          content: textOut + refs,
          timestamp: Date.now(),
        };
        const finalArray = [...afterUser, aiWeb];
        setMessages(finalArray);

        await saveChatSnapshot({
          chatId,
          messages: finalArray.filter(
            (m): m is TextMessage => m.type === "user" || m.type === "ai"
          ),
          roadmap: null,
          titleFallback: afterUser.length <= 2 ? question.slice(0, 60) : null,
          meta: newMeta as any,
        });

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            type: "ai",
            content:
              "Would you like me to quiz you on this? I can give you 2 MCQs + 1 short question and adapt if needed.",
            timestamp: Date.now(),
          } as TextMessage,
        ]);

        return;
      } else {
        // Non-web flow remains the same (route through classifier and general endpoint)
        const verdict = await classifyPrompt(question);

        let finalArray: ChatMessage[] = afterUser;
        let latestPlan: Roadmap | null = null;

        if (verdict.type === "roadmap") {
          // AFTER
          const md = buildPayloadMetadata(afterUser, null, newMeta, question);
          const contextString = buildContextString({
            chatId,
            messages: afterUser,
            meta: newMeta,
            selectedTopic: selectedLearningTopic,
            lastRoadmap: null,
          });
          const raw = await getAskRaw(question, contextString);

          const plan = tryExtractRoadmapFromText(raw);

          if (!plan) {
            const fallbackAI: TextMessage = {
              id: crypto.randomUUID(),
              type: "ai",
              content: raw,
              timestamp: Date.now(),
            };
            setMessages((prev) => (finalArray = [...prev, fallbackAI]));

            const withAi: Meta = {
              ...newMeta,
              history: [
                ...newMeta.history,
                { ts: Date.now(), user: question, ai: raw },
              ],
            };
            setMeta(withAi);

            await saveChatSnapshot({
              chatId,
              messages: finalArray.filter(
                (m): m is TextMessage => m.type === "user" || m.type === "ai"
              ),
              roadmap: null,
              titleFallback:
                afterUser.length <= 2 ? question.slice(0, 60) : null,
              meta: withAi as any,
            });
          } else {
            latestPlan = plan;

            const lead: TextMessage = {
              id: crypto.randomUUID(),
              type: "ai",
              content: roadmapLeadIn(plan),
              timestamp: Date.now(),
            };
            const road: RoadmapMessage = {
              id: crypto.randomUUID(),
              type: "roadmap",
              plan,
              timestamp: Date.now(),
            };
            setMessages((prev) => (finalArray = [...prev, lead, road]));

            const withAi: Meta = {
              ...newMeta,
              history: [
                ...newMeta.history,
                { ts: Date.now(), user: question, ai: lead.content },
              ],
            };
            setMeta(withAi);

            await savePlanAsPathway({
              plan,
              title: "Learning Path",
              chatId,
              status: "ACTIVE",
            });

            await saveChatSnapshot({
              chatId,
              messages: finalArray.filter(
                (m): m is TextMessage => m.type === "user" || m.type === "ai"
              ),
              roadmap: latestPlan,
              titleFallback:
                afterUser.length <= 2 ? question.slice(0, 60) : null,
              meta: withAi as any,
            });
          }
        } else {
          const payloadMeta = newMeta;
          const metadata = buildPayloadMetadata(
            afterUser,
            null,
            payloadMeta,
            question
          );

          const result = await postJSON<any>(CHAT_POST, {
            metadata,
            prompt: question,
            query: question,
          });

          const raw =
            typeof result === "string"
              ? result
              : result?.text ?? JSON.stringify(result);
          const possiblePlan = tryExtractRoadmapFromText(raw);
          const cleaned = stripRoadmapJsonFromText(raw);

          const aiText: TextMessage = {
            id: crypto.randomUUID(),
            type: "ai",
            content: cleaned || raw,
            timestamp: Date.now(),
          };
          setMessages((prev) => (finalArray = [...prev, aiText]));

          const withAi: Meta = {
            ...payloadMeta,
            history: [
              ...payloadMeta.history,
              { ts: Date.now(), user: question, ai: aiText.content },
            ],
          };
          setMeta(withAi);

          if (possiblePlan) {
            latestPlan = possiblePlan;
            const road: RoadmapMessage = {
              id: crypto.randomUUID(),
              type: "roadmap",
              plan: possiblePlan,
              note: roadmapLeadIn(possiblePlan),
              timestamp: Date.now(),
            };
            setMessages((prev) => (finalArray = [...prev, road]));
            await savePlanAsPathway({
              plan: possiblePlan,
              title: "Learning Path",
              chatId,
              status: "ACTIVE",
            });
          }

          await saveChatSnapshot({
            chatId,
            messages: finalArray.filter(
              (m): m is TextMessage => m.type === "user" || m.type === "ai"
            ),
            roadmap: latestPlan ?? null,
            titleFallback: afterUser.length <= 2 ? question.slice(0, 60) : null,
            meta: withAi as any,
          });

          // After every normal answer, ask if they want practice
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              type: "ai",
              content:
                "Would you like me to quiz you on this? I can give you 2 MCQs + 1 short question and adapt if needed.",
              timestamp: Date.now(),
            } as TextMessage,
          ]);
        }
      }
    } catch (e: any) {
      const msg = e?.message ?? "Unknown error";
      const aiErr: TextMessage = {
        id: crypto.randomUUID(),
        type: "ai",
        content: `Could not reach server:\n\n${msg}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiErr]);

      const withErr: Meta = {
        ...meta,
        history: [
          ...meta.history,
          { ts: Date.now(), user: question, ai: aiErr.content },
        ],
      };
      setMeta(withErr);

      await saveChatSnapshot({
        chatId,
        messages: [...messages, aiErr].filter(
          (m): m is TextMessage => m.type === "user" || m.type === "ai"
        ),
        meta: withErr as any,
      });
    } finally {
      setIsTyping(false);
    }
  }

  function handleSubtopicClick(topicName: string, subtopicName: string) {
    setSelectedLearningTopic({ topicName, subtopicName });
    // if the user navigates manually, clear any previous Gemini seed
    setPracticeSeed(null);
  }
  function closeLearningContent() {
    setSelectedLearningTopic(null);
    setPracticeSeed(null);
  }

  const isLearningMode = selectedLearningTopic !== null;

  return (
    <div className="min-h-screen bg-[#0b0b0c] text-neutral-100 flex flex-col relative">
      {/* Soft background accents */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[20%] top-10 h-72 w-72 rounded-full blur-3xl opacity-20 bg-amber-500" />
        <div className="absolute right-[18%] bottom-10 h-72 w-72 rounded-full blur-3xl opacity-10 bg-fuchsia-600" />
        <div className="absolute inset-0 opacity-[0.04] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:18px_18px]" />
      </div>

      <Header />

      {/* BELOW <Header /> */}
      <div
        className={
          `h-[calc(100vh-56px)] grid ` +
          (isLearningMode ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1") +
          " gap-0 bg-[#0b0b0c] overflow-hidden transition-all duration-200"
        }
      >
        {/* Left: Chat */}
        <div className="col-span-1 flex flex-col overflow-hidden">
          <main
            className={
              "flex-1 overflow-y-auto overscroll-contain px-4 py-6 scroll-smooth " +
              (isLearningMode ? "" : "mx-auto w-full max-w-3xl lg:max-w-4xl")
            }
          >
            {/* Empty-state hero */}
            {messages.length <= 1 && !isLearningMode && (
              <div className="mb-6">
                <div className="rounded-xl border border-neutral-900 bg-neutral-950/60 p-6 md:p-7 space-y-2 text-center">
                  <div className="inline-flex items-center gap-2 rounded-full border border-neutral-900 bg-neutral-950 px-3 py-1 text-[11px] text-neutral-400">
                    <Sparkles size={14} /> Minimal, fast, focused
                  </div>
                  <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                    Start learning today
                  </h1>
                  <p className="text-sm text-neutral-400">
                    Ask for a roadmap or upload a PDF for tailored practice.
                  </p>
                </div>
              </div>
            )}

            {/* Chat stream */}
            <div
              className={
                isLearningMode ? "" : "mx-auto w-full max-w-3xl lg:max-w-4xl"
              }
            >
              <ChatMessages
                messages={messages}
                isTyping={isTyping}
                onSubtopicClick={handleSubtopicClick}
              />
            </div>
          </main>

          {/* Composer */}
          <div
            className={
              isLearningMode ? "" : "mx-auto w-full max-w-3xl lg:max-w-4xl"
            }
          >
            <ChatInput
              currentMessage={currentMessage}
              setCurrentMessage={setCurrentMessage}
              onSend={handleSend}
              onPickPdf={(file) =>
                setAttachments((prev) => {
                  const exists = prev.some(
                    (f) => f.name === file.name && f.size === file.size
                  );
                  return exists ? prev : [...prev, file];
                })
              }
              attachments={attachments}
              onRemoveAttachment={(index) =>
                setAttachments((prev) => prev.filter((_, i) => i !== index))
              }
              disabled={
                !chatId || (!currentMessage.trim() && attachments.length === 0)
              }
              showPracticeToggle={!!selectedLearningTopic}
              practiceOpen={!!selectedLearningTopic}
              onTogglePractice={() =>
                selectedLearningTopic ? closeLearningContent() : null
              }
              useWebSearch={useWebSearch}
              setUseWebSearch={setUseWebSearch}
            />
          </div>
        </div>

        {/* Right: Practice Panel (independent scroll) */}
        {isLearningMode && selectedLearningTopic && (
          <aside className="hidden lg:flex flex-col overflow-hidden border-l border-neutral-900/70 bg-[#0b0b0c]">
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-neutral-900/70 bg-[#0b0b0c]">
              <h3 className="font-semibold text-neutral-200 flex items-center gap-2">
                <BookOpen size={16} className="text-neutral-400" />
                {selectedLearningTopic.subtopicName}
              </h3>
              <button
                onClick={closeLearningContent}
                className="text-neutral-500 hover:text-neutral-300 text-sm px-2 py-1 rounded hover:bg-neutral-900"
              >
                ✕ Close
              </button>
            </div>

            {/* Make this the scroller */}
            <div className="grow overflow-y-auto overscroll-contain p-4 space-y-4 scroll-smooth">
              <LearningContent
                query={selectedLearningTopic.subtopicName}
                contextString={buildContextString({
                  chatId,
                  messages,
                  meta,
                  selectedTopic: selectedLearningTopic,
                  lastRoadmap: null,
                })}
              />

              <PracticePanel
                chatId={chatId!}
                topic={selectedLearningTopic.topicName}
                subtopic={selectedLearningTopic.subtopicName}
                contextString={buildContextString({
                  chatId,
                  messages,
                  meta,
                  selectedTopic: selectedLearningTopic,
                  lastRoadmap: null,
                })}
                seed={practiceSeed /* NEW: seed when coming from Gemini */}
                onAppendMessage={(m) =>
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: crypto.randomUUID(),
                      type: "ai",
                      content: m.content,
                      timestamp: Date.now(),
                    },
                  ])
                }
                onAppendPerfEvent={async (ev) => {
                  setMeta((prev) => ({
                    ...prev,
                    performance: [
                      ...prev.performance,
                      {
                        ts: Date.now(),
                        kind: ev.kind,
                        question: ev.question,
                        accuracy: ev.accuracy,
                      },
                    ],
                  }));
                  if (chatId) {
                    await appendPerformanceEvent({
                      chatId,
                      event: {
                        ts: Date.now(),
                        kind: ev.kind,
                        question: ev.question,
                        accuracy: ev.accuracy,
                        details: ev.details,
                      },
                    });
                  }
                }}
              />

              <YoutubeRecs topic={selectedLearningTopic.subtopicName} />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
