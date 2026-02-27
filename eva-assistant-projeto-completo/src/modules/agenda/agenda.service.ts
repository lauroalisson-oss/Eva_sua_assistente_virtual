import { ResponseMessage, ExtractedEntities } from '../../types';
import { prisma } from '../../config/database';
import { formatDateBR } from '../../utils/message-formatter';

class AgendaService {
  /**
   * Cria um novo evento na agenda.
   */
  async createEvent(
    phone: string,
    entities: ExtractedEntities,
    originalText: string
  ): Promise<ResponseMessage> {
    try {
      const startAt = this.buildDateTime(entities.date, entities.time);
      const title = entities.title || entities.description || originalText.substring(0, 100);

      const event = await prisma.event.create({
        data: {
          tenantId: phone,
          title,
          description: entities.description || null,
          location: entities.location || null,
          startAt,
          category: 'WORK',
          reminderConfig: JSON.stringify([{ minutes: 60 }, { minutes: 1440 }]),
        },
      });

      return {
        text: `Compromisso agendado! ✅\n\n📅 *${event.title}*\n${entities.location ? `📍 ${entities.location}\n` : ''}⏰ ${formatDateBR(event.startAt)}\n\nVou te avisar 1 dia antes e 1 hora antes. 🔔`,
      };
    } catch (error) {
      console.error('❌ Erro ao criar evento:', error);
      return { text: '⚠️ Não consegui agendar. Tente com mais detalhes (data e horário).' };
    }
  }

  /**
   * Lista eventos da agenda.
   */
  async listEvents(phone: string, entities: ExtractedEntities): Promise<ResponseMessage> {
    try {
      const { start, end } = this.getDateRange(entities.period as string);

      const events = await prisma.event.findMany({
        where: {
          tenantId: phone,
          status: 'ACTIVE',
          startAt: { gte: start, lte: end },
          deletedAt: null,
        },
        orderBy: { startAt: 'asc' },
        take: 10,
      });

      if (events.length === 0) {
        return { text: `📅 Nenhum compromisso encontrado para ${this.periodLabel(entities.period as string)}.` };
      }

      const list = events
        .map((e, i) => `${i + 1}. *${e.title}*\n   ⏰ ${formatDateBR(e.startAt)}${e.location ? `\n   📍 ${e.location}` : ''}`)
        .join('\n\n');

      return {
        text: `📅 *Agenda — ${this.periodLabel(entities.period as string)}:*\n\n${list}`,
      };
    } catch (error) {
      console.error('❌ Erro ao listar eventos:', error);
      return { text: '⚠️ Erro ao buscar agenda. Tente novamente.' };
    }
  }

  /**
   * Cancela um evento.
   */
  async cancelEvent(
    phone: string,
    entities: ExtractedEntities,
    originalText: string
  ): Promise<ResponseMessage> {
    try {
      // Buscar o evento mais próximo que bata com a descrição
      const events = await prisma.event.findMany({
        where: {
          tenantId: phone,
          status: 'ACTIVE',
          deletedAt: null,
          startAt: { gte: new Date() },
        },
        orderBy: { startAt: 'asc' },
        take: 5,
      });

      if (events.length === 0) {
        return { text: '📅 Nenhum compromisso futuro encontrado para cancelar.' };
      }

      // Por enquanto, cancela o mais próximo
      // TODO: implementar matching por título/data
      const event = events[0];
      await prisma.event.update({
        where: { id: event.id },
        data: { status: 'CANCELLED' },
      });

      return {
        text: `Compromisso cancelado! ❌\n\n📅 ~~${event.title}~~\n⏰ ${formatDateBR(event.startAt)}`,
      };
    } catch (error) {
      console.error('❌ Erro ao cancelar evento:', error);
      return { text: '⚠️ Erro ao cancelar. Tente novamente.' };
    }
  }

  /**
   * Edita um evento existente (data, horário ou título).
   * Busca o evento mais próximo e aplica as alterações fornecidas.
   */
  async editEvent(
    phone: string,
    entities: ExtractedEntities,
    originalText: string
  ): Promise<ResponseMessage> {
    try {
      // Buscar eventos ativos futuros
      const events = await prisma.event.findMany({
        where: {
          tenantId: phone,
          status: 'ACTIVE',
          deletedAt: null,
          startAt: { gte: new Date() },
        },
        orderBy: { startAt: 'asc' },
        take: 5,
      });

      if (events.length === 0) {
        return { text: '📅 Nenhum compromisso futuro encontrado para editar.' };
      }

      // Selecionar o evento mais próximo (ou por título se fornecido)
      let event = events[0];
      if (entities.title) {
        const titleNorm = (entities.title as string).toLowerCase();
        const match = events.find(e => e.title.toLowerCase().includes(titleNorm));
        if (match) event = match;
      }

      // Montar os dados atualizados
      const updateData: Record<string, unknown> = {};
      const changes: string[] = [];

      if (entities.date || entities.time) {
        const currentDate = event.startAt.toISOString().split('T')[0];
        const currentTime = `${String(event.startAt.getHours()).padStart(2, '0')}:${String(event.startAt.getMinutes()).padStart(2, '0')}`;
        const newDate = (entities.date as string) || currentDate;
        const newTime = (entities.time as string) || currentTime;
        updateData.startAt = new Date(`${newDate}T${newTime}:00`);
        changes.push(`⏰ Nova data: ${formatDateBR(updateData.startAt as Date)}`);
      }

      if (Object.keys(updateData).length === 0) {
        return { text: '🤔 Não identifiquei o que alterar. Diga a nova data/horário.\nEx: "Muda a reunião para sexta às 15h"' };
      }

      // Resetar lembretes ao reagendar
      updateData.reminderConfig = JSON.stringify([{ minutes: 60 }, { minutes: 1440 }]);

      await prisma.event.update({
        where: { id: event.id },
        data: updateData,
      });

      return {
        text: `Compromisso alterado! ✏️\n\n📅 *${event.title}*\n${changes.join('\n')}\n\nLembretes reconfigurados. 🔔`,
      };
    } catch (error) {
      console.error('❌ Erro ao editar evento:', error);
      return { text: '⚠️ Erro ao editar compromisso. Tente novamente.' };
    }
  }

  // --- Helpers ---

  private buildDateTime(date?: string, time?: string): Date {
    const d = date || new Date().toISOString().split('T')[0];
    const t = time || '09:00';
    return new Date(`${d}T${t}:00`);
  }

  private getDateRange(period?: string): { start: Date; end: Date } {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

    switch (period) {
      case 'tomorrow':
        return {
          start: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000),
          end: new Date(endOfDay.getTime() + 24 * 60 * 60 * 1000),
        };
      case 'week':
        return { start: startOfDay, end: new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000) };
      case 'month':
        return { start: startOfDay, end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59) };
      default: // today
        return { start: startOfDay, end: endOfDay };
    }
  }

  private periodLabel(period?: string): string {
    const labels: Record<string, string> = {
      today: 'hoje',
      tomorrow: 'amanhã',
      week: 'esta semana',
      month: 'este mês',
    };
    return labels[period || 'today'] || 'hoje';
  }
}

export const agendaService = new AgendaService();
