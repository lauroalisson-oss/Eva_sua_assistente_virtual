import cron from 'node-cron';
import { prisma } from '../../config/database';
import { whatsappClient } from '../../services/whatsapp-client';
import { formatDateBR } from '../../utils/message-formatter';

/**
 * Job de lembretes de eventos.
 * Roda a cada minuto e verifica se há eventos com lembretes pendentes.
 * Envia mensagem via WhatsApp 1h antes e 1 dia antes do startAt.
 */

interface ReminderConfig {
  minutes: number;
  sent?: boolean;
}

class ReminderJob {
  private isRunning = false;

  /**
   * Inicia o cron job de lembretes (a cada minuto).
   */
  start(): void {
    cron.schedule('* * * * *', async () => {
      if (this.isRunning) return; // Evitar execuções concorrentes
      this.isRunning = true;

      try {
        await this.checkReminders();
      } catch (error) {
        console.error('❌ Erro no job de lembretes:', error);
      } finally {
        this.isRunning = false;
      }
    });

    console.log('🔔 Job de lembretes iniciado (a cada minuto)');
  }

  /**
   * Verifica eventos com lembretes pendentes e envia notificações.
   */
  private async checkReminders(): Promise<void> {
    const now = new Date();
    // Buscar eventos ativos nas próximas 25h (cobre o lembrete de 1 dia)
    const maxFuture = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const events = await prisma.event.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        startAt: {
          gte: now,
          lte: maxFuture,
        },
      },
      include: {
        tenant: { select: { phone: true } },
      },
    });

    for (const event of events) {
      const reminders = this.parseReminders(event.reminderConfig);
      const minutesUntilEvent = (event.startAt.getTime() - now.getTime()) / (1000 * 60);

      for (let i = 0; i < reminders.length; i++) {
        const reminder = reminders[i];

        // Já foi enviado?
        if (reminder.sent) continue;

        // Está na janela do lembrete? (margem de 2 minutos)
        if (minutesUntilEvent <= reminder.minutes && minutesUntilEvent > reminder.minutes - 2) {
          const label = this.formatReminderLabel(reminder.minutes);

          const message = [
            `🔔 *Lembrete!*`,
            ``,
            `📅 *${event.title}*`,
            event.location ? `📍 ${event.location}` : null,
            `⏰ ${formatDateBR(event.startAt)}`,
            ``,
            `Começa em ${label}.`,
          ].filter(Boolean).join('\n');

          try {
            await whatsappClient.sendText(event.tenant.phone, message);
            console.log(`🔔 Lembrete enviado: "${event.title}" (${label}) para ${event.tenant.phone.slice(-4)}`);

            // Marcar como enviado no reminderConfig
            reminders[i] = { ...reminder, sent: true };
            await prisma.event.update({
              where: { id: event.id },
              data: { reminderConfig: JSON.stringify(reminders) },
            });
          } catch (error) {
            console.error(`❌ Falha ao enviar lembrete para evento ${event.id}:`, error);
          }
        }
      }
    }
  }

  /**
   * Faz parse do campo reminderConfig (JSON string) para array de lembretes.
   */
  private parseReminders(config: unknown): ReminderConfig[] {
    try {
      if (typeof config === 'string') {
        return JSON.parse(config) as ReminderConfig[];
      }
      if (Array.isArray(config)) {
        return config as ReminderConfig[];
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Formata o tempo do lembrete para exibição.
   */
  private formatReminderLabel(minutes: number): string {
    if (minutes >= 1440) {
      const days = Math.round(minutes / 1440);
      return days === 1 ? '1 dia' : `${days} dias`;
    }
    if (minutes >= 60) {
      const hours = Math.round(minutes / 60);
      return hours === 1 ? '1 hora' : `${hours} horas`;
    }
    return `${minutes} minutos`;
  }
}

export const reminderJob = new ReminderJob();
