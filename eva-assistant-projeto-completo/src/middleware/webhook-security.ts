import { createHmac } from 'crypto';
import Redis from 'ioredis';
import { env } from '../config/env';

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    redis.on('error', (err) => {
      console.warn('⚠️ Redis webhook-security error:', err.message);
    });
  }
  return redis;
}

/**
 * Valida a assinatura HMAC do webhook da Evolution API.
 * Retorna true se a assinatura for valida ou se a validacao estiver desabilitada.
 */
export function validateWebhookSignature(
  rawBody: string | Buffer,
  signature: string | undefined,
  secret: string
): boolean {
  // Se nao houver assinatura, pular validacao (dev mode)
  if (!signature) {
    return env.NODE_ENV === 'development';
  }

  try {
    const hmac = createHmac('sha256', secret);
    hmac.update(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8'));
    const expectedSignature = hmac.digest('hex');

    // Comparacao timing-safe
    if (signature.length !== expectedSignature.length) return false;

    let result = 0;
    for (let i = 0; i < signature.length; i++) {
      result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }
    return result === 0;
  } catch {
    return false;
  }
}

/**
 * Verifica se uma mensagem ja foi processada (idempotencia).
 * Usa messageId como chave com TTL de 24h.
 * Retorna true se a mensagem e DUPLICADA (ja processada).
 */
export async function isDuplicateMessage(messageId: string): Promise<boolean> {
  try {
    const r = getRedis();
    const key = `msg:${messageId}`;

    // SET NX (set if not exists) com TTL de 24h
    const result = await r.set(key, '1', 'EX', 86400, 'NX');

    // Se result === null, a chave ja existia = duplicata
    return result === null;
  } catch (error) {
    // Se Redis falhar, permitir (assume nao-duplicata)
    console.warn('⚠️ Idempotency check fallback:', (error as Error).message);
    return false;
  }
}

/**
 * Fecha conexao Redis.
 */
export async function disconnectWebhookSecurity(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
