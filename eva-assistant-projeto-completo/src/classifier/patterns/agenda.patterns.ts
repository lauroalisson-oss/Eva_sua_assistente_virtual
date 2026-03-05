import { IntentType, ExtractedEntities } from '../../types';
import { extractDateFromText, extractTimeFromText } from '../../utils/date-parser';
import { extractAfterKeyword, extractPerson, extractLocation } from '../../utils/text-helpers';

// Common event type words (expanded)
const EVENT_TYPES = 'reuniao|encontro|compromisso|consulta|evento|visita|entrevista|apresentacao|palestra|aula|treino|sessao|audiencia|call|meeting|alinhamento|daily|standup|retorno|checkup|exame|prova|dentista|medico|advocacia|jogo|partida|cerimonia|festa|aniversario|casamento';
// Scheduling verbs (expanded)
const SCHEDULE_VERBS = 'marca|agendar?|marcar?|criar?|cadastrar?|incluir?|adicionar?|botar?|colocar?|por|agenda|reservar?|programar?|combinar?|confirmar?';
// Day references (expanded)
const DAY_REFS = 'amanha|hoje|segunda|terca|quarta|quinta|sexta|sabado|domingo|proxim|semana que vem|depois de amanha|no dia|dia \\d|daqui a|proximo mes|mes que vem|essa semana|esta semana';
// Edit verbs
const EDIT_VERBS = 'mud[ao]r?|alter[ao]r?|trocar?|adiar?|reagend[ao]r?|antecipar?|postergar?|atrasa[r]?|pass[ao]r?|corrig[ei]r?|atualiz[ao]r?|remarca[r]?|transferir?';
// Cancel verbs
const CANCEL_VERBS = 'cancel[ao]r?|desmarc[ao]r?|remov[eo]r?|tir[ao]r?|exclu[ei]r?|delet[ao]r?|apag[ao]r?';

export const agendaPatterns = [
  // --- AGENDAR ---
  {
    intent: IntentType.AGENDAR,
    confidence: 0.85,
    patterns: [
      // Verb + event type
      new RegExp(`\\b(${SCHEDULE_VERBS})\\b.*(${EVENT_TYPES})`, 'i'),
      // Event type + verb (inverted)
      new RegExp(`\\b(${EVENT_TYPES})\\b.*(${SCHEDULE_VERBS})`, 'i'),
      // Verb + day reference
      new RegExp(`\\b(${SCHEDULE_VERBS})\\b.*(${DAY_REFS})`, 'i'),
      // Verb + time
      /\b(marca|agendar?|marcar?)\b.*\b(\d{1,2}[h:]?\d{0,2})\b/,
      // "tenho/tem reunião às X"
      new RegExp(`\\b(tenho|tem)\\b.*(${EVENT_TYPES}).*(as?\\s+\\d)`, 'i'),
      // "preciso agendar", "quero marcar"
      new RegExp(`\\b(preciso|quero|gostaria|pode|da pra|consegue)\\b.*\\b(${SCHEDULE_VERBS})\\b`, 'i'),
      // Informal: "bota na agenda", "coloca na agenda"
      /\b(bot[ae]|coloc[ae]|p[oõ]e|inclui)\b.*\b(agenda)\b/,
      // "agenda pra mim", "agenda isso"
      /\bagenda\b.*\b(pra mim|isso|aqui)\b/,
    ],
    extractEntities: (text: string): ExtractedEntities => ({
      date: extractDateFromText(text),
      time: extractTimeFromText(text),
      title: extractAfterKeyword(text, ['reuniao', 'encontro', 'compromisso', 'consulta', 'visita', 'entrevista', 'apresentacao', 'palestra', 'aula', 'treino', 'sessao']),
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
      /\b(minha|meu)\b.*(agenda|compromissos?|eventos?|horarios?)/,
      /\b(agenda|compromissos?)\b.*(hoje|amanha|semana|mes|proxim)/,
      /\b(como (ta|esta)|qual)\b.*(minha)?\b.*(agenda)/,
      /\blistar?\b.*(agenda|compromissos?|eventos?)/,
      // "mostra minha agenda", "ver agenda", "exibe agenda"
      /\b(mostr[ae]r?|ver|exib[ei]r?|abr[ei]r?|consultar?)\b.*(agenda|compromissos?|eventos?)/,
      // "tenho algo pra hoje?", "tem algo amanhã?"
      /\b(tenho|tem)\b.*\b(algo|alguma coisa|coisa)\b.*(hoje|amanha|semana)/,
      // "o que tem na agenda", "o que tá marcado"
      /\b(o que)\b.*(na agenda|marcado|agendado|previsto)/,
      // "meus horários de hoje/amanhã"
      /\b(meus?)\b.*(horarios?|atividades?)\b.*(hoje|amanha|semana|mes)/,
      // "como está meu dia", "como tá meu dia"
      /\b(como (ta|esta))\b.*(meu dia|minha semana)/,
      // "agenda de hoje", "agenda de amanhã"
      /\bagenda\b.*\b(de\s+)?(hoje|amanha|semana|segunda|terca|quarta|quinta|sexta)/,
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
    confidence: 0.92,
    patterns: [
      // Cancel verb + event type
      new RegExp(`\\b(${CANCEL_VERBS})\\b.*(${EVENT_TYPES})`, 'i'),
      // Event type + cancel verb (inverted)
      new RegExp(`\\b(${EVENT_TYPES})\\b.*(cancel|desmarc|remov|tir[ao]|exclu|delet|apag)`, 'i'),
      // Cancel verb + day reference
      new RegExp(`\\b(${CANCEL_VERBS})\\b.*(${DAY_REFS})`, 'i'),
      // "não vou poder ir", "não vai dar"
      /\b(nao vou|nao vai|nao posso|nao da|nao consigo)\b.*(ir|comparecer).*\b(reuniao|encontro|compromisso|consulta|evento)/,
      // "tira da agenda", "remove da agenda"
      /\b(tir[ae]|remov[eo]|exclu[ei]|apag[ao])\b.*(da\s+)?agenda\b/,
    ],
    extractEntities: (text: string): ExtractedEntities => ({
      date: extractDateFromText(text),
      title: extractAfterKeyword(text, ['reuniao', 'encontro', 'compromisso', 'consulta', 'visita']),
    }),
  },

  // --- EDITAR EVENTO ---
  {
    intent: IntentType.EDITAR_EVENTO,
    confidence: 0.85,
    patterns: [
      // Edit verb + event type
      new RegExp(`\\b(${EDIT_VERBS})\\b.*(${EVENT_TYPES})`, 'i'),
      // Event type + edit verb (inverted)
      new RegExp(`\\b(${EVENT_TYPES})\\b.*(mud[ao]|alter|troc|adi|reagend|antecip|posterg|atras|corrig|atualiz|remarc|transfer)`, 'i'),
      // Edit verb + day reference
      new RegExp(`\\b(${EDIT_VERBS})\\b.*(${DAY_REFS})`, 'i'),
      // Standalone "reagenda" (strong signal)
      /\b(reagend[ao]r?)\b/,
      // "troca o horário", "muda o horário", "altera o horário"
      /\b(mud[ao]r?|alter[ao]r?|trocar?|corrig[ei]r?)\b.*\b(horario|hora|data|dia)\b/,
      // "passa pra sexta", "transfere pra segunda"
      /\b(pass[ao]r?|transfer[ei]r?|jog[ao]r?|empurr[ao]r?)\b.*\b(pra|para)\b.*(segunda|terca|quarta|quinta|sexta|sabado|domingo|amanha|semana)/,
      // "antecipa a reunião", "posterga o evento"
      /\b(antecip[ao]r?|posterg[ao]r?|atras[ao]r?|adiant[ao]r?)\b/,
      // "na verdade a reunião é às 15h" (implicit correction)
      /\b(na verdade|na real|corrigindo|errei)\b.*(reuniao|encontro|compromisso|consulta|evento|horario)/,
      // "muda pra 15h", "troca pra amanhã"
      /\b(mud[ao]r?|trocar?|pass[ao]r?)\b.*\b(pra|para)\b.*\b(\d{1,2}[h:]|\d{1,2}\/|amanha|segunda|terca|quarta|quinta|sexta)/,
    ],
    extractEntities: (text: string): ExtractedEntities => ({
      date: extractDateFromText(text),
      time: extractTimeFromText(text),
      title: extractAfterKeyword(text, ['reuniao', 'encontro', 'compromisso', 'consulta', 'visita']),
      person: extractPerson(text),
    }),
  },
];
