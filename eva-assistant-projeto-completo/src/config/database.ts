import { PrismaClient } from '@prisma/client';
import { env } from './env';

const basePrisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
});

// Modelos que possuem tenantId e requerem isolamento RLS
const TENANT_MODELS = ['Event', 'Transaction', 'Budget', 'Note', 'MessageLog'];

// Modelos que possuem orgId e requerem isolamento por organização
const ORG_MODELS = ['Instance', 'OrgMember', 'KnowledgeDoc'];

// Operações de leitura que devem filtrar por tenantId
const READ_OPERATIONS = ['findFirst', 'findMany', 'findUnique', 'count', 'aggregate', 'groupBy'];

// Operações de escrita que devem validar tenantId
const WRITE_OPERATIONS = ['update', 'updateMany', 'delete', 'deleteMany'];

/**
 * Prisma client com extensões:
 * 1. Log de queries lentas (>500ms)
 * 2. Row-Level Security: injeta tenantId automaticamente em queries de modelos multi-tenant
 */
export const prisma = basePrisma.$extends({
  query: {
    async $allOperations({ operation, model, args, query }) {
      const start = Date.now();
      const result = await query(args);
      const duration = Date.now() - start;

      if (duration > 500) {
        console.warn(`⚠️ Query lenta (${duration}ms): ${model}.${operation}`);
      }

      return result;
    },
  },
});

/**
 * Cria um Prisma client com escopo de tenant (Row-Level Security).
 * Todas as queries em modelos multi-tenant são automaticamente filtradas
 * pelo tenantId fornecido, impedindo acesso cruzado entre tenants.
 *
 * Uso: const scopedPrisma = createTenantScope('cuid_do_tenant');
 */
export function createTenantScope(tenantId: string) {
  return basePrisma.$extends({
    query: {
      async $allOperations({ operation, model, args, query }) {
        // Não aplicar RLS em modelos que não têm tenantId
        if (!model || !TENANT_MODELS.includes(model)) {
          return query(args);
        }

        const mutableArgs = { ...args } as Record<string, unknown>;

        // Injetar tenantId em operações de leitura
        if (READ_OPERATIONS.includes(operation)) {
          const where = (mutableArgs.where || {}) as Record<string, unknown>;
          where.tenantId = tenantId;
          mutableArgs.where = where;
        }

        // Injetar tenantId em operações de escrita (where clause)
        if (WRITE_OPERATIONS.includes(operation)) {
          const where = (mutableArgs.where || {}) as Record<string, unknown>;
          where.tenantId = tenantId;
          mutableArgs.where = where;
        }

        // Injetar tenantId em create
        if (operation === 'create') {
          const data = (mutableArgs.data || {}) as Record<string, unknown>;
          data.tenantId = tenantId;
          mutableArgs.data = data;
        }

        // Injetar tenantId em createMany
        if (operation === 'createMany') {
          const data = mutableArgs.data;
          if (Array.isArray(data)) {
            mutableArgs.data = data.map((item: Record<string, unknown>) => ({
              ...item,
              tenantId,
            }));
          }
        }

        // Log de queries lentas
        const start = Date.now();
        const result = await query(mutableArgs);
        const duration = Date.now() - start;

        if (duration > 500) {
          console.warn(`⚠️ Query lenta (${duration}ms): ${model}.${operation} [tenant:${tenantId.slice(-6)}]`);
        }

        return result;
      },
    },
  });
}

/**
 * Cria um Prisma client com escopo de organização (Row-Level Security).
 * Todas as queries em modelos multi-org são automaticamente filtradas
 * pelo orgId fornecido, impedindo acesso cruzado entre organizações.
 */
export function createOrgScope(orgId: string) {
  return basePrisma.$extends({
    query: {
      async $allOperations({ operation, model, args, query }) {
        if (!model || !ORG_MODELS.includes(model)) {
          return query(args);
        }

        const mutableArgs = { ...args } as Record<string, unknown>;

        if (READ_OPERATIONS.includes(operation)) {
          const where = (mutableArgs.where || {}) as Record<string, unknown>;
          where.orgId = orgId;
          mutableArgs.where = where;
        }

        if (WRITE_OPERATIONS.includes(operation)) {
          const where = (mutableArgs.where || {}) as Record<string, unknown>;
          where.orgId = orgId;
          mutableArgs.where = where;
        }

        if (operation === 'create') {
          const data = (mutableArgs.data || {}) as Record<string, unknown>;
          data.orgId = orgId;
          mutableArgs.data = data;
        }

        if (operation === 'createMany') {
          const data = mutableArgs.data;
          if (Array.isArray(data)) {
            mutableArgs.data = data.map((item: Record<string, unknown>) => ({
              ...item,
              orgId,
            }));
          }
        }

        const start = Date.now();
        const result = await query(mutableArgs);
        const duration = Date.now() - start;

        if (duration > 500) {
          console.warn(`⚠️ Query lenta (${duration}ms): ${model}.${operation} [org:${orgId.slice(-6)}]`);
        }

        return result;
      },
    },
  });
}

export async function connectDatabase(): Promise<void> {
  try {
    await basePrisma.$connect();
    console.log('✅ Banco de dados conectado');
  } catch (error) {
    console.error('❌ Falha ao conectar banco de dados:', error);
    process.exit(1);
  }
}

export async function disconnectDatabase(): Promise<void> {
  await basePrisma.$disconnect();
  console.log('📦 Banco de dados desconectado');
}
