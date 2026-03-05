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
   * Baixa uma mídia (áudio) do WhatsApp via URL temporária.
   * Tenta primeiro sem autenticação, depois com apikey da Evolution API.
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
        console.error(`❌ Download falhou: HTTP ${response.status}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length === 0) {
        console.error('❌ Download retornou buffer vazio');
        return null;
      }

      console.log(`📥 Mídia baixada: ${(buffer.length / 1024).toFixed(1)}KB`);
      return buffer;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Erro ao baixar mídia: ${msg}`);
      return null;
    }
  }
}

export const whatsappClient = new WhatsAppClient();
