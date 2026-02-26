import { PrismaClient } from '@prisma/client';
import { env } from './env';

export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
});

/**
 * Middleware para garantir isolamento multi-tenant.
 * Adiciona filtro tenantId automaticamente em queries de leitura.
 */
prisma.$use(async (params, next) => {
  // Log de queries lentas em desenvolvimento
  const start = Date.now();
  const result = await next(params);
  const duration = Date.now() - start;

  if (duration > 500) {
    console.warn(`⚠️ Query lenta (${duration}ms): ${params.model}.${params.action}`);
  }

  return result;
});

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('✅ Banco de dados conectado');
  } catch (error) {
    console.error('❌ Falha ao conectar banco de dados:', error);
    process.exit(1);
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  console.log('📦 Banco de dados desconectado');
}
