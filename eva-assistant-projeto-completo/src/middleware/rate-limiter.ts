import Redis from 'ioredis';
import { env } from '../config/env';
import { getPlanLimits } from './tenant-resolver';

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    redis.on('error', (err) => {
      console.warn('⚠️ Redis rate-limiter error:', err.message);
    });
  }
  return redis;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetInSeconds: number;
}

/**
 * Rate limiter por tenant usando Redis sliding window.
 * Limita mensagens por dia com base no plano do tenant.
 */
export async function checkRateLimit(tenantId: string, plan: string): Promise<RateLimitResult> {
  const limits = getPlanLimits(plan);
  const maxMessages = limits.messagesPerDay;

  // Plano sem limite
  if (maxMessages === Infinity) {
    return { allowed: true, remaining: Infinity, limit: Infinity, resetInSeconds: 0 };
  }

  try {
    const r = getRedis();
    const key = `rate:${tenantId}:daily`;
    const now = Math.floor(Date.now() / 1000);

    // Calcular segundos ate meia-noite (reset)
    const midnight = new Date();
    midnight.setHours(23, 59, 59, 999);
    const resetInSeconds = Math.ceil((midnight.getTime() - Date.now()) / 1000);

    // Incrementar e obter contagem
    const multi = r.multi();
    multi.incr(key);
    multi.ttl(key);
    const results = await multi.exec();

    const count = (results?.[0]?.[1] as number) || 0;
    const ttl = (results?.[1]?.[1] as number) || -1;

    // Definir TTL na primeira mensagem do dia
    if (ttl === -1 || ttl === -2) {
      await r.expire(key, resetInSeconds);
    }

    const allowed = count <= maxMessages;
    const remaining = Math.max(0, maxMessages - count);

    return { allowed, remaining, limit: maxMessages, resetInSeconds };
  } catch (error) {
    // Se Redis falhar, permitir (fail-open)
    console.warn('⚠️ Rate limiter fallback (Redis indisponível):', (error as Error).message);
    return { allowed: true, remaining: maxMessages, limit: maxMessages, resetInSeconds: 0 };
  }
}

/**
 * Verifica se o tenant pode usar audio (baseado no plano).
 */
export function canUseAudio(plan: string): boolean {
  return getPlanLimits(plan).audioEnabled;
}

/**
 * Verifica se o tenant pode gerar relatorios (baseado no plano).
 */
export function canUseReports(plan: string): boolean {
  return getPlanLimits(plan).reportsEnabled;
}

/**
 * Fecha conexao Redis ao desligar.
 */
export async function disconnectRateLimiter(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
