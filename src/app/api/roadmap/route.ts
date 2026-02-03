// app/api/roadmap/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { PrismaClient, NodeType, ContentType } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    // If you use next-auth, replace this with your session logic
    const session = await getServerSession();
    const body = await req.json();

    const userId =
      (session?.user as any)?.id ??
      body.userId ?? // fallback: allow client to pass
      null;

    if (!userId) {
      return NextResponse.json({ error: "No userId in session/body" }, { status: 400 });
    }

    const roadmap: Array<{
      type: "TOPIC";
      name: string;
      subtopics: Array<{ type: "SUBTOPIC"; name: string }>;
    }> = body.roadmap;

    if (!Array.isArray(roadmap) || roadmap.length === 0) {
      return NextResponse.json({ error: "Invalid roadmap" }, { status: 400 });
    }

    const subjectKey = body.userSubject?.key ?? "unnamed-subject";
    const subjectTitle = body.userSubject?.title ?? "Untitled Subject";
    const chatTitle = body.chatTitle ?? subjectTitle;

    // Ensure per-user subject
    const userSubject = await prisma.userSubject.upsert({
      where: { userId_key: { userId, key: subjectKey } },
      update: { title: subjectTitle },
      create: {
        userId,
        key: subjectKey,
        title: subjectTitle,
      },
    });

    // Create chat
    const chat = await prisma.chat.create({
      data: {
        userId,
        title: chatTitle,
        userSubjectId: userSubject.id,
      },
    });

    // Create pathway linked to chat
    const pathway = await prisma.pathway.create({
      data: {
        userId,
        chatId: chat.id,
        userSubjectId: userSubject.id,
        title: `${subjectTitle} Pathway`,
        status: "ACTIVE",
        planSpec: roadmap, // store raw JSON for provenance
      },
    });

    // Build nodes as linked-list (topics chained via nextId) + children = subtopics
    let prevTopicId: string | null = null;
    let firstTopicId: string | null = null;

    for (let i = 0; i < roadmap.length; i++) {
      const topic = roadmap[i];

      // create topic node
      const topicNode = await prisma.pathNode.create({
        data: {
          pathwayId: pathway.id,
          nodeType: NodeType.TOPIC,
          title: topic.name,
          orderIndex: i,
          contents: {
            create: [
              {
                kind: ContentType.TEXT,
                label: "Topic",
                text: topic.name,
              },
            ],
          },
        },
      });

      // link previous topic -> next
      if (prevTopicId) {
        await prisma.pathNode.update({
          where: { id: prevTopicId },
          data: { nextId: topicNode.id },
        });
      }
      if (!firstTopicId) firstTopicId = topicNode.id;
      prevTopicId = topicNode.id;

      // subtopics as children (tree)
      for (let j = 0; j < (topic.subtopics ?? []).length; j++) {
        const s = topic.subtopics[j];
        await prisma.pathNode.create({
          data: {
            pathwayId: pathway.id,
            parentId: topicNode.id,
            nodeType: NodeType.SUBTOPIC,
            title: s.name,
            orderIndex: j,
            contents: {
              create: [
                {
                  kind: ContentType.TEXT,
                  label: "Subtopic",
                  text: s.name,
                },
              ],
            },
          },
        });
      }
    }

    // set root pointer to first topic
    if (firstTopicId) {
      await prisma.pathway.update({
        where: { id: pathway.id },
        data: { rootNodeId: firstTopicId },
      });
    }

    // update chat quick-resume pointer to first node
    if (firstTopicId) {
      await prisma.chat.update({
        where: { id: chat.id },
        data: { lastNodeId: firstTopicId },
      });
    }

    return NextResponse.json({ ok: true, chatId: chat.id, pathwayId: pathway.id });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
