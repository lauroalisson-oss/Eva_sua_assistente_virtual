-- CreateEnum: ConversationStatus
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CLOSED', 'TRANSFERRED');

-- CreateEnum: MessageRole
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable: conversation_configs
CREATE TABLE "conversation_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "agentName" TEXT NOT NULL DEFAULT 'EVA',
    "businessName" TEXT,
    "businessSegment" TEXT,
    "personality" TEXT NOT NULL DEFAULT 'profissional_amigavel',
    "systemPrompt" TEXT,
    "greeting" TEXT,
    "salesMode" BOOLEAN NOT NULL DEFAULT false,
    "maxHistoryMessages" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: knowledge_entries
CREATE TABLE "knowledge_entries" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "price" DECIMAL(12,2),
    "tags" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable: conversations
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerName" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "sentiment" TEXT,
    "summary" TEXT,
    "leadScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: conversation_messages
CREATE TABLE "conversation_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER,
    "processingTimeMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversation_configs_tenantId_key" ON "conversation_configs"("tenantId");

-- CreateIndex
CREATE INDEX "knowledge_entries_configId_category_idx" ON "knowledge_entries"("configId", "category");
CREATE INDEX "knowledge_entries_configId_isActive_idx" ON "knowledge_entries"("configId", "isActive");

-- CreateIndex
CREATE INDEX "conversations_configId_customerPhone_idx" ON "conversations"("configId", "customerPhone");
CREATE INDEX "conversations_configId_status_idx" ON "conversations"("configId", "status");

-- CreateIndex
CREATE INDEX "conversation_messages_conversationId_createdAt_idx" ON "conversation_messages"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_configId_fkey" FOREIGN KEY ("configId") REFERENCES "conversation_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_configId_fkey" FOREIGN KEY ("configId") REFERENCES "conversation_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
