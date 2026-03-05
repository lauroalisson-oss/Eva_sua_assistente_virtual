import { IntentType, ExtractedEntities } from '../../types';

export const systemPatterns = [
  // --- SAUDAÇÃO ---
  {
    intent: IntentType.SAUDACAO,
    confidence: 0.95,
    patterns: [
      /^(oi|ola|hey|eai|e ai|bom dia|boa tarde|boa noite|fala|salve)\b/,
      /^(opa|hello|hi|yo|iae|ia[ei]|beleza|blz|suave|de boa|fala ai|oi oi|oie|oii|oiii)\b/,
      // "tudo bem?", "tudo bom?", "como vai?" (but NOT "como está meu dia/minha semana")
      /^(tudo bem|tudo bom|como vai|como voce esta|como ce ta|como vc ta)\b/,
      /^como esta(?!\s+me?u|\s+minha)\b/,
      // "bom dia Eva", "oi Eva"
      /^(oi|ola|bom dia|boa tarde|boa noite)\s+(eva|assistente)\b/,
    ],
    extractEntities: (): ExtractedEntities => ({}),
  },

  // --- AJUDA ---
  {
    intent: IntentType.AJUDA,
    confidence: 0.95,
    patterns: [
      /\b(ajuda|help|menu|comandos|o que (voce|vc|tu|ce) (faz|pode|consegu[ei]|sabe))\b/,
      /\b(como (funciona|usa[r]?|faz|faco))\b/,
      // "me ajuda", "preciso de ajuda"
      /\b(me\s+ajuda|preciso\s+de\s+ajuda|socorro)\b/,
      // "quais são seus comandos", "o que eu posso fazer"
      /\b(quais)\b.*(seus?\s+)?(?:comandos|funcoes|funcionalidades|opcoes|recursos)/,
      /\b(o que)\b.*(eu\s+)?(posso|consigo|da pra)\s+(?:fazer|pedir|usar)/,
      // "pra que serve", "qual sua função"
      /\b(pra que|para que)\b.*(serve|voce serve|vc serve)\b/,
      /\b(qual)\b.*(sua|tua)\b.*(funcao|utilidade|finalidade)\b/,
    ],
    extractEntities: (): ExtractedEntities => ({}),
  },

  // --- RELATÓRIO ---
  {
    intent: IntentType.RELATORIO,
    confidence: 0.85,
    patterns: [
      /\b(relat[oó]rio|report)\b/,
      /\b(resumo)\b.*(mes|mensal|semanal|semana|geral|completo|diario|dia)/,
      /\b(me\s+(manda|envia|gera|faz|prepara))\b.*(relat|resumo|report|balanco)/,
      // "gera um relatório", "faz um resumo"
      /\b(gera[r]?|faz(?:er)?|prepar[ae]r?|cri[ae]r?)\b.*\b(relat|resumo|report|balanco|panorama)\b/,
      // "quero um relatório", "preciso de um resumo"
      /\b(quero|preciso)\b.*\b(relat|resumo|report|balanco)\b/,
      // "como foi meu mês", "como foi minha semana"
      /\b(como\s+foi)\b.*(meu\s+mes|minha\s+semana|meu\s+dia)\b/,
      // "panorama geral", "visão geral"
      /\b(panorama|visao)\b.*(geral|mensal|semanal)\b/,
    ],
    extractEntities: (text: string): ExtractedEntities => {
      let period = 'month';
      if (/semana/.test(text)) period = 'week';
      if (/dia|diario|hoje/.test(text)) period = 'today';
      return { period };
    },
  },
];
