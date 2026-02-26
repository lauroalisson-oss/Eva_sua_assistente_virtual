import { IntentType, ExtractedEntities } from '../../types';

export const systemPatterns = [
  // --- SAUDAÇÃO ---
  {
    intent: IntentType.SAUDACAO,
    confidence: 0.95,
    patterns: [
      /^(oi|ola|hey|eai|e ai|bom dia|boa tarde|boa noite|fala|salve)\b/,
      /^(opa|hello|hi)\b/,
    ],
    extractEntities: (): ExtractedEntities => ({}),
  },

  // --- AJUDA ---
  {
    intent: IntentType.AJUDA,
    confidence: 0.95,
    patterns: [
      /\b(ajuda|help|menu|comandos|o que (voce|vc|tu) (faz|pode|consegu[ei]))\b/,
      /\b(como (funciona|usa[r]?))\b/,
    ],
    extractEntities: (): ExtractedEntities => ({}),
  },

  // --- RELATÓRIO ---
  {
    intent: IntentType.RELATORIO,
    confidence: 0.85,
    patterns: [
      /\b(relat[oó]rio|report)\b/,
      /\b(resumo)\b.*(mes|mensal|semanal|semana)/,
      /\b(me\s+(manda|envia|gera))\b.*(relat|resumo|report)/,
    ],
    extractEntities: (text: string): ExtractedEntities => {
      let period = 'month';
      if (/semana/.test(text)) period = 'week';
      return { period };
    },
  },
];
