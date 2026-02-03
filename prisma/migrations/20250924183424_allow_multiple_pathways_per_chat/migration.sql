-- DropIndex
DROP INDEX "public"."Pathway_chatId_key";

-- CreateIndex
CREATE INDEX "Pathway_chatId_idx" ON "public"."Pathway"("chatId");
