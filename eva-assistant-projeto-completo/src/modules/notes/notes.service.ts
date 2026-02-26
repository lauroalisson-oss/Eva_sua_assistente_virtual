import { ResponseMessage, ExtractedEntities } from '../../types';
import { prisma } from '../../config/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

class NotesService {
  /**
   * Cria uma nova anotação.
   */
  async createNote(
    phone: string,
    entities: ExtractedEntities,
    originalText: string
  ): Promise<ResponseMessage> {
    try {
      // Extrair conteúdo (remover prefixos como "anota:", "lembra:", etc.)
      const content = entities.description || this.cleanNoteText(originalText);

      const note = await prisma.note.create({
        data: {
          tenantId: phone,
          content,
          tags: this.autoTag(content),
          sourceType: 'text',
        },
      });

      const tags = note.tags.length > 0 ? `\n🏷️ ${note.tags.map(t => `#${t}`).join(' ')}` : '';

      return {
        text: `Anotado! ✅\n\n📝 "${content}"${tags}`,
      };
    } catch (error) {
      console.error('❌ Erro ao criar nota:', error);
      return { text: '⚠️ Erro ao salvar anotação. Tente novamente.' };
    }
  }

  /**
   * Lista anotações recentes.
   */
  async listNotes(phone: string, entities: ExtractedEntities): Promise<ResponseMessage> {
    try {
      const notes = await prisma.note.findMany({
        where: {
          tenantId: phone,
          deletedAt: null,
        },
        orderBy: [
          { pinned: 'desc' },
          { createdAt: 'desc' },
        ],
        take: 10,
      });

      if (notes.length === 0) {
        return { text: '📝 Nenhuma anotação encontrada. Diga "anota: [sua nota]" para criar uma!' };
      }

      const list = notes
        .map((n, i) => {
          const pin = n.pinned ? '📌 ' : '';
          const date = format(n.createdAt, "dd/MM 'às' HH:mm", { locale: ptBR });
          const tags = n.tags.length > 0 ? ` (${n.tags.map(t => `#${t}`).join(' ')})` : '';
          const preview = n.content.length > 80 ? n.content.substring(0, 80) + '...' : n.content;
          return `${i + 1}. ${pin}${preview}\n   🕐 ${date}${tags}`;
        })
        .join('\n\n');

      return {
        text: `📝 *Suas anotações:*\n\n${list}`,
      };
    } catch (error) {
      console.error('❌ Erro ao listar notas:', error);
      return { text: '⚠️ Erro ao buscar anotações. Tente novamente.' };
    }
  }

  // --- Helpers ---

  /**
   * Remove prefixos de comando do texto da nota.
   */
  private cleanNoteText(text: string): string {
    return text
      .replace(/^(anot[ae]r?|lembr[ae]r?|salv[ae]r?|nota|lembrete)\s*[:\-]?\s*/i, '')
      .trim();
  }

  /**
   * Gera tags automáticas baseadas no conteúdo.
   */
  private autoTag(content: string): string[] {
    const normalized = content.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const tags: string[] = [];

    if (/\b(urgente|urgencia|emergencia|imediato)\b/.test(normalized)) tags.push('urgente');
    if (/\b(ligar|retornar|responder|entrar em contato)\b/.test(normalized)) tags.push('follow-up');
    if (/\b(ideia|sugest[aã]o|pensar|considerar|talvez)\b/.test(normalized)) tags.push('ideia');
    if (/\b(comprar|pagar|depositar|transferir)\b/.test(normalized)) tags.push('financeiro');
    if (/\b(reuniao|encontro|visita|consulta)\b/.test(normalized)) tags.push('agenda');
    if (/\b(projeto|sistema|app|site|codigo)\b/.test(normalized)) tags.push('projeto');

    return tags;
  }
}

export const notesService = new NotesService();
