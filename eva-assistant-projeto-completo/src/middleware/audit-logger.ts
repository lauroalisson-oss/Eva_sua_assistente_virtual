import { prisma } from '../config/database';

/**
 * Audit Logger — Registra ações de criação, edição e exclusão
 * em entidades multi-tenant (Event, Transaction, Note, Budget).
 *
 * Uso:
 *   await auditLog(tenantId, 'CREATE', 'Event', eventId, { title: 'Reunião' });
 *   await auditLog(tenantId, 'UPDATE', 'Event', eventId, { title: { from: 'A', to: 'B' } });
 *   await auditLog(tenantId, 'DELETE', 'Transaction', txId);
 */

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

export interface AuditEntry {
  tenantId: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Registra uma entrada no audit log.
 * Operação assíncrona — falhas são logadas mas não propagadas
 * para não impactar o fluxo principal.
 */
export async function auditLog(
  tenantId: string,
  action: AuditAction,
  entity: string,
  entityId: string,
  changes?: Record<string, unknown>,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId,
        action,
        entity,
        entityId,
        changes: changes ?? undefined,
        metadata: metadata ?? undefined,
      },
    });
  } catch (error) {
    // Não propagar erro para não impactar fluxo principal
    console.error(`⚠️ Falha ao registrar audit log [${action} ${entity}/${entityId}]:`, error);
  }
}

/**
 * Busca o histórico de auditoria de um tenant.
 */
export async function getAuditHistory(
  tenantId: string,
  options?: {
    entity?: string;
    entityId?: string;
    action?: AuditAction;
    limit?: number;
    offset?: number;
  },
) {
  const where: Record<string, unknown> = { tenantId };

  if (options?.entity) where.entity = options.entity;
  if (options?.entityId) where.entityId = options.entityId;
  if (options?.action) where.action = options.action;

  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0,
  });
}
