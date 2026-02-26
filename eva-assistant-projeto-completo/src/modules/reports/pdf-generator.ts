import { prisma } from '../../config/database';
import { formatCurrencyBR } from '../../utils/message-formatter';
import { ResponseMessage } from '../../types';
import * as fs from 'fs';
import * as path from 'path';

interface ReportData {
  tenantName: string;
  period: string;
  monthYear: string;
  income: number;
  expense: number;
  balance: number;
  categories: { name: string; amount: number; percent: number }[];
  transactions: { date: string; type: string; category: string; description: string; amount: number }[];
  previousMonth?: { income: number; expense: number; balance: number };
}

class PDFGenerator {
  /**
   * Gera relatório financeiro mensal completo.
   * Cria um arquivo HTML estilizado e retorna como resposta de texto formatada.
   * Para conversão em PDF, usar Puppeteer quando disponível.
   */
  async generateMonthlyReport(phone: string, month?: number, year?: number): Promise<ResponseMessage> {
    try {
      const now = new Date();
      const targetMonth = month || now.getMonth() + 1;
      const targetYear = year || now.getFullYear();

      const data = await this.collectReportData(phone, targetMonth, targetYear);

      if (data.transactions.length === 0 && data.income === 0 && data.expense === 0) {
        return { text: `📊 Nenhuma transação encontrada para ${data.monthYear}. Nada para reportar.` };
      }

      // Gerar HTML do relatório
      const html = this.buildReportHTML(data);

      // Salvar HTML em arquivo temporário
      const tmpDir = path.join(process.cwd(), 'tmp');
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      const fileName = `relatorio-${targetYear}-${String(targetMonth).padStart(2, '0')}-${phone.slice(-4)}.html`;
      const filePath = path.join(tmpDir, fileName);
      fs.writeFileSync(filePath, html, 'utf-8');

      // Tentar gerar PDF se puppeteer estiver disponível
      const pdfPath = await this.tryGeneratePDF(html, filePath.replace('.html', '.pdf'));

      // Montar resposta de texto com resumo
      const summary = this.buildTextSummary(data);

      if (pdfPath) {
        return {
          text: summary,
          document: {
            url: pdfPath,
            filename: fileName.replace('.html', '.pdf'),
            mimetype: 'application/pdf',
          },
        };
      }

      return { text: summary };
    } catch (error) {
      console.error('❌ Erro ao gerar relatório:', error);
      return { text: '⚠️ Erro ao gerar relatório. Tente novamente.' };
    }
  }

  /**
   * Coleta todos os dados necessários para o relatório.
   */
  private async collectReportData(phone: string, month: number, year: number): Promise<ReportData> {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    // Dados do tenant
    const tenant = await prisma.tenant.findFirst({
      where: { phone },
      select: { name: true },
    });

    // Transações do mês
    const transactions = await prisma.transaction.findMany({
      where: {
        tenantId: phone,
        date: { gte: startOfMonth, lte: endOfMonth },
      },
      orderBy: { date: 'desc' },
    });

    const income = transactions
      .filter(t => t.type === 'INCOME')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const expense = transactions
      .filter(t => t.type === 'EXPENSE')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    // Categorias de despesa
    const catSums: Record<string, number> = {};
    transactions.filter(t => t.type === 'EXPENSE').forEach(t => {
      catSums[t.category] = (catSums[t.category] || 0) + Number(t.amount);
    });

    const categories = Object.entries(catSums)
      .map(([name, amount]) => ({
        name,
        amount,
        percent: expense > 0 ? (amount / expense) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // Mês anterior (comparativo)
    const prevStartOfMonth = new Date(year, month - 2, 1);
    const prevEndOfMonth = new Date(year, month - 1, 0, 23, 59, 59);
    const prevTransactions = await prisma.transaction.findMany({
      where: {
        tenantId: phone,
        date: { gte: prevStartOfMonth, lte: prevEndOfMonth },
      },
    });

    let previousMonth: ReportData['previousMonth'];
    if (prevTransactions.length > 0) {
      const prevIncome = prevTransactions.filter(t => t.type === 'INCOME').reduce((s, t) => s + Number(t.amount), 0);
      const prevExpense = prevTransactions.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + Number(t.amount), 0);
      previousMonth = { income: prevIncome, expense: prevExpense, balance: prevIncome - prevExpense };
    }

    const monthNames = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    return {
      tenantName: tenant?.name || phone,
      period: `${String(month).padStart(2, '0')}/${year}`,
      monthYear: `${monthNames[month]} ${year}`,
      income,
      expense,
      balance: income - expense,
      categories,
      transactions: transactions.map(t => ({
        date: t.date.toLocaleDateString('pt-BR'),
        type: t.type === 'INCOME' ? 'Receita' : 'Despesa',
        category: t.category,
        description: t.description.substring(0, 50),
        amount: Number(t.amount),
      })),
      previousMonth,
    };
  }

  /**
   * Constrói o resumo em texto para envio via WhatsApp.
   */
  private buildTextSummary(data: ReportData): string {
    const parts: string[] = [];

    parts.push(`📊 *Relatório Financeiro — ${data.monthYear}*\n`);
    parts.push(`👤 ${data.tenantName}\n`);
    parts.push(`📈 Receitas: *${formatCurrencyBR(data.income)}*`);
    parts.push(`📉 Despesas: *${formatCurrencyBR(data.expense)}*`);
    parts.push(`${data.balance >= 0 ? '✅' : '🔴'} Saldo: *${formatCurrencyBR(data.balance)}*\n`);

    if (data.categories.length > 0) {
      parts.push('📂 *Despesas por categoria:*');
      data.categories.forEach(cat => {
        parts.push(`• ${cat.name}: ${formatCurrencyBR(cat.amount)} (${cat.percent.toFixed(1)}%)`);
      });
    }

    if (data.previousMonth) {
      parts.push('\n📅 *Comparativo com mês anterior:*');
      const diffExpense = data.expense - data.previousMonth.expense;
      const diffIncome = data.income - data.previousMonth.income;
      parts.push(`Receitas: ${diffIncome >= 0 ? '+' : ''}${formatCurrencyBR(diffIncome)}`);
      parts.push(`Despesas: ${diffExpense >= 0 ? '+' : ''}${formatCurrencyBR(diffExpense)}`);
    }

    parts.push(`\n📋 Total de transações: ${data.transactions.length}`);

    return parts.join('\n');
  }

  /**
   * Gera HTML estilizado para o relatório.
   */
  private buildReportHTML(data: ReportData): string {
    const categoryRows = data.categories.map(cat => `
      <tr>
        <td>${cat.name}</td>
        <td style="text-align:right">${formatCurrencyBR(cat.amount)}</td>
        <td style="text-align:right">${cat.percent.toFixed(1)}%</td>
        <td>
          <div style="background:#e0e0e0;border-radius:4px;overflow:hidden;height:16px">
            <div style="background:#4CAF50;height:100%;width:${Math.min(cat.percent, 100)}%"></div>
          </div>
        </td>
      </tr>
    `).join('');

    const transactionRows = data.transactions.slice(0, 30).map(t => `
      <tr>
        <td>${t.date}</td>
        <td><span style="color:${t.type === 'Receita' ? '#4CAF50' : '#f44336'}">${t.type}</span></td>
        <td>${t.category}</td>
        <td>${t.description}</td>
        <td style="text-align:right;font-weight:bold;color:${t.type === 'Receita' ? '#4CAF50' : '#f44336'}">
          ${t.type === 'Receita' ? '+' : '-'}${formatCurrencyBR(t.amount)}
        </td>
      </tr>
    `).join('');

    let comparativo = '';
    if (data.previousMonth) {
      const diffExpense = data.expense - data.previousMonth.expense;
      const diffIncome = data.income - data.previousMonth.income;
      comparativo = `
        <div style="margin-top:24px">
          <h2>Comparativo com Mes Anterior</h2>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:#f5f5f5"><th>Item</th><th>Mes Anterior</th><th>Este Mes</th><th>Variacao</th></tr></thead>
            <tbody>
              <tr><td>Receitas</td><td>${formatCurrencyBR(data.previousMonth.income)}</td><td>${formatCurrencyBR(data.income)}</td><td style="color:${diffIncome >= 0 ? '#4CAF50' : '#f44336'}">${diffIncome >= 0 ? '+' : ''}${formatCurrencyBR(diffIncome)}</td></tr>
              <tr><td>Despesas</td><td>${formatCurrencyBR(data.previousMonth.expense)}</td><td>${formatCurrencyBR(data.expense)}</td><td style="color:${diffExpense <= 0 ? '#4CAF50' : '#f44336'}">${diffExpense >= 0 ? '+' : ''}${formatCurrencyBR(diffExpense)}</td></tr>
            </tbody>
          </table>
        </div>
      `;
    }

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatorio Financeiro — ${data.monthYear}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 32px; color: #333; max-width: 900px; margin: 0 auto; }
    h1 { color: #1a237e; margin-bottom: 4px; }
    h2 { color: #333; margin: 20px 0 12px; border-bottom: 2px solid #1a237e; padding-bottom: 4px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; border-bottom: 3px solid #1a237e; padding-bottom: 16px; }
    .header .period { font-size: 14px; color: #666; }
    .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
    .card { padding: 16px; border-radius: 8px; text-align: center; }
    .card.income { background: #e8f5e9; border: 1px solid #4CAF50; }
    .card.expense { background: #ffebee; border: 1px solid #f44336; }
    .card.balance { background: ${data.balance >= 0 ? '#e8f5e9' : '#ffebee'}; border: 1px solid ${data.balance >= 0 ? '#4CAF50' : '#f44336'}; }
    .card .label { font-size: 12px; color: #666; text-transform: uppercase; }
    .card .value { font-size: 22px; font-weight: bold; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #eee; }
    thead tr { background: #f5f5f5; }
    .footer { margin-top: 32px; text-align: center; font-size: 11px; color: #999; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Relatorio Financeiro</h1>
      <div class="period">${data.tenantName} — ${data.monthYear}</div>
    </div>
    <div style="font-size:40px">📊</div>
  </div>

  <div class="cards">
    <div class="card income">
      <div class="label">Receitas</div>
      <div class="value" style="color:#4CAF50">${formatCurrencyBR(data.income)}</div>
    </div>
    <div class="card expense">
      <div class="label">Despesas</div>
      <div class="value" style="color:#f44336">${formatCurrencyBR(data.expense)}</div>
    </div>
    <div class="card balance">
      <div class="label">Saldo</div>
      <div class="value" style="color:${data.balance >= 0 ? '#4CAF50' : '#f44336'}">${formatCurrencyBR(data.balance)}</div>
    </div>
  </div>

  <h2>Despesas por Categoria</h2>
  <table>
    <thead><tr><th>Categoria</th><th style="text-align:right">Valor</th><th style="text-align:right">%</th><th style="width:200px">Distribuicao</th></tr></thead>
    <tbody>${categoryRows}</tbody>
  </table>

  ${comparativo}

  <h2>Transacoes (${data.transactions.length})</h2>
  <table>
    <thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descricao</th><th style="text-align:right">Valor</th></tr></thead>
    <tbody>${transactionRows}</tbody>
  </table>

  <div class="footer">
    EVA — Executive Virtual Assistant | Gerado em ${new Date().toLocaleString('pt-BR')}
  </div>
</body>
</html>`;
  }

  /**
   * Tenta gerar PDF usando puppeteer (se disponível).
   * Retorna o path do PDF ou null se puppeteer não estiver instalado.
   */
  private async tryGeneratePDF(html: string, outputPath: string): Promise<string | null> {
    try {
      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.pdf({
        path: outputPath,
        format: 'A4',
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
        printBackground: true,
      });
      await browser.close();
      console.log(`📄 PDF gerado: ${outputPath}`);
      return outputPath;
    } catch {
      // Puppeteer não instalado — relatório fica só em texto
      console.log('📄 Puppeteer não disponível, relatório enviado como texto.');
      return null;
    }
  }
}

export const pdfGenerator = new PDFGenerator();
