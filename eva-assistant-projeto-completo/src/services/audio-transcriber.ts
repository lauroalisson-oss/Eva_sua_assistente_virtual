import Groq from 'groq-sdk';
import { AudioMessage } from '../types';
import { env } from '../config/env';
import { whatsappClient } from './whatsapp-client';

let groq: Groq | null = null;

if (env.GROQ_API_KEY) {
  groq = new Groq({ apiKey: env.GROQ_API_KEY });
}

class AudioTranscriber {
  /**
   * Transcreve um áudio do WhatsApp para texto usando Groq (Whisper v3).
   */
  async transcribe(audio: AudioMessage): Promise<string | null> {
    if (!groq) {
      console.warn('⚠️ GROQ_API_KEY não configurada. Áudio não será transcrito.');
      return null;
    }

    try {
      console.log(`🎤 Transcrevendo áudio (${audio.seconds}s)...`);

      // 1. Baixar o áudio
      const audioBuffer = await whatsappClient.downloadMedia(audio.url);
      if (!audioBuffer) {
        console.error('❌ Falha ao baixar áudio');
        return null;
      }

      // 2. Criar File object para a API
      const audioFile = new File([audioBuffer], 'audio.ogg', {
        type: audio.mimetype || 'audio/ogg',
      });

      // 3. Transcrever via Groq
      const transcription = await groq.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-large-v3',
        language: 'pt',
        response_format: 'text',
      }) as unknown;

      const text = typeof transcription === 'string'
        ? transcription.trim()
        : String(transcription).trim();

      console.log(`✅ Transcrição: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);
      return text || null;
    } catch (error) {
      console.error('❌ Erro na transcrição:', error);
      return null;
    }
  }
}

export const audioTranscriber = new AudioTranscriber();
