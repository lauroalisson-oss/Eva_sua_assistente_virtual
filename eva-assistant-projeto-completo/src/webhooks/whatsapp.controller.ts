import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env';
import { messageRouter } from '../services/message-router';
import { resolveTenant, getPlanLimits } from '../middleware/tenant-resolver';
import { resolveFullContext, checkOrgMessageQuota, getOrgPlanLimits } from '../middleware/organization-resolver';
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
 * Suporta tanto o fluxo legado (tenant) quanto o multi-empresa (organization).
 */
export async function whatsappWebhook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Responder 200 imediatamente
    reply.status(200).send({ received: true });

    // Validar assinatura do webhook (producao)
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

    const { event, instance: instanceName, data } = payload.data;

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

    // 2. RESOLVER CONTEXTO: tentar multi-empresa primeiro, depois fluxo legado
    let tenantId: string;
    let plan: string;
    let orgContext: { orgId: string; orgPlan: string; orgName: string } | null = null;

    const fullContext = await resolveFullContext(instanceName, phone, senderName);

    if (fullContext) {
      // ===== FLUXO MULTI-EMPRESA =====
      tenantId = fullContext.tenantId;
      plan = fullContext.tenantPlan;
      orgContext = {
        orgId: fullContext.organization.id,
        orgPlan: fullContext.organization.plan,
        orgName: fullContext.organization.name,
      };

      // Verificar cota de mensagens da organização
      const orgQuota = await checkOrgMessageQuota(
        fullContext.organization.id,
        fullContext.organization.plan
      );

      if (!orgQuota.allowed) {
        const orgLimits = getOrgPlanLimits(fullContext.organization.plan);
        request.log.info(
          { orgName: fullContext.organization.name, plan: fullContext.organization.plan, used: orgQuota.used },
          'Cota mensal da organização atingida'
        );
        await whatsappClient.sendText(
          phone,
          `⚠️ Limite de ${orgLimits.messagesPerMonth} mensagens/mês do plano *${fullContext.organization.plan}* atingido.\n\nEntre em contato com ${fullContext.organization.name} para mais informações.`
        );
        return;
      }

      // Verificar se áudio é permitido no plano da org
      const orgLimits = getOrgPlanLimits(fullContext.organization.plan);
      if (isAudio && !orgLimits.audioEnabled) {
        await whatsappClient.sendText(
          phone,
          '🎤 Mensagens de áudio não estão disponíveis neste momento. Por favor, envie por texto! 📝'
        );
        return;
      }

      request.log.info(
        {
          phone,
          senderName,
          org: fullContext.organization.name,
          instance: instanceName,
          isAudio,
          textLength: text?.length,
        },
        '📩 Mensagem recebida (multi-empresa)'
      );
    } else {
      // ===== FLUXO LEGADO (tenant direto) =====
      const tenant = await resolveTenant(phone, senderName);

      if (!tenant) {
        request.log.info({ phone }, 'Tenant inativo ou bloqueado');
        return;
      }

      tenantId = tenant.id;
      plan = tenant.plan;

      // Rate limiting legado
      const rateLimit = await checkRateLimit(tenant.id, tenant.plan);
      if (!rateLimit.allowed) {
        request.log.info({ phone, plan: tenant.plan, limit: rateLimit.limit }, 'Rate limit atingido');
        await whatsappClient.sendText(
          phone,
          `⚠️ Você atingiu o limite de ${rateLimit.limit} mensagens por dia do plano *${tenant.plan}*.\n\nFale "upgrade" para conhecer nossos planos. 📈`
        );
        return;
      }

      // Verificar áudio — todos os planos suportam com limite de duração por plano
      if (isAudio) {
        if (!canUseAudio(tenant.plan)) {
          await whatsappClient.sendText(
            phone,
            '🎤 Transcrição de áudio não está disponível no seu plano.\n\nPor enquanto, envie por texto! 📝'
          );
          return;
        }
        const audioSeconds = data.message?.audioMessage?.seconds || 0;
        const planLimits = getPlanLimits(tenant.plan);
        const maxSeconds = 'audioMaxSeconds' in planLimits
          ? (planLimits as unknown as { audioMaxSeconds: number }).audioMaxSeconds
          : 300;
        if (audioSeconds > maxSeconds) {
          await whatsappClient.sendText(
            phone,
            `🎤 O áudio é muito longo (${audioSeconds}s). Seu plano *${tenant.plan}* permite até *${maxSeconds}s*.\n\nEnvie um áudio mais curto ou digite! 📝`
          );
          return;
        }
      }

      request.log.info(
        { phone, senderName, isAudio, textLength: text?.length, plan: tenant.plan },
        '📩 Mensagem recebida (legado)'
      );
    }

    // 5. PROCESSAR MENSAGEM
    await messageRouter.handleMessage({
      phone,
      tenantId,
      senderName,
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
