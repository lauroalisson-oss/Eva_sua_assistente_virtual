import { env } from '../config/env';

class WhatsAppClient {
  private baseUrl: string;
  private apiKey: string;
  private instance: string;

  constructor() {
    this.baseUrl = env.EVOLUTION_API_URL;
    this.apiKey = env.EVOLUTION_API_KEY;
    this.instance = env.EVOLUTION_INSTANCE;
  }

  /**
   * Envia uma mensagem de texto via WhatsApp.
   */
  async sendText(phone: string, text: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseUrl}/message/sendText/${this.instance}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.apiKey,
          },
          body: JSON.stringify({
            number: phone,
            text,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error(`❌ Falha ao enviar mensagem: ${response.status} ${error}`);
      } else {
        console.log(`📤 Mensagem enviada para ${phone.slice(-4)}`);
      }
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem WhatsApp:', error);
    }
  }

  /**
   * Envia um documento (PDF, etc.) via WhatsApp.
   */
  async sendDocument(
    phone: string,
    mediaUrl: string,
    fileName: string,
    mimetype: string
  ): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseUrl}/message/sendMedia/${this.instance}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.apiKey,
          },
          body: JSON.stringify({
            number: phone,
            mediatype: 'document',
            media: mediaUrl,
            fileName,
            mimetype,
          }),
        }
      );

      if (!response.ok) {
        console.error(`❌ Falha ao enviar documento: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Erro ao enviar documento WhatsApp:', error);
    }
  }

  /**
   * Baixa mídia via Evolution API getBase64FromMediaMessage endpoint.
   * Este é o método correto para Evolution API v2.x — a URL no webhook
   * geralmente é uma URL do CDN do WhatsApp que expira rapidamente.
   */
  async getBase64Media(messageKey: { remoteJid: string; fromMe: boolean; id: string }): Promise<Buffer | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/chat/getBase64FromMediaMessage/${this.instance}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: this.apiKey,
          },
          body: JSON.stringify({
            message: {
              key: messageKey,
            },
          }),
          signal: AbortSignal.timeout(30000),
        }
      );

      if (!response.ok) {
        console.error(`❌ getBase64FromMediaMessage falhou: HTTP ${response.status}`);
        return null;
      }

      const data = await response.json() as Record<string, unknown>;

      // Evolution API v2.x returns { base64: "data:audio/ogg;base64,..." }
      const base64String = (data.base64 || data.mediaUrl || '') as string;

      if (!base64String) {
        console.error('❌ getBase64FromMediaMessage retornou sem dados de mídia');
        return null;
      }

      // Strip data URI prefix if present (e.g., "data:audio/ogg;base64,")
      const base64Data = base64String.includes(',')
        ? base64String.split(',')[1]
        : base64String;

      const buffer = Buffer.from(base64Data, 'base64');

      if (buffer.length === 0) {
        console.error('❌ Buffer base64 decodificado está vazio');
        return null;
      }

      console.log(`📥 Mídia baixada via Evolution API: ${(buffer.length / 1024).toFixed(1)}KB`);
      return buffer;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Erro getBase64FromMediaMessage: ${msg}`);
      return null;
    }
  }

  /**
   * Baixa uma mídia (áudio) do WhatsApp via URL direta.
   * Fallback para quando getBase64FromMediaMessage não funciona.
   */
  async downloadMedia(mediaUrl: string): Promise<Buffer | null> {
    try {
      // First attempt: direct download (some URLs are pre-authenticated)
      let response = await fetch(mediaUrl, { signal: AbortSignal.timeout(30000) });

      // If direct download fails, try with Evolution API auth headers
      if (!response.ok) {
        response = await fetch(mediaUrl, {
          headers: { apikey: this.apiKey },
          signal: AbortSignal.timeout(30000),
        });
      }

      if (!response.ok) {
        console.error(`❌ Download direto falhou: HTTP ${response.status}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length === 0) {
        console.error('❌ Download retornou buffer vazio');
        return null;
      }

      console.log(`📥 Mídia baixada via URL direta: ${(buffer.length / 1024).toFixed(1)}KB`);
      return buffer;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Erro ao baixar mídia via URL: ${msg}`);
      return null;
    }
  }
}

export const whatsappClient = new WhatsAppClient();
