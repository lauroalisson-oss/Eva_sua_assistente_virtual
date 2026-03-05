import Groq from 'groq-sdk';
import { AudioMessage } from '../types';
import { env } from '../config/env';
import { whatsappClient } from './whatsapp-client';

let groq: Groq | null = null;

if (env.GROQ_API_KEY) {
  groq = new Groq({ apiKey: env.GROQ_API_KEY });
}

/**
 * Maximum audio duration in seconds (5 minutes).
 * Longer audios are rejected to avoid timeouts and high costs.
 */
const MAX_AUDIO_SECONDS = 300;

/**
 * Common Whisper transcription corrections for Brazilian Portuguese.
 * Whisper often introduces artifacts, incorrect punctuation, or
 * misinterprets colloquial Brazilian Portuguese.
 */
const PT_BR_CORRECTIONS: Array<[RegExp, string]> = [
  // Whisper sometimes outputs "Legendas pela comunidade Amara.org" or similar
  [/legendas?\s+(?:pela|por)\s+(?:comunidade\s+)?amara\.?org/gi, ''],
  [/obrigad[oa]\s+por\s+assistir/gi, ''],
  [/inscreva-se\s+no\s+canal/gi, ''],
  [/\[música\]/gi, ''],
  [/\[aplausos\]/gi, ''],

  // Repeated filler words that Whisper adds
  [/\b(é|eh|uh|ah|hm|hmm|uhm|ahn)\b\s*/gi, ''],

  // Fix common Whisper PT-BR misinterpretations
  [/\bpra\s+mim\b/gi, 'pra mim'],    // preserve "pra mim" (often broken)
  [/\bneh\b/gi, 'né'],                 // "neh" → "né"
  [/\btah\b/gi, 'tá'],                 // "tah" → "tá"
  [/\bvoce\b/gi, 'você'],              // Missing accent
  [/\bate\b(?!\s+[a-z])/gi, 'até'],   // Missing accent (standalone)
  [/\bja\b/gi, 'já'],                  // Missing accent
  [/\btambem\b/gi, 'também'],          // Missing accent
  [/\batrás\b/gi, 'atrás'],
  [/\bhorário\b/gi, 'horário'],

  // Normalize number words that Whisper sometimes spells out
  [/\bcem reais\b/gi, '100 reais'],
  [/\bduzentos reais\b/gi, '200 reais'],
  [/\btrezentos reais\b/gi, '300 reais'],
  [/\bquatrocentos reais\b/gi, '400 reais'],
  [/\bquinhentos reais\b/gi, '500 reais'],
  [/\bmil reais\b/gi, '1000 reais'],
  [/\bdois mil reais\b/gi, '2000 reais'],
  [/\btrês mil reais\b/gi, '3000 reais'],
  [/\bcinco mil reais\b/gi, '5000 reais'],
  [/\bdez mil reais\b/gi, '10000 reais'],

  // Clean up extra whitespace
  [/\s{2,}/g, ' '],
];

class AudioTranscriber {
  /**
   * Transcreve um áudio do WhatsApp para texto usando Groq (Whisper v3).
   * Inclui retry automático, normalização PT-BR e validação de duração.
   */
  async transcribe(audio: AudioMessage): Promise<string | null> {
    if (!groq) {
      console.warn('⚠️ GROQ_API_KEY não configurada. Áudio não será transcrito.');
      return null;
    }

    // Validate audio duration
    if (audio.seconds && audio.seconds > MAX_AUDIO_SECONDS) {
      console.warn(`⚠️ Áudio muito longo (${audio.seconds}s > ${MAX_AUDIO_SECONDS}s)`);
      return null;
    }

    try {
      console.log(`🎤 Transcrevendo áudio (${audio.seconds}s, ${audio.mimetype})...`);

      // 1. Download audio with retry
      const audioBuffer = await this.downloadWithRetry(audio.url);
      if (!audioBuffer) {
        console.error('❌ Falha ao baixar áudio após retentativas');
        return null;
      }

      // 2. Determine the correct file extension from mimetype
      const ext = this.getExtension(audio.mimetype);
      const audioFile = new File([audioBuffer], `audio.${ext}`, {
        type: audio.mimetype || 'audio/ogg',
      });

      // 3. Transcribe with retry (Groq can have transient failures)
      const text = await this.transcribeWithRetry(audioFile);
      if (!text) {
        return null;
      }

      // 4. Post-process: normalize PT-BR transcription
      const normalized = this.normalizeTranscription(text);

      if (!normalized) {
        console.warn('⚠️ Transcrição resultou em texto vazio após normalização');
        return null;
      }

      console.log(`✅ Transcrição: "${normalized.substring(0, 80)}${normalized.length > 80 ? '...' : ''}"`);
      return normalized;
    } catch (error) {
      console.error('❌ Erro na transcrição:', error);
      return null;
    }
  }

  /**
   * Downloads media with retry (Evolution API URLs can be flaky).
   */
  private async downloadWithRetry(url: string, maxRetries = 3): Promise<Buffer | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const buffer = await whatsappClient.downloadMedia(url);
      if (buffer && buffer.length > 0) {
        return buffer;
      }

      if (attempt < maxRetries) {
        const delay = attempt * 1000; // 1s, 2s, 3s
        console.warn(`⚠️ Download falhou (tentativa ${attempt}/${maxRetries}), retry em ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    return null;
  }

  /**
   * Calls Groq Whisper with retry on transient failures.
   */
  private async transcribeWithRetry(audioFile: File, maxRetries = 2): Promise<string | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const transcription = await groq!.audio.transcriptions.create({
          file: audioFile,
          model: 'whisper-large-v3',
          language: 'pt',
          response_format: 'text',
          prompt: 'Transcrição de mensagem de voz em português brasileiro. Inclui nomes próprios, valores em reais, datas e horários.',
        }) as unknown;

        const text = typeof transcription === 'string'
          ? transcription.trim()
          : String(transcription).trim();

        if (text) return text;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`⚠️ Transcrição falhou (tentativa ${attempt}/${maxRetries}): ${errorMsg}`);

        if (attempt < maxRetries) {
          const delay = attempt * 2000; // 2s, 4s
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    return null;
  }

  /**
   * Normalizes Whisper PT-BR transcription output.
   * Removes artifacts, fixes common errors, and cleans up the text.
   */
  private normalizeTranscription(text: string): string {
    let result = text.trim();

    // Apply all PT-BR corrections
    for (const [pattern, replacement] of PT_BR_CORRECTIONS) {
      result = result.replace(pattern, replacement);
    }

    // Remove leading/trailing punctuation that makes no sense
    result = result.replace(/^[.,;:!?\s]+/, '').replace(/[.,;:\s]+$/, '');

    // Capitalize first letter
    if (result.length > 0) {
      result = result.charAt(0).toUpperCase() + result.slice(1);
    }

    return result.trim();
  }

  /**
   * Maps MIME type to file extension for proper Whisper processing.
   */
  private getExtension(mimetype: string): string {
    const mimeMap: Record<string, string> = {
      'audio/ogg': 'ogg',
      'audio/ogg; codecs=opus': 'ogg',
      'audio/mpeg': 'mp3',
      'audio/mp4': 'mp4',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/webm': 'webm',
      'audio/amr': 'amr',
      'audio/aac': 'aac',
      'audio/x-m4a': 'm4a',
    };
    return mimeMap[mimetype] || 'ogg';
  }
}

export const audioTranscriber = new AudioTranscriber();
