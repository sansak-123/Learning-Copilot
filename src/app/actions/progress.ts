"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

type PerfEvent = {
  ts: number;
  kind: "mcq" | "text";
  question: string;
  accuracy: number; // 0..1
  details?: {
    pickedIndex?: number;
    correctIndex?: number;
    rationale?: string;
  };
};

export async function appendPerformanceEvent(params: {
  chatId: string;
  event: PerfEvent;
}) {
  const { chatId, event } = params;

  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (!chat) throw new Error("Chat not found");

  const meta = (chat.meta as any) ?? { history: [], performance: [] };
  const perf = Array.isArray(meta.performance) ? meta.performance : [];
  perf.push(event);
  meta.performance = perf;

  await prisma.chat.update({
    where: { id: chatId },
    data: { meta },
  });

  // Optional: revalidate the chat page if you use any SSR segments
  revalidatePath(`/chat/${chatId}`);
  return { ok: true };
}
