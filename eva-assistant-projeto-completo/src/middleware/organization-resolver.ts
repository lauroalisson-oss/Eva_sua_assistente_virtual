import { prisma } from '../config/database';

// ============================================
// TIPOS
// ============================================

export interface OrganizationInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  isActive: boolean;
  systemPrompt: string | null;
  welcomeMessage: string | null;
  businessHours: Record<string, string> | null;
  settings: Record<string, unknown>;
}

export interface InstanceInfo {
  id: string;
  orgId: string;
  instanceName: string;
  phone: string;
  displayName: string | null;
  status: string;
}

export interface ResolvedContext {
  organization: OrganizationInfo;
  instance: InstanceInfo;
  tenantId: string;         // ID do tenant no banco (para queries RLS)
  tenantPlan: string;       // Plano do tenant individual
}

// ============================================
// LIMITES POR PLANO ORGANIZACIONAL
// ============================================

export const ORG_PLAN_LIMITS = {
  STARTER: {
    maxInstances: 1,
    messagesPerMonth: 1000,
    conversationMessagesPerMonth: 500,
    knowledgeDocsMax: 10,
    membersMax: 2,
    reportsEnabled: false,
    audioEnabled: false,
    humanTakeoverEnabled: false,
  },
  BUSINESS: {
    maxInstances: 3,
    messagesPerMonth: 10000,
    conversationMessagesPerMonth: 5000,
    knowledgeDocsMax: 100,
    membersMax: 10,
    reportsEnabled: true,
    audioEnabled: true,
    humanTakeoverEnabled: true,
  },
  ENTERPRISE: {
    maxInstances: Infinity,
    messagesPerMonth: Infinity,
    conversationMessagesPerMonth: Infinity,
    knowledgeDocsMax: Infinity,
    membersMax: Infinity,
    reportsEnabled: true,
    audioEnabled: true,
    humanTakeoverEnabled: true,
  },
} as const;

export type OrgPlanType = keyof typeof ORG_PLAN_LIMITS;

export function getOrgPlanLimits(plan: string) {
  return ORG_PLAN_LIMITS[plan as OrgPlanType] || ORG_PLAN_LIMITS.STARTER;
}

// ============================================
// CACHE EM MEMÓRIA (evitar queries repetitivas)
// ============================================

interface CachedInstance {
  instance: InstanceInfo;
  organization: OrganizationInfo;
  cachedAt: number;
}

const instanceCache = new Map<string, CachedInstance>();
const CACHE_TTL_MS = 60_000; // 1 minuto

function getCachedInstance(instanceName: string): CachedInstance | null {
  const cached = instanceCache.get(instanceName);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached;
  }
  instanceCache.delete(instanceName);
  return null;
}

function setCachedInstance(instanceName: string, data: CachedInstance): void {
  instanceCache.set(instanceName, data);
  // Limpar cache se ficar muito grande
  if (instanceCache.size > 500) {
    const oldest = [...instanceCache.entries()]
      .sort((a, b) => a[1].cachedAt - b[1].cachedAt)
      .slice(0, 250);
    oldest.forEach(([key]) => instanceCache.delete(key));
  }
}

// ============================================
// RESOLVER PRINCIPAL
// ============================================

/**
 * Resolve uma organização + instância pelo nome da instância (vindo do webhook).
 * Se a instância não estiver cadastrada no sistema multi-empresa,
 * retorna null e o fluxo legado (tenant resolver) é usado.
 */
export async function resolveOrganization(
  instanceName: string
): Promise<{ organization: OrganizationInfo; instance: InstanceInfo } | null> {
  // 1. Verificar cache
  const cached = getCachedInstance(instanceName);
  if (cached) {
    return { organization: cached.organization, instance: cached.instance };
  }

  // 2. Buscar instância no banco com organização
  const instanceRecord = await prisma.instance.findUnique({
    where: { instanceName },
    include: { org: true },
  });

  if (!instanceRecord) {
    return null; // Instância não cadastrada — usar fluxo legado
  }

  if (!instanceRecord.org.isActive) {
    console.warn(`⚠️ Organização ${instanceRecord.org.name} está inativa`);
    return null;
  }

  // 3. Verificar se plano não expirou
  if (instanceRecord.org.planExpiresAt && instanceRecord.org.planExpiresAt < new Date()) {
    // Downgrade para STARTER
    await prisma.organization.update({
      where: { id: instanceRecord.org.id },
      data: { plan: 'STARTER', planExpiresAt: null },
    });
    instanceRecord.org.plan = 'STARTER';
    console.log(`📉 Organização ${instanceRecord.org.name} — plano expirado, downgrade para STARTER`);
  }

  const organization: OrganizationInfo = {
    id: instanceRecord.org.id,
    name: instanceRecord.org.name,
    slug: instanceRecord.org.slug,
    plan: instanceRecord.org.plan,
    isActive: instanceRecord.org.isActive,
    systemPrompt: instanceRecord.org.systemPrompt,
    welcomeMessage: instanceRecord.org.welcomeMessage,
    businessHours: instanceRecord.org.businessHours as Record<string, string> | null,
    settings: instanceRecord.org.settings as Record<string, unknown>,
  };

  const instance: InstanceInfo = {
    id: instanceRecord.id,
    orgId: instanceRecord.orgId,
    instanceName: instanceRecord.instanceName,
    phone: instanceRecord.phone,
    displayName: instanceRecord.displayName,
    status: instanceRecord.status,
  };

  // 4. Cachear resultado
  setCachedInstance(instanceName, {
    instance,
    organization,
    cachedAt: Date.now(),
  });

  return { organization, instance };
}

/**
 * Resolve o contexto completo: organização + instância + tenant.
 * Cria tenant automaticamente se não existir (auto-provisioning multi-empresa).
 */
export async function resolveFullContext(
  instanceName: string,
  customerPhone: string,
  senderName?: string
): Promise<ResolvedContext | null> {
  const orgResult = await resolveOrganization(instanceName);

  if (!orgResult) {
    return null; // Usar fluxo legado
  }

  const { organization, instance } = orgResult;

  // Buscar ou criar tenant vinculado a esta instância
  let tenant = await prisma.tenant.findUnique({
    where: { phone: customerPhone },
  });

  if (!tenant) {
    // Auto-provisioning: criar tenant vinculado à instância
    tenant = await prisma.tenant.create({
      data: {
        name: senderName || 'Novo Cliente',
        phone: customerPhone,
        plan: 'BASIC',
        isActive: true,
        instanceId: instance.id,
      },
    });
    console.log(`🆕 Novo cliente: ${tenant.name} (${customerPhone}) → ${organization.name}`);
  } else if (!tenant.instanceId) {
    // Vincular tenant existente à instância
    tenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: { instanceId: instance.id },
    });
  }

  if (!tenant.isActive) {
    return null;
  }

  return {
    organization,
    instance,
    tenantId: tenant.id,
    tenantPlan: tenant.plan,
  };
}

/**
 * Verifica se a organização ainda tem cota de mensagens disponível.
 */
export async function checkOrgMessageQuota(
  orgId: string,
  plan: string
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const limits = getOrgPlanLimits(plan);

  if (limits.messagesPerMonth === Infinity) {
    return { allowed: true, used: 0, limit: Infinity };
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // Contar mensagens de todos os tenants vinculados a instâncias desta org
  const instances = await prisma.instance.findMany({
    where: { orgId },
    select: { id: true },
  });

  const instanceIds = instances.map((i) => i.id);

  const used = await prisma.messageLog.count({
    where: {
      createdAt: { gte: startOfMonth },
      // Buscar tenants vinculados a estas instâncias
    },
  });

  // Contagem alternativa por tenants vinculados
  const tenantIds = await prisma.tenant.findMany({
    where: { instanceId: { in: instanceIds } },
    select: { id: true },
  });

  const messageCount = await prisma.messageLog.count({
    where: {
      tenantId: { in: tenantIds.map((t) => t.id) },
      createdAt: { gte: startOfMonth },
    },
  });

  return {
    allowed: messageCount < limits.messagesPerMonth,
    used: messageCount,
    limit: limits.messagesPerMonth,
  };
}

/**
 * Limpa o cache de uma instância (útil após atualizações).
 */
export function invalidateInstanceCache(instanceName: string): void {
  instanceCache.delete(instanceName);
}

/**
 * Limpa todo o cache (útil em testes ou reconfiguração).
 */
export function clearInstanceCache(): void {
  instanceCache.clear();
}
