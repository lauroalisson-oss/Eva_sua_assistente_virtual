import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env';
import { messageRouter } from '../services/message-router';
import { resolveTenant, getPlanLimits } from '../middleware/tenant-resolver';
import { checkRateLimit, canUseAudio } from '../middleware/rate-limiter';
import { isDuplicateMessage, validateWebhookSignature } from '../middleware/webhook-security';
import { whatsappClient } from '../services/whatsapp-client';

/**
 * Schema de validação para webhook da Evolution API.
 */
const webhookSchema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.object({
    key: z.object({
      remoteJid: z.string(),
      fromMe: z.boolean(),
      id: z.string(),
    }),
    pushName: z.string().optional(),
    message: z.object({
      conversation: z.string().optional(),
      extendedTextMessage: z.object({
        text: z.string(),
      }).optional(),
      audioMessage: z.object({
        url: z.string(),
        mimetype: z.string(),
        seconds: z.number().optional(),
      }).optional(),
    }).optional(),
    messageType: z.string().optional(),
    messageTimestamp: z.number().optional(),
  }),
}).passthrough();

type WebhookPayload = z.infer<typeof webhookSchema>;

function extractPhone(remoteJid: string): string {
  return remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
}

function extractText(data: WebhookPayload['data']): string | null {
  if (data.message?.conversation) {
    return data.message.conversation;
  }
  if (data.message?.extendedTextMessage?.text) {
    return data.message.extendedTextMessage.text;
  }
  return null;
}

/**
 * Handler principal do webhook do WhatsApp.
 * Agora com: tenant resolution, rate limiting, idempotencia, plano enforcement.
 */
export async function whatsappWebhook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Responder 200 imediatamente
    reply.status(200).send({ received: true });

    // Validar assinatura do webhook (producao)
    // Evolution API v2.3.x nem sempre envia header de assinatura,
    // entao aceitamos webhooks sem assinatura (comunicacao interna Railway)
    if (env.NODE_ENV === 'production') {
      const signature = (request.headers['x-webhook-signature'] || request.headers['x-evolution-signature']) as string | undefined;
      if (signature && !validateWebhookSignature(JSON.stringify(request.body), signature, env.EVOLUTION_API_KEY)) {
        request.log.warn('Webhook com assinatura inválida rejeitado');
        return;
      }
    }

    const payload = webhookSchema.safeParse(request.body);

    if (!payload.success) {
      request.log.warn({ body: request.body }, 'Webhook payload inválido');
      return;
    }

    const { event, data } = payload.data;

    // Só processar mensagens recebidas
    if (event !== 'messages.upsert' || data.key.fromMe) {
      return;
    }

    const phone = extractPhone(data.key.remoteJid);
    const text = extractText(data);
    const isAudio = !!data.message?.audioMessage;
    const senderName = data.pushName || 'Usuário';
    const messageId = data.key.id;

    // 1. IDEMPOTENCIA: verificar mensagem duplicada
    if (await isDuplicateMessage(messageId)) {
      request.log.debug({ messageId }, 'Mensagem duplicada ignorada');
      return;
    }

    // 2. TENANT RESOLUTION: buscar ou criar tenant
    const tenant = await resolveTenant(phone, senderName);

    if (!tenant) {
      request.log.info({ phone }, 'Tenant inativo ou bloqueado');
      return;
    }

    // 3. RATE LIMITING: verificar cota do plano
    const rateLimit = await checkRateLimit(tenant.id, tenant.plan);

    if (!rateLimit.allowed) {
      request.log.info({ phone, plan: tenant.plan, limit: rateLimit.limit }, 'Rate limit atingido');
      await whatsappClient.sendText(
        phone,
        `⚠️ Você atingiu o limite de ${rateLimit.limit} mensagens por dia do plano *${tenant.plan}*.\n\nFale "upgrade" para conhecer nossos planos. 📈`
      );
      return;
    }

    // 4. PLANO ENFORCEMENT: verificar features do plano
    if (isAudio && !canUseAudio(tenant.plan)) {
      await whatsappClient.sendText(
        phone,
        '🎤 Transcrição de áudio está disponível nos planos *PROFESSIONAL* e *ENTERPRISE*.\n\nPor enquanto, envie por texto! 📝'
      );
      return;
    }

    request.log.info(
      { phone, senderName, isAudio, textLength: text?.length, plan: tenant.plan, remaining: rateLimit.remaining },
      '📩 Mensagem recebida'
    );

    // 5. PROCESSAR MENSAGEM
    await messageRouter.handleMessage({
      phone,                // Número real do WhatsApp (para enviar respostas)
      tenantId: tenant.id,  // ID do tenant no banco (para queries)
      senderName: tenant.name,
      text: text || null,
      audio: isAudio
        ? {
            url: data.message!.audioMessage!.url,
            mimetype: data.message!.audioMessage!.mimetype,
            seconds: data.message!.audioMessage!.seconds || 0,
          }
        : null,
      messageId,
      timestamp: data.messageTimestamp || Math.floor(Date.now() / 1000),
    });
  } catch (error) {
    request.log.error({ error }, '❌ Erro no webhook WhatsApp');
  }
}
