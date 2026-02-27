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

// ============ ROTAS ============

// Health check
app.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  env: env.NODE_ENV,
}));

// Webhook do WhatsApp (Evolution API)
app.post('/webhook/whatsapp', whatsappWebhook);

// Verificação do webhook (GET para validação)
app.get('/webhook/whatsapp', async (request, reply) => {
  reply.send({ status: 'webhook active' });
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

start();

export { app };
