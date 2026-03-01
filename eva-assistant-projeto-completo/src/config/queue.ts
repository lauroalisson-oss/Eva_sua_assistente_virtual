import { Queue, Worker, type ConnectionOptions, type WorkerOptions } from 'bullmq';
import { env } from './env';

/**
 * Configuração centralizada do BullMQ.
 * Usa a mesma conexão Redis do rate-limiter e webhook-security.
 */

// Extrai host/port/password da REDIS_URL para BullMQ
function parseRedisUrl(url: string): ConnectionOptions {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
      db: parseInt(parsed.pathname?.slice(1) || '0', 10),
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

export const redisConnection: ConnectionOptions = parseRedisUrl(env.REDIS_URL);

const activeQueues: Queue[] = [];
const activeWorkers: Worker[] = [];

/**
 * Cria uma Queue BullMQ com configuração padrão.
 */
export function createQueue(name: string): Queue {
  const queue = new Queue(name, {
    connection: redisConnection,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },  // Mantém últimos 100 jobs completos
      removeOnFail: { count: 50 },       // Mantém últimos 50 jobs falhados
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    },
  });

  activeQueues.push(queue);
  return queue;
}

/**
 * Cria um Worker BullMQ com configuração padrão.
 */
export function createWorker(
  name: string,
  processor: (job: any) => Promise<any>,
  opts?: Partial<WorkerOptions>,
): Worker {
  const worker = new Worker(name, processor, {
    connection: redisConnection,
    concurrency: 1,
    ...opts,
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ Job falhou [${name}/${job?.id}]:`, err.message);
  });

  worker.on('completed', (job) => {
    console.log(`✅ Job concluído [${name}/${job.id}]`);
  });

  activeWorkers.push(worker);
  return worker;
}

/**
 * Encerra todas as queues e workers graciosamente.
 */
export async function disconnectQueues(): Promise<void> {
  await Promise.all([
    ...activeWorkers.map((w) => w.close()),
    ...activeQueues.map((q) => q.close()),
  ]);
  console.log('📦 BullMQ queues e workers encerrados');
}
