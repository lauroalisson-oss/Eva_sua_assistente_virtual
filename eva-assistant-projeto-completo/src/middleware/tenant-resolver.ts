import { prisma } from '../config/database';

interface TenantInfo {
  id: string;
  name: string;
  phone: string;
  plan: string;
  isActive: boolean;
  timezone: string;
  planExpiresAt: Date | null;
  settings: Record<string, unknown>;
}

/**
 * Resolve um tenant pelo numero de telefone.
 * Se nao existir, cria automaticamente com plano BASIC (auto-provisioning).
 */
export async function resolveTenant(phone: string, senderName?: string): Promise<TenantInfo | null> {
  // Buscar tenant existente
  let tenant = await prisma.tenant.findUnique({
    where: { phone },
  });

  if (tenant) {
    // Verificar se esta ativo
    if (!tenant.isActive) {
      return null;
    }

    // Verificar se plano expirou
    if (tenant.planExpiresAt && tenant.planExpiresAt < new Date()) {
      // Downgrade para BASIC ao expirar
      tenant = await prisma.tenant.update({
        where: { id: tenant.id },
        data: { plan: 'BASIC', planExpiresAt: null },
      });
    }

    return {
      id: tenant.id,
      name: tenant.name,
      phone: tenant.phone,
      plan: tenant.plan,
      isActive: tenant.isActive,
      timezone: tenant.timezone,
      planExpiresAt: tenant.planExpiresAt,
      settings: tenant.settings as Record<string, unknown>,
    };
  }

  // Auto-provisioning: criar novo tenant com plano BASIC
  const newTenant = await prisma.tenant.create({
    data: {
      name: senderName || 'Novo Usuário',
      phone,
      plan: 'BASIC',
      isActive: true,
    },
  });

  console.log(`🆕 Novo tenant criado: ${newTenant.name} (${phone})`);

  return {
    id: newTenant.id,
    name: newTenant.name,
    phone: newTenant.phone,
    plan: newTenant.plan,
    isActive: newTenant.isActive,
    timezone: newTenant.timezone,
    planExpiresAt: newTenant.planExpiresAt,
    settings: newTenant.settings as Record<string, unknown>,
  };
}

/**
 * Limites por plano.
 */
export const PLAN_LIMITS = {
  BASIC: {
    messagesPerDay: 50,
    eventsMax: 20,
    transactionsPerMonth: 100,
    notesMax: 30,
    reportsEnabled: false,
    audioEnabled: true,
    audioMaxSeconds: 60,
  },
  PROFESSIONAL: {
    messagesPerDay: 500,
    eventsMax: 200,
    transactionsPerMonth: 1000,
    notesMax: 200,
    reportsEnabled: true,
    audioEnabled: true,
    audioMaxSeconds: 300,
  },
  ENTERPRISE: {
    messagesPerDay: Infinity,
    eventsMax: Infinity,
    transactionsPerMonth: Infinity,
    notesMax: Infinity,
    reportsEnabled: true,
    audioEnabled: true,
    audioMaxSeconds: 600,
  },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;

/**
 * Retorna os limites do plano de um tenant.
 */
export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[plan as PlanType] || PLAN_LIMITS.BASIC;
}
