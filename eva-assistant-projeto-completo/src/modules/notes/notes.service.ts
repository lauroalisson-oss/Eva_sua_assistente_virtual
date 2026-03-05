import { ResponseMessage, ExtractedEntities } from '../../types';
import { prisma } from '../../config/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { auditLog } from '../../middleware/audit-logger';

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

      await auditLog(phone, 'CREATE', 'Note', note.id, { contentPreview: content.substring(0, 100) });

      const tags = note.tags.length > 0 ? `\n🏷️ ${note.tags.map(t => `#${t}`).join(' ')}` : '';

      // Check if user provided a date/time for reminder
      const hasDateReference = entities.hasDateReference as boolean | undefined;
      const reminderDate = entities.date as string | undefined;
      const reminderTime = entities.time as string | undefined;

      let reminderInfo = '';
      if (reminderDate || reminderTime) {
        // User provided date/time — confirm the reminder
        const datePart = reminderDate ? ` em *${this.formatDateBR(reminderDate)}*` : '';
        const timePart = reminderTime ? ` às *${reminderTime}*` : '';
        reminderInfo = `\n\n⏰ Lembrete configurado${datePart}${timePart}`;
      } else if (!hasDateReference) {
        // No date provided — ask when to be reminded
        reminderInfo = '\n\n💡 _Quer que eu te lembre em alguma data? Me diz quando! Ex: "amanhã", "segunda", "dia 15"_';
      }

      return {
        text: `Anotado! ✅\n\n📝 "${content}"${tags}${reminderInfo}`,
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
   * Remove prefixos de comando e palavras de preenchimento do texto da nota.
   * Extrai apenas o conteúdo significativo que o usuário quer salvar.
   */
  private cleanNoteText(text: string): string {
    let content = text;

    // Remove command verbs (anotar, lembrar, salvar, guardar, etc.)
    content = content.replace(
      /^(?:eva\s*[,:]?\s*)?(?:anot[ae]r?|lembr[ae]r?|salv[ae]r?|guard[ae]r?|registr[ae]r?|grav[ae]r?|escrev[ae]r?)\s*/i,
      ''
    );

    // Remove noun-based prefixes (nota:, lembrete:, etc.)
    content = content.replace(
      /^(?:cri[ae]r?\s+)?(?:uma?\s+)?(?:nota|lembrete|anotacao|recado|observacao|memo|aviso)\s*/i,
      ''
    );

    // Remove informal prefixes
    content = content.replace(
      /^(?:nao (?:me )?deixa esquecer|pra (?:eu )?nao esquecer|antes que eu esqueca|preciso lembrar|nao posso esquecer|tenho que lembrar)\s*/i,
      ''
    );

    // Remove filler words after prefix
    content = content.replace(/^(?:que|de que|isso|o seguinte|aqui|ai)\s*[:\-]?\s*/i, '');

    // Remove separator chars at the beginning
    content = content.replace(/^[:\-–—]\s*/, '');

    // Remove "por favor" / "pfv"
    content = content.replace(/\s*(?:por favor|pfv|pf)\s*/gi, ' ');

    // Remove filler connectors at start: "que", "de", "de que", "o", "a"
    content = content.replace(/^(?:que|de\s+que|de|do|da|o|a|um|uma)\s+/i, '');

    return content.trim() || text;
  }

  /**
   * Gera tags automáticas baseadas no conteúdo.
   * Expanded tag detection for better organization.
   */
  private autoTag(content: string): string[] {
    const normalized = content.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const tags: string[] = [];

    if (/\b(urgente|urgencia|emergencia|imediato|prioridade|critico|importante)\b/.test(normalized)) tags.push('urgente');
    if (/\b(ligar|retornar|responder|entrar em contato|dar retorno|callback|follow[- ]?up|acompanhar)\b/.test(normalized)) tags.push('follow-up');
    if (/\b(ideia|sugestao|pensar|considerar|talvez|possibilidade|hipotese|brainstorm)\b/.test(normalized)) tags.push('ideia');
    if (/\b(comprar|pagar|depositar|transferir|cobrar|divida|orcamento|preco|valor|conta|boleto|fatura|pix)\b/.test(normalized)) tags.push('financeiro');
    if (/\b(reuniao|encontro|visita|consulta|evento|agendar|marcar|horario|compromisso)\b/.test(normalized)) tags.push('agenda');
    if (/\b(projeto|sistema|app|site|codigo|deploy|bug|feature|sprint|tarefa|task|desenvolvimento)\b/.test(normalized)) tags.push('projeto');
    if (/\b(comprar|lista de compras|mercado|supermercado|farmacia|loja|produto)\b/.test(normalized)) tags.push('compras');
    if (/\b(senha|login|acesso|codigo|chave|token|credencial|pin)\b/.test(normalized)) tags.push('credenciais');
    if (/\b(endereco|rua|avenida|cep|numero|bairro|cidade|local)\b/.test(normalized)) tags.push('endereco');
    if (/\b(telefone|celular|whatsapp|email|contato)\b/.test(normalized)) tags.push('contato');

    return tags;
  }

  private formatDateBR(isoDate: string): string {
    try {
      const [year, month, day] = isoDate.split('-');
      return `${day}/${month}/${year}`;
    } catch {
      return isoDate;
    }
  }
}

export const notesService = new NotesService();
