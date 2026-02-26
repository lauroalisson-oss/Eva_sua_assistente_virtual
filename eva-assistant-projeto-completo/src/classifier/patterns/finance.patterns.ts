import { IntentType, ExtractedEntities } from '../../types';
import { extractCurrency } from '../../utils/currency-parser';
import { extractCategory } from '../../utils/text-helpers';

export const financePatterns = [
  // --- REGISTRAR DESPESA ---
  {
    intent: IntentType.REGISTRAR_DESPESA,
    confidence: 0.85,
    patterns: [
      /\b(gast[eoi]|pagu?[eoi]|comprei|despesa)\b.*\b(\d+[.,]?\d*)\b/,
      /\b(r\$\s*\d|(\d+[.,]?\d*)\s*(reais|real|conto))\b.*\b(gast|pag|compr|despes)/,
      /\b(\d+[.,]?\d*)\b.*(reais|real|conto)?.*(gast|pag|compr)/,
      /\b(gast[eoi]|pagu?[eoi]|comprei)\b/,
    ],
    extractEntities: (text: string): ExtractedEntities => ({
      amount: extractCurrency(text),
      category: extractCategory(text, 'expense'),
    }),
  },

  // --- REGISTRAR RECEITA ---
  {
    intent: IntentType.REGISTRAR_RECEITA,
    confidence: 0.85,
    patterns: [
      /\b(receb[ei]|entrada|fatur[eoi]|vend[ei])\b.*\b(\d+[.,]?\d*)\b/,
      /\b(\d+[.,]?\d*)\b.*(reais|real|conto)?.*(receb|entrada|fatur|vend)/,
      /\b(receb[ei]|entrada|fatur[eoi]|vend[ei])\b/,
    ],
    extractEntities: (text: string): ExtractedEntities => ({
      amount: extractCurrency(text),
      category: extractCategory(text, 'income'),
    }),
  },

  // --- CONSULTAR SALDO ---
  {
    intent: IntentType.CONSULTAR_SALDO,
    confidence: 0.9,
    patterns: [
      /\b(saldo|balanc[oe]|financeiro|quanto\s+gast[eoi])\b/,
      /\b(como\s+(ta|esta))\b.*(financeiro|gasto|despesa|dinheiro)/,
      /\b(resumo|extrato)\b.*(financeiro|gasto|despesa|mes)/,
      /\b(quanto)\b.*(gast[eoi]|sobr[oua]|rest[aou]|falt[aou])\b/,
    ],
    extractEntities: (text: string): ExtractedEntities => {
      let period = 'month';
      if (/hoje/.test(text)) period = 'today';
      else if (/semana/.test(text)) period = 'week';
      return { period };
    },
  },

  // --- DEFINIR LIMITE ---
  {
    intent: IntentType.DEFINIR_LIMITE,
    confidence: 0.85,
    patterns: [
      /\b(limite|orcamento)\b.*(gast|mes|mensal).*\b(\d+[.,]?\d*)\b/,
      /\b(\d+[.,]?\d*)\b.*(limite|orcamento)/,
      /\b(defin|seta|coloca|bota)\b.*(limite|orcamento)/,
    ],
    extractEntities: (text: string): ExtractedEntities => ({
      amount: extractCurrency(text),
    }),
  },

  // --- CANCELAR TRANSAÇÃO ---
  {
    intent: IntentType.CANCELAR_TRANSACAO,
    confidence: 0.85,
    patterns: [
      /\b(cancel[ao]r?|apag[ao]r?|remov[eo]r?|delet[ao]r?|desfaz[eo]r?)\b.*(gasto|despesa|receita|transacao|lancamento)/,
      /\b(gasto|despesa|receita|lancamento)\b.*(cancel|apag|remov|delet|desfaz)/,
      /\b(cancel[ao]r?|apag[ao]r?|desfaz[eo]r?)\b.*(ultim[ao]|derredeir[ao])\b.*(gasto|despesa|lancamento|registro)/,
      /\b(desfaz[eo]r?)\b.*(ultim[ao]|derredeir[ao])\b/,
    ],
    extractEntities: (): ExtractedEntities => ({}),
  },
];
