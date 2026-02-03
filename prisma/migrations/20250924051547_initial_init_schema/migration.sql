/*
  Warnings:

  - Added the required column `updatedAt` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."PathwayStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."NodeType" AS ENUM ('TOPIC', 'SUBTOPIC', 'EXERCISE', 'CHECKPOINT', 'RESOURCE');

-- CreateEnum
CREATE TYPE "public"."ContentType" AS ENUM ('GRAPH', 'PICTOGRAPH', 'QA', 'TEXT');

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "public"."UserSubject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "UserSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Chat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "userSubjectId" TEXT,
    "meta" JSONB,
    "lastNodeId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Pathway" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatId" TEXT,
    "userSubjectId" TEXT,
    "title" TEXT,
    "status" "public"."PathwayStatus" NOT NULL DEFAULT 'DRAFT',
    "planSpec" JSONB,
    "rootNodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Pathway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PathNode" (
    "id" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "nextId" TEXT,
    "parentId" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "nodeType" "public"."NodeType" NOT NULL DEFAULT 'TOPIC',
    "title" TEXT,
    "props" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PathNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContentItem" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "kind" "public"."ContentType" NOT NULL,
    "label" TEXT,
    "meta" JSONB,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[],
    "graph" JSONB,
    "pictouri" TEXT,
    "ragInfo" JSONB,
    "question" TEXT,
    "answer" TEXT,
    "text" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Asset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "uri" TEXT NOT NULL,
    "mime" TEXT,
    "bytes" INTEGER,
    "sha256" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContentRevision" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSubject_userId_idx" ON "public"."UserSubject"("userId");

-- CreateIndex
CREATE INDEX "UserSubject_deletedAt_idx" ON "public"."UserSubject"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserSubject_userId_key_key" ON "public"."UserSubject"("userId", "key");

-- CreateIndex
CREATE INDEX "Chat_userId_startedAt_idx" ON "public"."Chat"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "Chat_userSubjectId_idx" ON "public"."Chat"("userSubjectId");

-- CreateIndex
CREATE INDEX "Chat_deletedAt_idx" ON "public"."Chat"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Pathway_chatId_key" ON "public"."Pathway"("chatId");

-- CreateIndex
CREATE INDEX "Pathway_userId_status_idx" ON "public"."Pathway"("userId", "status");

-- CreateIndex
CREATE INDEX "Pathway_userSubjectId_idx" ON "public"."Pathway"("userSubjectId");

-- CreateIndex
CREATE INDEX "Pathway_deletedAt_idx" ON "public"."Pathway"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PathNode_nextId_key" ON "public"."PathNode"("nextId");

-- CreateIndex
CREATE INDEX "PathNode_pathwayId_parentId_orderIndex_idx" ON "public"."PathNode"("pathwayId", "parentId", "orderIndex");

-- CreateIndex
CREATE INDEX "PathNode_deletedAt_idx" ON "public"."PathNode"("deletedAt");

-- CreateIndex
CREATE INDEX "ContentItem_nodeId_kind_orderIndex_idx" ON "public"."ContentItem"("nodeId", "kind", "orderIndex");

-- CreateIndex
CREATE INDEX "ContentItem_deletedAt_idx" ON "public"."ContentItem"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_sha256_key" ON "public"."Asset"("sha256");

-- CreateIndex
CREATE INDEX "Asset_ownerId_idx" ON "public"."Asset"("ownerId");

-- CreateIndex
CREATE INDEX "Asset_deletedAt_idx" ON "public"."Asset"("deletedAt");

-- CreateIndex
CREATE INDEX "ContentRevision_contentId_createdAt_idx" ON "public"."ContentRevision"("contentId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."UserSubject" ADD CONSTRAINT "UserSubject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Chat" ADD CONSTRAINT "Chat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Chat" ADD CONSTRAINT "Chat_userSubjectId_fkey" FOREIGN KEY ("userSubjectId") REFERENCES "public"."UserSubject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Chat" ADD CONSTRAINT "Chat_lastNodeId_fkey" FOREIGN KEY ("lastNodeId") REFERENCES "public"."PathNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Pathway" ADD CONSTRAINT "Pathway_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Pathway" ADD CONSTRAINT "Pathway_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Pathway" ADD CONSTRAINT "Pathway_userSubjectId_fkey" FOREIGN KEY ("userSubjectId") REFERENCES "public"."UserSubject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Pathway" ADD CONSTRAINT "Pathway_rootNodeId_fkey" FOREIGN KEY ("rootNodeId") REFERENCES "public"."PathNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PathNode" ADD CONSTRAINT "PathNode_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "public"."Pathway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PathNode" ADD CONSTRAINT "PathNode_nextId_fkey" FOREIGN KEY ("nextId") REFERENCES "public"."PathNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PathNode" ADD CONSTRAINT "PathNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."PathNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContentItem" ADD CONSTRAINT "ContentItem_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "public"."PathNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContentItem" ADD CONSTRAINT "ContentItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContentItem" ADD CONSTRAINT "ContentItem_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Asset" ADD CONSTRAINT "Asset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContentRevision" ADD CONSTRAINT "ContentRevision_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "public"."ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContentRevision" ADD CONSTRAINT "ContentRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
