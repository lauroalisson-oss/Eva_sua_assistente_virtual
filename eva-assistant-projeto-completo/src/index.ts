import Fastify from 'fastify';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { whatsappWebhook } from './webhooks/whatsapp.controller';
import { adminRoutes } from './webhooks/admin.controller';
import { reminderJob } from './modules/agenda/reminder.job';
import { dailySummaryJob } from './jobs/daily-summary.job';
import { disconnectRateLimiter } from './middleware/rate-limiter';
import { disconnectWebhookSecurity } from './middleware/webhook-security';

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    transport:
      env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
        : undefined,
  },
});

// ============ GLOBAL ERROR HANDLER ============

app.setErrorHandler((error, request, reply) => {
  const statusCode = error.statusCode || 500;

  // Logar o erro com contexto
  request.log.error({
    err: error,
    url: request.url,
    method: request.method,
    statusCode,
  }, `❌ ${error.message}`);

  // Não vazar detalhes internos em produção
  if (statusCode >= 500 && env.NODE_ENV === 'production') {
    reply.status(500).send({ error: 'Internal Server Error' });
  } else {
    reply.status(statusCode).send({
      error: error.message,
      statusCode,
    });
  }
});

// ============ REQUEST LOGGING ============

app.addHook('onResponse', (request, reply, done) => {
  // Não logar health checks para reduzir ruído
  if (request.url === '/health') {
    done();
    return;
  }

  const duration = reply.elapsedTime;
  const level = reply.statusCode >= 400 ? 'warn' : 'info';

  request.log[level]({
    method: request.method,
    url: request.url,
    statusCode: reply.statusCode,
    durationMs: Math.round(duration),
  }, `${request.method} ${request.url} → ${reply.statusCode} (${Math.round(duration)}ms)`);

  done();
});

// ============ ROTAS ============

// Health check (expandido com métricas)
app.get('/health', async () => {
  const memUsage = process.memoryUsage();
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
    uptime: Math.round(process.uptime()),
    memory: {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    },
  };
});

// Webhook do WhatsApp (Evolution API)
app.post('/webhook/whatsapp', whatsappWebhook);

// Verificação do webhook (GET para validação)
app.get('/webhook/whatsapp', async () => {
  return { status: 'webhook active' };
});

// Admin API (protegida por API key)
app.register(adminRoutes, { prefix: '/api/admin' });

// ============ STARTUP ============

async function start(): Promise<void> {
  try {
    // Conectar banco de dados
    await connectDatabase();

    // Iniciar servidor
    await app.listen({ port: env.PORT, host: '0.0.0.0' });

    // Iniciar jobs agendados
    reminderJob.start();
    dailySummaryJob.start();

    console.log(`
╔══════════════════════════════════════════╗
║   🤖 EVA — Executive Virtual Assistant   ║
║   Servidor rodando na porta ${env.PORT}          ║
║   Ambiente: ${env.NODE_ENV.padEnd(28)}║
╚══════════════════════════════════════════╝
    `);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

// Graceful shutdown
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    console.log(`\n🛑 Recebido ${signal}, encerrando...`);
    await app.close();
    await disconnectRateLimiter();
    await disconnectWebhookSecurity();
    await disconnectDatabase();
    process.exit(0);
  });
});

// Capturar erros não tratados
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

start();

export { app };
