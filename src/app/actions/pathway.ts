// src/app/actions/pathway.ts (only the savePlanAsPathway function shown)
"use server";

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

type PlanSubtopic = { type: "SUBTOPIC"; name: string };
type PlanTopic = { type: "TOPIC"; name: string; subtopics?: PlanSubtopic[] };
type Plan = PlanTopic[];

async function resolveUserIdFromSession(): Promise<string> {
  const session = await getServerSession();
  const email = session?.user?.email?.trim() || null;
  const name = session?.user?.name?.trim() || null;

  if (email) {
    const user = await prisma.user.upsert({
      where: { email },
      update: name ? { name } : {},
      create: { email, name: name ?? undefined },
      select: { id: true },
    });
    return user.id;
  }

  if (name) {
    const existing = await prisma.user.findFirst({
      where: { name },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing.id;
    const created = await prisma.user.create({ data: { name }, select: { id: true } });
    return created.id;
  }

  const g = await prisma.user.upsert({
    where: { email: "guest@example.com" },
    update: {},
    create: { email: "guest@example.com", name: "Guest" },
    select: { id: true },
  });
  return g.id;
}

export async function savePlanAsPathway(params: {
  plan: Plan;
  title?: string | null;
  chatId?: string | null;
  userSubjectId?: string | null;
  status?: "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED";
}) {
  const userId = await resolveUserIdFromSession();

  const plan: Plan = Array.isArray(params.plan)
    ? params.plan.filter(
        (t) => t && t.type === "TOPIC" && typeof t.name === "string" && t.name.trim()
      )
    : [];

  if (plan.length === 0) {
    return { ok: false as const, error: "Empty or invalid plan." };
  }

  if (params.chatId) {
    const chat = await prisma.chat.findUnique({
      where: { id: params.chatId },
      select: { userId: true },
    });
    if (!chat || chat.userId !== userId) {
      return { ok: false as const, error: "Chat not found or not owned by user." };
    }
  }

  const title =
    params.title?.trim() ||
    `Learning Path: ${plan[0]?.name?.slice(0, 40) || "Untitled"}`;
  const status = params.status ?? "DRAFT";

  // Data we’ll need OUTSIDE the tx to link nextId
  let pathwayId = "";
  let rootNodeId = "";
  const topicIdsInOrder: string[] = [];
  const topicIdToHasSubtopics = new Map<string, boolean>();

  // -------- INSERTS ONLY (fast) --------
  await prisma.$transaction(
    async (tx) => {
      const pathway = await tx.pathway.create({
        data: {
          userId,
          chatId: params.chatId ?? undefined,
          userSubjectId: params.userSubjectId ?? undefined,
          title,
          status,
          planSpec: plan as unknown as object,
        },
        select: { id: true },
      });
      pathwayId = pathway.id;

      const root = await tx.pathNode.create({
        data: {
          pathwayId,
          nodeType: "TOPIC",
          title,
          orderIndex: 0,
        },
        select: { id: true },
      });
      rootNodeId = root.id;

      await tx.pathway.update({
        where: { id: pathwayId },
        data: { rootNodeId },
      });

      // Create each TOPIC node
      for (let i = 0; i < plan.length; i++) {
        const topic = plan[i];
        const topicNode = await tx.pathNode.create({
          data: {
            pathwayId,
            parentId: rootNodeId,
            nodeType: "TOPIC",
            title: topic.name,
            orderIndex: i,
          },
          select: { id: true },
        });
        topicIdsInOrder.push(topicNode.id);

        const subs = Array.isArray(topic.subtopics)
          ? topic.subtopics.filter(
              (s) => s && s.type === "SUBTOPIC" && typeof s.name === "string" && s.name.trim()
            )
          : [];

        topicIdToHasSubtopics.set(topicNode.id, subs.length > 0);

        // Bulk insert SUBTOPIC nodes with orderIndex (no nextId here)
        if (subs.length > 0) {
          await tx.pathNode.createMany({
            data: subs.map((s, j) => ({
              pathwayId,
              parentId: topicNode.id,
              nodeType: "SUBTOPIC",
              title: s.name,
              orderIndex: j,
            })),
          });
        }
      }
    },
    // Increase timeout to avoid P2028 on slower I/O; tune as needed
    { maxWait: 5_000, timeout: 20_000 }
  );

  // -------- LINKS (nextId) OUTSIDE TX (parallel & quick) --------

  // 1) Link topics by nextId in order
  const topicLinkUpdates: Promise<any>[] = [];
  for (let i = 0; i < topicIdsInOrder.length - 1; i++) {
    const currentId = topicIdsInOrder[i];
    const nextId = topicIdsInOrder[i + 1];
    topicLinkUpdates.push(
      prisma.pathNode.update({ where: { id: currentId }, data: { nextId } })
    );
  }

  // 2) For each topic with subtopics, fetch them ordered by orderIndex and link by nextId
  const subtopicLinkJobs: Promise<any>[] = [];
  for (const topicId of topicIdsInOrder) {
    if (!topicIdToHasSubtopics.get(topicId)) continue;

    subtopicLinkJobs.push(
      (async () => {
        const subs = await prisma.pathNode.findMany({
          where: { pathwayId, parentId: topicId },
          select: { id: true, orderIndex: true },
          orderBy: { orderIndex: "asc" },
        });
        const updates: Promise<any>[] = [];
        for (let i = 0; i < subs.length - 1; i++) {
          updates.push(
            prisma.pathNode.update({
              where: { id: subs[i].id },
              data: { nextId: subs[i + 1].id },
            })
          );
        }
        await Promise.all(updates);
      })()
    );
  }

  // Run all link updates in parallel
  await Promise.all([Promise.all(topicLinkUpdates), Promise.all(subtopicLinkJobs)]);

  return { ok: true as const, pathwayId, rootNodeId, topicNodeIds: topicIdsInOrder };
}
