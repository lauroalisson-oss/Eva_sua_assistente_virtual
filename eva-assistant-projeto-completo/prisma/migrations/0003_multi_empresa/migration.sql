-- ============================================
-- Migration: 0003_multi_empresa
-- Adiciona suporte a múltiplas empresas (organizações)
-- ============================================

-- Enums
CREATE TYPE "org_plan" AS ENUM ('STARTER', 'BUSINESS', 'ENTERPRISE');
CREATE TYPE "instance_status" AS ENUM ('CONNECTED', 'DISCONNECTED', 'CONNECTING', 'BANNED');
CREATE TYPE "member_role" AS ENUM ('OWNER', 'ADMIN', 'OPERATOR', 'VIEWER');

-- Organizations
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "plan" "org_plan" NOT NULL DEFAULT 'STARTER',
    "planExpiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "systemPrompt" TEXT,
    "welcomeMessage" TEXT,
    "businessHours" JSONB,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE UNIQUE INDEX "organizations_email_key" ON "organizations"("email");

-- Instances (números WhatsApp conectados)
CREATE TABLE "instances" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "displayName" TEXT,
    "status" "instance_status" NOT NULL DEFAULT 'DISCONNECTED',
    "config" JSONB NOT NULL DEFAULT '{}',
    "webhookUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "instances_instanceName_key" ON "instances"("instanceName");
CREATE UNIQUE INDEX "instances_phone_key" ON "instances"("phone");
CREATE INDEX "instances_orgId_idx" ON "instances"("orgId");

-- Organization Members (usuários do painel)
CREATE TABLE "org_members" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "member_role" NOT NULL DEFAULT 'ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_members_orgId_email_key" ON "org_members"("orgId", "email");
CREATE INDEX "org_members_email_idx" ON "org_members"("email");

-- Knowledge Docs (base de conhecimento da organização)
CREATE TABLE "knowledge_docs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'geral',
    "tags" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_docs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "knowledge_docs_orgId_category_idx" ON "knowledge_docs"("orgId", "category");
CREATE INDEX "knowledge_docs_orgId_isActive_idx" ON "knowledge_docs"("orgId", "isActive");

-- Adicionar coluna instanceId na tabela tenants (vinculação opcional)
ALTER TABLE "tenants" ADD COLUMN "instanceId" TEXT;
CREATE INDEX "tenants_instanceId_idx" ON "tenants"("instanceId");

-- Foreign Keys
ALTER TABLE "instances" ADD CONSTRAINT "instances_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_docs" ADD CONSTRAINT "knowledge_docs_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;
