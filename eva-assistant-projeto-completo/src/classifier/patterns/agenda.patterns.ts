import { IntentType, ExtractedEntities } from '../../types';
import { extractDateFromText, extractTimeFromText } from '../../utils/date-parser';
import { extractAfterKeyword, extractPerson, extractLocation } from '../../utils/text-helpers';

export const agendaPatterns = [
  // --- AGENDAR ---
  {
    intent: IntentType.AGENDAR,
    confidence: 0.85,
    patterns: [
      /\b(marca|agendar?|marcar?)\b.*(reuniao|encontro|compromisso|consulta|evento)/,
      /\b(reuniao|encontro|compromisso|consulta)\b.*(marca|agendar?|marcar?)/,
      /\b(marca|agendar?)\b.*(amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)/,
      /\b(marca|agendar?)\b.*\b(\d{1,2}[h:]?\d{0,2})\b/,
      /\b(tenho|tem)\b.*(reuniao|compromisso).*(as?\s+\d)/,
    ],
    extractEntities: (text: string): ExtractedEntities => ({
      date: extractDateFromText(text),
      time: extractTimeFromText(text),
      title: extractAfterKeyword(text, ['reuniao', 'encontro', 'compromisso', 'consulta']),
      person: extractPerson(text),
      location: extractLocation(text),
    }),
  },

  // --- LISTAR AGENDA ---
  {
    intent: IntentType.LISTAR_AGENDA,
    confidence: 0.9,
    patterns: [
      /\b(o que|quais?)\b.*(tenho|tem).*(hoje|amanha|semana|mes)/,
      /\b(minha|meu)\b.*(agenda|compromissos?|eventos?)/,
      /\b(agenda|compromissos?)\b.*(hoje|amanha|semana|mes|proxim)/,
      /\b(como (ta|esta)|qual)\b.*(minha)?\b.*(agenda)/,
      /\blistar?\b.*(agenda|compromissos?|eventos?)/,
    ],
    extractEntities: (text: string): ExtractedEntities => {
      let period = 'today';
      if (/amanha/.test(text)) period = 'tomorrow';
      else if (/semana/.test(text)) period = 'week';
      else if (/mes/.test(text)) period = 'month';
      return { period };
    },
  },

  // --- CANCELAR EVENTO ---
  {
    intent: IntentType.CANCELAR_EVENTO,
    confidence: 0.85,
    patterns: [
      /\b(cancel[ao]r?|desmarc[ao]r?|remov[eo]r?)\b.*(reuniao|encontro|compromisso|consulta|evento)/,
      /\b(reuniao|encontro|compromisso)\b.*(cancel|desmarc)/,
      /\b(cancel[ao]r?|desmarc[ao]r?)\b.*(amanha|segunda|terca|quarta|quinta|sexta)/,
    ],
    extractEntities: (text: string): ExtractedEntities => ({
      date: extractDateFromText(text),
      title: extractAfterKeyword(text, ['reuniao', 'encontro', 'compromisso']),
    }),
  },

  // --- EDITAR EVENTO ---
  {
    intent: IntentType.EDITAR_EVENTO,
    confidence: 0.85,
    patterns: [
      /\b(mud[ao]r?|alter[ao]r?|trocar?|adiar?|reagend[ao]r?)\b.*(reuniao|encontro|compromisso|consulta|evento)/,
      /\b(reuniao|encontro|compromisso)\b.*(mud[ao]|alter|troc|adi|reagend)/,
      /\b(mud[ao]r?|alter[ao]r?|adiar?)\b.*(amanha|segunda|terca|quarta|quinta|sexta)/,
      /\b(reagend[ao]r?)\b/,
    ],
    extractEntities: (text: string): ExtractedEntities => ({
      date: extractDateFromText(text),
      time: extractTimeFromText(text),
      title: extractAfterKeyword(text, ['reuniao', 'encontro', 'compromisso']),
    }),
  },
];
