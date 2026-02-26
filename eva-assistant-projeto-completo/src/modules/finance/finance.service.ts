import { ResponseMessage, ExtractedEntities } from '../../types';
import { prisma } from '../../config/database';
import { formatCurrencyBR, formatPercent, progressBar } from '../../utils/message-formatter';

class FinanceService {
  /**
   * Registra uma despesa.
   */
  async registerExpense(
    phone: string,
    entities: ExtractedEntities,
    originalText: string
  ): Promise<ResponseMessage> {
    try {
      if (!entities.amount) {
        return { text: '💰 Não identifiquei o valor. Pode repetir? Ex: "Gastei 150 de combustível"' };
      }

      const transaction = await prisma.transaction.create({
        data: {
          tenantId: phone,
          type: 'EXPENSE',
          amount: entities.amount,
          category: entities.category || 'outros',
          description: originalText.substring(0, 200),
          date: new Date(),
        },
      });

      // Verificar limites
      const alert = await this.checkBudgetAlert(phone);

      let response = `Despesa registrada! ✅\n\n🛒 *${this.categoryEmoji(transaction.category)} ${this.categoryLabel(transaction.category)}*: ${formatCurrencyBR(entities.amount)}`;

      if (alert) {
        response += `\n\n${alert}`;
      }

      return { text: response };
    } catch (error) {
      console.error('❌ Erro ao registrar despesa:', error);
      return { text: '⚠️ Erro ao registrar despesa. Tente novamente.' };
    }
  }

  /**
   * Registra uma receita.
   */
  async registerIncome(
    phone: string,
    entities: ExtractedEntities,
    originalText: string
  ): Promise<ResponseMessage> {
    try {
      if (!entities.amount) {
        return { text: '💰 Não identifiquei o valor. Pode repetir? Ex: "Recebi 3.500 do cliente X"' };
      }

      await prisma.transaction.create({
        data: {
          tenantId: phone,
          type: 'INCOME',
          amount: entities.amount,
          category: entities.category || 'outros',
          source: entities.person || null,
          description: originalText.substring(0, 200),
          date: new Date(),
        },
      });

      return {
        text: `Receita registrada! ✅\n\n💵 *${formatCurrencyBR(entities.amount)}*\n📂 ${this.categoryLabel(entities.category || 'outros')}${entities.person ? `\n👤 ${entities.person}` : ''}`,
      };
    } catch (error) {
      console.error('❌ Erro ao registrar receita:', error);
      return { text: '⚠️ Erro ao registrar receita. Tente novamente.' };
    }
  }

  /**
   * Consulta saldo/resumo financeiro.
   */
  async getBalance(phone: string, entities: ExtractedEntities): Promise<ResponseMessage> {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      // Buscar transações do mês
      const transactions = await prisma.transaction.findMany({
        where: {
          tenantId: phone,
          date: { gte: startOfMonth, lte: endOfMonth },
        },
      });

      const income = transactions
        .filter(t => t.type === 'INCOME')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const expense = transactions
        .filter(t => t.type === 'EXPENSE')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const balance = income - expense;

      // Buscar orçamento
      const budget = await prisma.budget.findFirst({
        where: {
          tenantId: phone,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        },
      });

      let response = `💰 *Resumo Financeiro — ${now.toLocaleString('pt-BR', { month: 'long' })}*\n\n`;
      response += `📈 Receitas: *${formatCurrencyBR(income)}*\n`;
      response += `📉 Despesas: *${formatCurrencyBR(expense)}*\n`;
      response += `${balance >= 0 ? '✅' : '🔴'} Saldo: *${formatCurrencyBR(balance)}*\n`;

      if (budget) {
        const limit = Number(budget.globalLimit);
        const usage = expense / limit;
        response += `\n📊 *Orçamento:* ${formatCurrencyBR(expense)} de ${formatCurrencyBR(limit)}\n`;
        response += `${progressBar(expense, limit)}\n`;

        const remaining = limit - expense;
        const daysLeft = endOfMonth.getDate() - now.getDate();
        if (remaining > 0 && daysLeft > 0) {
          response += `\n💡 Restam ${formatCurrencyBR(remaining)} para ${daysLeft} dias (~${formatCurrencyBR(remaining / daysLeft)}/dia)`;
        }
      }

      // Top categorias de despesa
      const catSums: Record<string, number> = {};
      transactions.filter(t => t.type === 'EXPENSE').forEach(t => {
        catSums[t.category] = (catSums[t.category] || 0) + Number(t.amount);
      });

      const topCats = Object.entries(catSums).sort((a, b) => b[1] - a[1]).slice(0, 5);
      if (topCats.length > 0) {
        response += `\n\n📂 *Maiores gastos:*\n`;
        topCats.forEach(([cat, amount]) => {
          response += `• ${this.categoryEmoji(cat)} ${this.categoryLabel(cat)}: ${formatCurrencyBR(amount)}\n`;
        });
      }

      return { text: response };
    } catch (error) {
      console.error('❌ Erro ao consultar saldo:', error);
      return { text: '⚠️ Erro ao consultar financeiro. Tente novamente.' };
    }
  }

  /**
   * Define orçamento/limite mensal.
   */
  async setBudget(
    phone: string,
    entities: ExtractedEntities,
    originalText: string
  ): Promise<ResponseMessage> {
    try {
      if (!entities.amount) {
        return { text: '💰 Não identifiquei o valor. Ex: "Meu limite de gastos é 8 mil"' };
      }

      const now = new Date();

      await prisma.budget.upsert({
        where: {
          tenantId_month_year: {
            tenantId: phone,
            month: now.getMonth() + 1,
            year: now.getFullYear(),
          },
        },
        create: {
          tenantId: phone,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
          globalLimit: entities.amount,
        },
        update: {
          globalLimit: entities.amount,
        },
      });

      return {
        text: `Limite definido! ✅\n\n📊 Orçamento mensal: *${formatCurrencyBR(entities.amount)}*\n\nVou te avisar quando atingir 70%, 90% e 100% desse valor. 🔔`,
      };
    } catch (error) {
      console.error('❌ Erro ao definir orçamento:', error);
      return { text: '⚠️ Erro ao definir limite. Tente novamente.' };
    }
  }

  // --- Helpers ---

  private async checkBudgetAlert(phone: string): Promise<string | null> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const budget = await prisma.budget.findFirst({
      where: { tenantId: phone, month: now.getMonth() + 1, year: now.getFullYear() },
    });

    if (!budget) return null;

    const totalExpense = await prisma.transaction.aggregate({
      where: { tenantId: phone, type: 'EXPENSE', date: { gte: startOfMonth } },
      _sum: { amount: true },
    });

    const spent = Number(totalExpense._sum.amount || 0);
    const limit = Number(budget.globalLimit);
    const ratio = spent / limit;

    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
    const remaining = limit - spent;

    if (ratio >= 1) {
      return `🔴 *ATENÇÃO: Limite ULTRAPASSADO!*\nVocê gastou ${formatCurrencyBR(spent)} de ${formatCurrencyBR(limit)} (${formatPercent(ratio)})\n${progressBar(spent, limit)}`;
    } else if (ratio >= 0.9) {
      return `🟠 *ALERTA:* Você já gastou ${formatPercent(ratio)} do limite!\n${formatCurrencyBR(spent)} de ${formatCurrencyBR(limit)}\nRestam ${formatCurrencyBR(remaining)} para ${daysLeft} dias.\n${progressBar(spent, limit)}`;
    } else if (ratio >= 0.7) {
      return `⚠️ Você já gastou ${formatPercent(ratio)} do limite mensal.\nRestam ${formatCurrencyBR(remaining)} para ${daysLeft} dias.\n${progressBar(spent, limit)}`;
    }

    return null;
  }

  private categoryEmoji(cat: string): string {
    const emojis: Record<string, string> = {
      alimentacao: '🛒', transporte: '⛽', moradia: '🏠', contas: '📱',
      saude: '💊', educacao: '📚', lazer: '🎬', impostos: '🏛️',
      vendas: '🛍️', servicos: '💼', salario: '💵', comissoes: '🤝',
      rendimentos: '📈', outros: '📦',
    };
    return emojis[cat] || '📦';
  }

  private categoryLabel(cat: string): string {
    const labels: Record<string, string> = {
      alimentacao: 'Alimentação', transporte: 'Transporte', moradia: 'Moradia',
      contas: 'Contas', saude: 'Saúde', educacao: 'Educação', lazer: 'Lazer',
      impostos: 'Impostos', vendas: 'Vendas', servicos: 'Serviços',
      salario: 'Salário', comissoes: 'Comissões', rendimentos: 'Rendimentos',
      outros: 'Outros',
    };
    return labels[cat] || cat;
  }
}

export const financeService = new FinanceService();
