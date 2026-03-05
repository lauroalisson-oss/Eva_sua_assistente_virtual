import { IntentType, ExtractedEntities } from '../../types';

export const systemPatterns = [
  // --- PERGUNTA SOBRE EVA (must come before AJUDA to catch specific capability questions) ---
  {
    intent: IntentType.PERGUNTA_SOBRE_EVA,
    confidence: 0.92,
    patterns: [
      // "como faço para treinar você/eva"
      /\b(como)\b.*(faco|faz|posso|consigo|devo)\b.*(treinar|ensinar|configurar|personalizar|customizar)\b.*(voce|vc|eva|bot|agente|atendente|assistente)?/,
      // "como treinar a eva", "como ensinar o bot"
      /\b(como)\b.*(treinar|ensinar|configurar|personalizar)\b.*(eva|bot|agente|atendente|assistente)/,
      // "dá pra/posso treinar você", "consigo ensinar o bot"
      /\b(da pra|posso|consigo|tem como|eh possivel|e possivel)\b.*(treinar|ensinar|configurar|personalizar|customizar)\b/,
      // "quero que você atenda meus clientes", "quero que você atenda por mim"
      /\b(quero|gostaria|preciso)\b.*(que)?\b.*(voce|vc|eva|bot)\b.*(atend|respond|convers|fal|vend|ajud)\b/,
      // "como faço pra ela/voce atender meus clientes"
      /\b(como)\b.*(faco|faz|posso)\b.*(ela|voce|vc|eva)\b.*(atend|respond|convers)/,
      // "como funciona o atendente", "como funciona o modo conversa"
      /\b(como)\b.*(funciona|usa[r]?|ativa|configura)\b.*(atendente|modo conversa|modo vendas|conversa livre|chat)/,
      // "você pode atender meus clientes?", "voce consegue vender?"
      /\b(voce|vc|eva)\b.*(pode|consegue|sabe|da pra)\b.*(atend|respond|vend|convers|fal)\b/,
      // "o que é o modo atendente", "o que é conversa livre"
      /\b(o que e|que e|que significa)\b.*(atendente|conversa livre|modo conversa|modo vendas)/,
      // "como você funciona", "como a eva funciona"
      /\b(como)\b.*(voce|vc|eva|isso aqui|essa assistente)\b.*(funciona|trabalha|opera)/,
      // "posso usar você para atender clientes"
      /\b(posso|consigo|da pra|tem como)\b.*(usar)\b.*(voce|vc|eva)\b.*(para|pra)\b/,
      // "quais planos disponíveis", "quanto custa"
      /\b(quais?|quanto)\b.*(planos?|custa|preco|valor|assinatura|mensalidade)/,
      // "tem como integrar", "integra com"
      /\b(tem como|da pra|posso|consigo)\b.*(integrar|conectar|ligar|vincular)\b/,
      // "voce aprende", "voce memoriza"
      /\b(voce|vc|eva)\b.*(aprende|memoriza|lembra|guarda|salva)\b.*(o que|das|dos|de)?\b/,
      // "como cadastrar produtos", "como adicionar preços"
      /\b(como)\b.*(cadastrar|adicionar|colocar|registrar)\b.*(produto|preco|servico|informac|conhecimento|faq)/,
    ],
    extractEntities: (): ExtractedEntities => ({}),
  },

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
      // More greetings
      /^(fala[, ]+(ai|tu|vc|voce|eva)|e nois|firmeza|tranquilo|boa|dae)\b/,
      // "olá, tudo bem?"
      /^(ola|oi|eai),?\s*(tudo\s+(bem|bom|certo|tranquilo))\b/,
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
      // "me mostra o menu", "lista de comandos"
      /\b(mostr[ae]|lista)\b.*(menu|comandos|funcoes|opcoes)\b/,
      // "instrucoes", "tutorial"
      /\b(instruc[oõ]es|tutorial|guia|manual)\b/,
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
