import { type Job } from 'bullmq';
import { prisma } from '../config/database';
import { createQueue, createWorker } from '../config/queue';
import { whatsappClient } from '../services/whatsapp-client';
import { formatCurrencyBR, formatDateBR } from '../utils/message-formatter';
import { env } from '../config/env';

/**
 * Job de resumo diário (BullMQ).
 * Envia toda manhã (horário configurável) um resumo com:
 * - Compromissos do dia
 * - Saldo financeiro do mês
 * - Anotações urgentes pendentes
 */

const QUEUE_NAME = 'eva-daily-summary';

const dailySummaryQueue = createQueue(QUEUE_NAME);

/**
 * Worker que processa o envio de resumos.
 */
const dailySummaryWorker = createWorker(QUEUE_NAME, async (_job: Job) => {
  await sendSummaries();
});

/**
 * Envia resumo para todos os tenants ativos.
 */
async function sendSummaries(): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, phone: true, name: true },
  });

  console.log(`📋 Enviando resumo diário para ${tenants.length} tenant(s)...`);

  for (const tenant of tenants) {
    try {
      const summary = await buildSummary(tenant.id, tenant.name);
      if (summary) {
        await whatsappClient.sendText(tenant.phone, summary);
        console.log(`📋 Resumo enviado para ${tenant.phone.slice(-4)}`);
      }
    } catch (error) {
      console.error(`❌ Falha ao enviar resumo para tenant ${tenant.id}:`, error);
    }
  }
}

/**
 * Monta a mensagem de resumo diário para um tenant.
 */
async function buildSummary(tenantId: string, name: string): Promise<string> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const parts: string[] = [];

  // Cabeçalho
  const dayName = now.toLocaleDateString('pt-BR', { weekday: 'long' });
  const dateStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
  parts.push(`Bom dia, ${name}! ☀️`);
  parts.push(`📅 *${dayName}, ${dateStr}*\n`);

  // --- Compromissos do dia ---
  const events = await prisma.event.findMany({
    where: {
      tenantId,
      status: 'ACTIVE',
      deletedAt: null,
      startAt: { gte: startOfDay, lte: endOfDay },
    },
    orderBy: { startAt: 'asc' },
  });

  if (events.length > 0) {
    parts.push(`📋 *Compromissos de hoje (${events.length}):*`);
    events.forEach((e, i) => {
      const time = formatDateBR(e.startAt);
      const loc = e.location ? ` — 📍 ${e.location}` : '';
      parts.push(`${i + 1}. ${e.title}\n   ⏰ ${time}${loc}`);
    });
  } else {
    parts.push('📋 *Nenhum compromisso para hoje.* Dia livre! 🎉');
  }

  parts.push(''); // Linha em branco

  // --- Financeiro do mês ---
  const transactions = await prisma.transaction.findMany({
    where: {
      tenantId,
      date: { gte: startOfMonth, lte: endOfDay },
    },
  });

  const income = transactions
    .filter(t => t.type === 'INCOME')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const expense = transactions
    .filter(t => t.type === 'EXPENSE')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const balance = income - expense;

  parts.push('💰 *Financeiro do mês:*');
  parts.push(`📈 Receitas: ${formatCurrencyBR(income)}`);
  parts.push(`📉 Despesas: ${formatCurrencyBR(expense)}`);
  parts.push(`${balance >= 0 ? '✅' : '🔴'} Saldo: *${formatCurrencyBR(balance)}*`);

  // Verificar orçamento
  const budget = await prisma.budget.findFirst({
    where: {
      tenantId,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    },
  });

  if (budget) {
    const limit = Number(budget.globalLimit);
    const remaining = limit - expense;
    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
    if (remaining > 0 && daysLeft > 0) {
      parts.push(`💡 Restam ${formatCurrencyBR(remaining)} no orçamento (~${formatCurrencyBR(remaining / daysLeft)}/dia)`);
    } else if (remaining <= 0) {
      parts.push(`🔴 *Orçamento ultrapassado em ${formatCurrencyBR(Math.abs(remaining))}!*`);
    }
  }

  parts.push(''); // Linha em branco

  // --- Notas urgentes ---
  const urgentNotes = await prisma.note.findMany({
    where: {
      tenantId,
      deletedAt: null,
      tags: { has: 'urgente' },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  if (urgentNotes.length > 0) {
    parts.push(`🚨 *Lembretes urgentes (${urgentNotes.length}):*`);
    urgentNotes.forEach((n, i) => {
      const preview = n.content.length > 60 ? n.content.substring(0, 60) + '...' : n.content;
      parts.push(`${i + 1}. ${preview}`);
    });
  }

  parts.push('\n_Tenha um ótimo dia!_ 🚀');

  return parts.join('\n');
}

/**
 * Inicia o job de resumo diário como repeatable (cron schedule).
 */
export async function startDailySummaryJob(): Promise<void> {
  // Remove jobs repetitivos antigos
  const existing = await dailySummaryQueue.getRepeatableJobs();
  for (const job of existing) {
    await dailySummaryQueue.removeRepeatableByKey(job.key);
  }

  const hour = env.DAILY_SUMMARY_HOUR;

  // Adiciona job repetitivo: todo dia na hora configurada
  await dailySummaryQueue.add(
    'send-summaries',
    {},
    {
      repeat: { pattern: `0 ${hour} * * *` },
    },
  );

  console.log(`📋 Job de resumo diário iniciado via BullMQ (todo dia às ${hour}h)`);
}

export { dailySummaryQueue, dailySummaryWorker };
