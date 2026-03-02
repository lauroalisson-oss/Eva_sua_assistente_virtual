import { IntentType, ExtractedEntities } from '../../types';

export const conversationPatterns = [
  // --- ATIVAR ATENDENTE ---
  {
    intent: IntentType.ATIVAR_ATENDENTE,
    confidence: 0.95,
    patterns: [
      /\b(ativar|ligar|habilitar|iniciar|comecar)\s+(atendente|agente|assistente|conversa|chat|atendimento)\b/,
      /\b(modo)\s+(atendente|conversa|atendimento|chat|vendas)\b/,
      /\b(ativar|ligar)\s+(modo)\s+(conversa|atendimento|vendas)\b/,
    ],
    extractEntities: (text: string): ExtractedEntities => {
      const nameMatch = text.match(/(?:nome|chamar?)\s*[:=]?\s*["']?(\w+)["']?/i);
      const businessMatch = text.match(/(?:empresa|loja|negocio)\s*[:=]?\s*["']?([^"'\n]+)["']?/i);
      return {
        agentName: nameMatch?.[1] || undefined,
        businessName: businessMatch?.[1]?.trim() || undefined,
      };
    },
  },

  // --- DESATIVAR ATENDENTE ---
  {
    intent: IntentType.DESATIVAR_ATENDENTE,
    confidence: 0.95,
    patterns: [
      /\b(desativar|desligar|parar|pausar)\s+(atendente|agente|assistente|conversa|chat|atendimento)\b/,
      /\b(desativar|desligar|parar)\s+(modo)\s+(conversa|atendimento|vendas)\b/,
    ],
    extractEntities: (): ExtractedEntities => ({}),
  },

  // --- TREINAR AGENTE ---
  {
    intent: IntentType.TREINAR_AGENTE,
    confidence: 0.90,
    patterns: [
      /^(treinar|ensinar|cadastrar|adicionar|registrar)\s*[:;-]/i,
      /\b(treinar|ensinar)\s+(o\s+)?(agente|bot|atendente|assistente)\b/,
      /\b(adicionar|cadastrar)\s+(conhecimento|informac|produto|servic|preco|faq)\b/,
    ],
    extractEntities: (text: string): ExtractedEntities => {
      const content = text.replace(/^(treinar|ensinar|cadastrar|adicionar|registrar)\s*[:;-]?\s*/i, '').trim();
      return { description: content };
    },
  },

  // --- FALAR COM HUMANO ---
  {
    intent: IntentType.FALAR_COM_HUMANO,
    confidence: 0.90,
    patterns: [
      /\b(falar|conversar|atend)\s+(com|por)\s+(um[a]?\s+)?(humano|pessoa|atendente|gente|alguem)\b/,
      /\b(quero|preciso)\s+(de\s+)?(um[a]?\s+)?(pessoa|atendente|humano)\b/,
      /\b(transferir|transfer[eê]ncia|passar)\s+(para|pra)\s+(um[a]?\s+)?(pessoa|atendente|humano)\b/,
      /\b(nao\s+(quero|consigo)\s+falar\s+com\s+(robo|bot|maquina))\b/,
    ],
    extractEntities: (): ExtractedEntities => ({}),
  },
];
