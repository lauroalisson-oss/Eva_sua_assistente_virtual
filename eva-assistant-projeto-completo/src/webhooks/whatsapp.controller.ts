import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env';
import { messageRouter } from '../services/message-router';

/**
 * Schema de validação para webhook da Evolution API.
 * A Evolution API envia eventos em formato específico.
 */
const webhookSchema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.object({
    key: z.object({
      remoteJid: z.string(),      // Número do remetente (ex: 5575999999999@s.whatsapp.net)
      fromMe: z.boolean(),
      id: z.string(),
    }),
    pushName: z.string().optional(),  // Nome do contato
    message: z.object({
      conversation: z.string().optional(),           // Mensagem de texto simples
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

/**
 * Extrai o número de telefone limpo do remoteJid.
 * Ex: "5575999999999@s.whatsapp.net" → "5575999999999"
 */
function extractPhone(remoteJid: string): string {
  return remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
}

/**
 * Extrai o texto da mensagem do payload do webhook.
 */
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
 */
export async function whatsappWebhook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Responder 200 imediatamente (WhatsApp espera resposta rápida)
    reply.status(200).send({ received: true });

    const payload = webhookSchema.safeParse(request.body);

    if (!payload.success) {
      request.log.warn({ body: request.body }, 'Webhook payload inválido');
      return;
    }

    const { event, data } = payload.data;

    // Só processar mensagens recebidas (não enviadas por nós)
    if (event !== 'messages.upsert' || data.key.fromMe) {
      return;
    }

    const phone = extractPhone(data.key.remoteJid);
    const text = extractText(data);
    const isAudio = !!data.message?.audioMessage;
    const senderName = data.pushName || 'Usuário';

    // Verificar se o telefone é autorizado (no MVP, só phones autorizados)
    // No SaaS, buscar tenant pelo phone no banco
    if (!env.AUTHORIZED_PHONES.includes(phone)) {
      request.log.info({ phone }, 'Mensagem de número não autorizado');
      return;
    }

    request.log.info(
      { phone, senderName, isAudio, textLength: text?.length },
      '📩 Mensagem recebida'
    );

    // Rotear mensagem para processamento
    await messageRouter.handleMessage({
      phone,
      senderName,
      text: text || null,
      audio: isAudio
        ? {
            url: data.message!.audioMessage!.url,
            mimetype: data.message!.audioMessage!.mimetype,
            seconds: data.message!.audioMessage!.seconds || 0,
          }
        : null,
      messageId: data.key.id,
      timestamp: data.messageTimestamp || Math.floor(Date.now() / 1000),
    });
  } catch (error) {
    request.log.error({ error }, '❌ Erro no webhook WhatsApp');
  }
}
