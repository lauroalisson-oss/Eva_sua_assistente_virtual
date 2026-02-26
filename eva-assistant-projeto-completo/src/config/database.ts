import { PrismaClient } from '@prisma/client';
import { env } from './env';

const basePrisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
});

/**
 * Extensão para log de queries lentas.
 * Usa a API $extends (substitui o deprecado $use).
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
