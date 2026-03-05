import { IntentType, ExtractedEntities } from '../../types';
import { extractCurrency } from '../../utils/currency-parser';
import { extractCategory } from '../../utils/text-helpers';

// Expense verbs (expanded)
const EXPENSE_VERBS = 'gastei|gastou|gasto|paguei|pagou|comprei|comprou|despesa|torrei|desembolsei|investi|banquei|perdi|contribui|doei|doou|dei|financiei|larguei|soltei';
// Income verbs (expanded)
const INCOME_VERBS = 'recebi|recebeu|entrada|faturei|faturou|vendi|vendeu|ganhei|ganhou|lucrei|lucrou|embolsei|caiu|entrou|creditou|depositou|depositaram|transferiram|cobrei|arrecadei|fiz|fechei';
// Transaction types for cancellation
const TRANSACTION_TYPES = 'gasto|despesa|receita|transacao|lancamento|registro|pagamento|compra|venda|entrada|saida|debito|credito';
// Cancel verbs
const CANCEL_VERBS = 'cancel[ao]r?|apag[ao]r?|remov[eo]r?|delet[ao]r?|desfaz(?:[eo]r?)?|exclu[ei]r?|estorn[ao]r?|revert[eo]r?';

export const financePatterns = [
  // --- REGISTRAR DESPESA ---
  {
    intent: IntentType.REGISTRAR_DESPESA,
    confidence: 0.85,
    patterns: [
      // Expense verb + amount
      new RegExp(`\\b(${EXPENSE_VERBS})\\b.*\\b(\\d+[.,]?\\d*)\\b`),
      // Amount (R$ or reais/real/conto) + expense context
      /\b(r\$\s*\d|(\d+[.,]?\d*)\s*(reais|real|conto))\b.*(gast|pag|compr|despes|torr|desembols)/,
      // Amount + expense verb
      /\b(\d+[.,]?\d*)\b.*(reais|real|conto)?.*(gast|pag|compr)/,
      // Standalone expense verbs (fallback)
      new RegExp(`\\b(${EXPENSE_VERBS})\\b`),
      // "saiu X reais", "debito de X"
      /\b(saiu|debito|debitou)\b.*\b(\d+[.,]?\d*)\b/,
      // "conta de X reais", "fatura de X"
      /\b(conta|fatura|boleto|parcela)\b.*\b(\d+[.,]?\d*)\b/,
      // "torrei", "desembolsei" standalone with implied expense
      /\b(torrei|desembolsei|banquei)\b/,
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
      // Income verb + amount
      new RegExp(`\\b(${INCOME_VERBS})\\b.*\\b(\\d+[.,]?\\d*)\\b`),
      // Amount + income context
      /\b(\d+[.,]?\d*)\b.*(reais|real|conto)?.*(receb|entrada|fatur|vend|ganh|lucr|embols)/,
      // Standalone income verbs (fallback)
      new RegExp(`\\b(${INCOME_VERBS})\\b`),
      // "entrou X na conta", "caiu X"
      /\b(entrou|caiu|creditou|depositou)\b.*\b(\d+[.,]?\d*)\b/,
      // "X reais de receita/entrada"
      /\b(\d+[.,]?\d*)\s*(reais|real|conto)?\s*(de\s+)?(receita|entrada|rendimento|lucro)/,
      // "me pagaram X"
      /\b(me\s+)?pagar[ao]m?\b.*\b(\d+[.,]?\d*)\b/,
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
      /\b(saldo|balanco|balancoo|financeiro|quanto\s+gastei|quanto\s+gastou)\b/,
      /\b(como\s+(ta|esta))\b.*(financeiro|gasto|despesa|dinheiro|conta|financas)/,
      /\b(resumo|extrato)\b.*(financeiro|gasto|despesa|conta|financas)/,
      /\b(quanto)\b.*(gast[eoi]|sobr[oua]|rest[aou]|falt[aou]|tenho|tem)\b/,
      // "minhas finanças", "meu financeiro", "minha situação financeira" (but NOT "meu limite de gastos")
      /\b(minhas?|meu)\b(?!.*\blimite\b).*(financas|financeiro|situacao financeira|gastos|despesas|contas)/,
      // "como andam meus gastos", "como tão minhas contas"
      /\b(como)\b.*(andam?|tao|estao)\b.*(gastos|despesas|contas|financas)/,
      // "balanço do mês", "balanço geral"
      /\b(balanco|balancoo)\b.*(mes|geral|mensal|semanal|semana)?/,
      // "to no vermelho?", "to no azul?"
      /\b(to|estou|tou)\b.*(no\s+)?(vermelho|azul|positivo|negativo)\b/,
      // "quanto sobrou", "quanto falta", "quanto já gastei"
      /\b(quanto)\b.*(ja\s+)?(gastei|gastou|sobrou|sobra|falta|resta|tem|tenho)\b/,
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
      /\b(defin|seta|coloca|bota|estabel[eo]c|configur)\b.*(limite|orcamento)/,
      // "meu limite é X", "meu orçamento é X"
      /\b(meu)\b.*(limite|orcamento)\b.*(e|sera?|vai ser)\b.*\b(\d+[.,]?\d*)\b/,
      // "quero gastar no máximo X"
      /\b(quero|posso|devo)\b.*\b(gastar|usar)\b.*\b(no maximo|ate)\b.*\b(\d+[.,]?\d*)\b/,
      // "teto de gastos"
      /\b(teto)\b.*(gasto|despesa|mes|mensal)/,
    ],
    extractEntities: (text: string): ExtractedEntities => ({
      amount: extractCurrency(text),
    }),
  },

  // --- CANCELAR TRANSAÇÃO ---
  {
    intent: IntentType.CANCELAR_TRANSACAO,
    confidence: 0.92,
    patterns: [
      // Cancel verb + transaction type
      new RegExp(`\\b(${CANCEL_VERBS})\\b.*(${TRANSACTION_TYPES})`),
      // Transaction type + cancel verb (inverted)
      new RegExp(`\\b(${TRANSACTION_TYPES})\\b.*(cancel|apag|remov|delet|desfaz|exclu|estorn|revert)`),
      // Cancel verb + "último/última" + transaction type
      new RegExp(`\\b(${CANCEL_VERBS})\\b.*(ultim[ao]|derredeir[ao])\\b.*(${TRANSACTION_TYPES})`),
      // "desfaz" + "último/última" (standalone)
      /\b(desfaz(?:[eo]r?)?)\b.*(ultim[ao]|derredeir[ao])\b/,
      // "errei o valor", "lancei errado", "valor errado"
      /\b(errei|lancei errado|valor errado|digitei errado|coloquei errado)\b.*(gasto|despesa|receita|lancamento|valor)?/,
      // "estorna o último", "reverte o último"
      /\b(estorn[ao]r?|revert[eo]r?)\b.*(ultim[ao])\b/,
    ],
    extractEntities: (): ExtractedEntities => ({}),
  },
];
