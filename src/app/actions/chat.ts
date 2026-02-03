// src/app/actions/chat.ts
"use server";

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

/* ============================================================
   Types
============================================================ */
export type ChatMessage = {
  id: string;
  type: "user" | "ai";
  content: string;
  timestamp: number;
};

type PerfEntry = {
  ts: number;
  kind: "mcq" | "text";
  question: string;
  accuracy: number; // 0..1
};

type HistoryEntry = {
  ts: number;
  user: string;
  ai?: string;
};

type ChatMeta = {
  messages?: ChatMessage[];
  roadmap?: unknown;
  ui?: Record<string, unknown>;
  events?: Array<{ type: string; ts: number; data?: any }>;
  history?: HistoryEntry[];
  performance?: PerfEntry[];
};

type RoadmapSubtopic = { type: "SUBTOPIC"; name: string };
type RoadmapTopic = { type: "TOPIC"; name: string; subtopics: RoadmapSubtopic[] };
type Roadmap = RoadmapTopic[];

/* ============================================================
   Internal helpers
============================================================ */

/**
 * Ensure we have a stable "guest" user row and return its id.
 */
async function ensureGuestUserId(): Promise<string> {
  const g = await prisma.user.upsert({
    where: { email: "guest@example.com" },
    update: {},
    create: { email: "guest@example.com", name: "Guest" },
    select: { id: true },
  });
  return g.id;
}

/**
 * Resolve a DB user id from NextAuth session.
 * - Prefer email: upsert by email (stable).
 * - Fallback to name: find latest by name or create a name-only user.
 * - Final fallback: persistent "Guest".
 */
async function resolveUserIdFromSession(): Promise<string> {
  const session = await getServerSession();
  const email = session?.user?.email?.trim() || null;
  const name = session?.user?.name?.trim() || null;

  // 1) Prefer email: upsert for stability
  if (email) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: name ?? email.split("@")[0] },
      select: { id: true },
    });
    return user.id;
  }

  // 2) Fallback to name (not unique): find latest or create
  if (name) {
    const existing = await prisma.user.findFirst({
      where: { name },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing.id;

    const created = await prisma.user.create({
      data: { name },
      select: { id: true },
    });
    return created.id;
  }

  // 3) Guest
  return ensureGuestUserId();
}

/**
 * Current user id (always resolves; no throwing).
 */
async function whoami(): Promise<string> {
  return resolveUserIdFromSession();
}

/**
 * Ownership guard.
 */
async function assertOwnChat(chatId: string, userId: string) {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { userId: true },
  });
  if (!chat || chat.userId !== userId) {
    throw new Error("Chat not found or not owned by user.");
  }
}

/**
 * Non-destructive meta merge. Concats arrays where appropriate.
 */
function mergeMeta(current: ChatMeta | null | undefined, incoming: Partial<ChatMeta>): ChatMeta {
  const a = current ?? {};
  const b = incoming ?? {};

  return {
    // primitives / objects
    ui: { ...(a.ui ?? {}), ...(b.ui ?? {}) },
    roadmap: b.roadmap !== undefined ? b.roadmap : a.roadmap,
    // arrays (concat)
    messages: [...(a.messages ?? []), ...(b.messages ?? [])],
    events: [...(a.events ?? []), ...(b.events ?? [])],
    history: [...(a.history ?? []), ...(b.history ?? [])],
    performance: [...(a.performance ?? []), ...(b.performance ?? [])],
  };
}

/* ============================================================
   Create / List
============================================================ */
export async function createChat(params: {
  title?: string | null;
  userSubjectId?: string | null;
  initialMessages?: ChatMessage[];
  initialRoadmap?: unknown;
  initialMeta?: Partial<ChatMeta>;
}) {
  const userId = await whoami();

  const baseMeta: ChatMeta = {
    messages: params.initialMessages ?? [],
    roadmap: params.initialRoadmap ?? null,
    events: [{ type: "createChat", ts: Date.now() }],
    history: [],
    performance: [],
    ...(params.initialMeta ?? {}),
  };

  const chat = await prisma.chat.create({
    data: {
      userId,
      title: params.title ?? null,
      userSubjectId: params.userSubjectId ?? null,
      meta: baseMeta as any,
    },
    select: { id: true, title: true },
  });

  return { ok: true as const, chatId: chat.id };
}

export async function listChats() {
  const userId = await whoami();
  const items = await prisma.chat.findMany({
    where: { userId, deletedAt: null },
    select: { id: true, title: true, updatedAt: true, startedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  return { ok: true as const, items };
}

/* ============================================================
   Load / Save snapshots & turns
============================================================ */

/**
 * Overwrite/merge a compact transcript snapshot in Chat.meta.
 * - Replaces messages/roadmap with the provided ones.
 * - Merges incoming meta.history/performance/ui/events with existing (non-destructive).
 */
export async function saveChatSnapshot(params: {
  chatId: string;
  messages: Array<{ id: string; type: "user" | "ai"; content: string; timestamp: number }>;
  roadmap?: unknown;
  titleFallback?: string | null;
  meta?: Partial<ChatMeta>; // <--- NEW: allow sending history/performance/ui/events patches
}) {
  const userId = await whoami();

  const chat = await prisma.chat.findUnique({
    where: { id: params.chatId },
    select: { userId: true, title: true, meta: true },
  });
  if (!chat || chat.userId !== userId) {
    return { ok: false as const, error: "Chat not found or not owned by user." };
  }

  const existingMeta = (chat.meta ?? {}) as ChatMeta;

  // Build the next meta:
  // - Force-set messages & roadmap to provided snapshot
  // - Merge other fields from incoming meta (history/performance/ui/events)
  const nextMeta = mergeMeta(
    { ...existingMeta, messages: [], roadmap: null }, // start from existing but clear arrays we will overwrite
    {
      messages: params.messages,
      roadmap: params.roadmap ?? null,
      ...(params.meta ?? {}),
    }
  );

  const updateData: any = { meta: nextMeta };
  if (params.titleFallback && !chat.title) {
    updateData.title = params.titleFallback;
  }

  await prisma.chat.update({
    where: { id: params.chatId },
    data: updateData,
  });

  return { ok: true as const };
}

export async function getChatSnapshot(chatId: string) {
  const userId = await whoami();
  await assertOwnChat(chatId, userId);

  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { id: true, title: true, meta: true, updatedAt: true, startedAt: true },
  });

  const meta = (chat?.meta ?? {}) as ChatMeta;

  return {
    ok: true as const,
    chat: {
      id: chat!.id,
      title: chat!.title ?? null,
      messages: meta.messages ?? [],
      roadmap: meta.roadmap ?? null,
      history: meta.history ?? [],
      performance: meta.performance ?? [],
      updatedAt: chat!.updatedAt,
      startedAt: chat!.startedAt,
    },
  };
}

export async function appendTurn(params: {
  chatId: string;
  userMsg: ChatMessage;
  aiMsg: ChatMessage;
  roadmap?: unknown | null;
  uiPatch?: Record<string, unknown>;
  metaPatch?: Partial<Pick<ChatMeta, "history" | "performance" | "events">>; // NEW optional patches
}) {
  const userId = await whoami();
  await assertOwnChat(params.chatId, userId);

  await prisma.$transaction(async (tx) => {
    const current = await tx.chat.findUnique({
      where: { id: params.chatId },
      select: { meta: true, title: true },
    });

    const meta = (current?.meta ?? {}) as ChatMeta;
    const messages = [...(meta.messages ?? []), params.userMsg, params.aiMsg];

    const baseNext: ChatMeta = {
      ...meta,
      messages,
      ...(params.roadmap !== undefined ? { roadmap: params.roadmap } : {}),
      ...(params.uiPatch ? { ui: { ...(meta.ui ?? {}), ...params.uiPatch } } : {}),
      events: [
        ...(meta.events ?? []),
        { type: "appendTurn", ts: Date.now(), data: { len: params.userMsg.content.length } },
      ],
    };

    const nextMeta = mergeMeta(baseNext, params.metaPatch ?? {});

    const maybeTitle =
      !current?.title && messages.length
        ? messages.find((m) => m.type === "user")?.content.slice(0, 60) ?? null
        : undefined;

    await tx.chat.update({
      where: { id: params.chatId },
      data: { ...(maybeTitle !== undefined ? { title: maybeTitle } : {}), meta: nextMeta as any },
    });
  });

  return { ok: true as const };
}

/**
 * Append one (or many) performance entries atomically.
 * Call this from grading flows if you want server-side canonical tracking,
 * in addition to the client meta you already push.
 */
export async function recordPerformance(params: {
  chatId: string;
  entries: PerfEntry[]; // e.g. [{ ts: Date.now(), kind: "mcq", question, accuracy }]
}) {
  const userId = await whoami();
  await assertOwnChat(params.chatId, userId);

  const chat = await prisma.chat.findUnique({
    where: { id: params.chatId },
    select: { meta: true },
  });

  const meta = (chat?.meta ?? {}) as ChatMeta;
  const perf = [...(meta.performance ?? []), ...params.entries];

  await prisma.chat.update({
    where: { id: params.chatId },
    data: { meta: { ...(meta as any), performance: perf } as any },
  });

  return { ok: true as const, count: params.entries.length };
}

/* ============================================================
   Misc utilities
============================================================ */
export async function renameChat(params: { chatId: string; title: string }) {
  const userId = await whoami();
  await assertOwnChat(params.chatId, userId);
  await prisma.chat.update({ where: { id: params.chatId }, data: { title: params.title } });
  return { ok: true as const };
}

export async function deleteChat(params: { chatId: string }) {
  const userId = await whoami();
  await assertOwnChat(params.chatId, userId);
  await prisma.chat.update({ where: { id: params.chatId }, data: { deletedAt: new Date() } });
  return { ok: true as const };
}

/* ============================================================
   Pathway integration
============================================================ */
export async function savePlanAsPathway(params: {
  chatId: string;
  plan: Roadmap;
  title?: string | null;
  status?: "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
}) {
  const userId = await whoami();

  // Ownership check
  const chat = await prisma.chat.findUnique({ where: { id: params.chatId }, select: { userId: true } });
  if (!chat || chat.userId !== userId) {
    return { ok: false as const, error: "Chat not found or not owned by user." };
  }

  // Update or create
  const existing = await prisma.pathway.findFirst({
    where: { chatId: params.chatId },
    select: { id: true },
  });

  if (existing) {
    await prisma.pathway.update({
      where: { id: existing.id },
      data: {
        title: params.title ?? undefined,
        status: (params.status as any) ?? undefined,
        planSpec: params.plan as any,
      },
    });
    return { ok: true as const, pathwayId: existing.id, created: false as const };
  } else {
    const created = await prisma.pathway.create({
      data: {
        userId,
        chatId: params.chatId,
        title: params.title ?? null,
        status: (params.status as any) ?? "DRAFT",
        planSpec: params.plan as any,
      },
      select: { id: true },
    });
    return { ok: true as const, pathwayId: created.id, created: true as const };
  }
}
