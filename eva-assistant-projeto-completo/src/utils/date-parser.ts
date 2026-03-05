import { addDays, addWeeks, addMonths, nextMonday, nextTuesday, nextWednesday, nextThursday, nextFriday, nextSaturday, nextSunday, format, startOfMonth } from 'date-fns';

/**
 * Extrai uma data de um texto em português brasileiro.
 * Retorna ISO string (YYYY-MM-DD) ou undefined.
 *
 * Suporta:
 * - Relativas: "hoje", "amanhã", "depois de amanhã"
 * - Relativas numéricas: "daqui a 3 dias", "em 2 semanas", "em 1 mês"
 * - Dias da semana: "segunda", "próxima quarta", "sexta que vem", "segunda-feira"
 * - Próxima semana/mês: "próxima semana", "próximo mês", "mês que vem"
 * - Explícitas: "15/03", "15/03/2026", "15-03"
 * - Por extenso: "15 de março", "dia 20 de abril"
 * - Começo/fim de mês: "começo do mês", "final do mês", "fim do mês que vem"
 */
export function extractDateFromText(text: string): string | undefined {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const today = new Date();

  // "hoje"
  if (/\bhoje\b/.test(normalized)) {
    return format(today, 'yyyy-MM-dd');
  }

  // "depois de amanha" (must come before "amanha" check)
  if (/\bdepois de amanha\b/.test(normalized)) {
    return format(addDays(today, 2), 'yyyy-MM-dd');
  }

  // "amanha" / "amanhã"
  if (/\bamanha\b/.test(normalized)) {
    return format(addDays(today, 1), 'yyyy-MM-dd');
  }

  // "daqui a X dias", "em X dias", "dentro de X dias"
  const daysAhead = normalized.match(/(?:daqui\s+a|em|dentro\s+de)\s+(\d+)\s+dias?\b/);
  if (daysAhead) {
    return format(addDays(today, parseInt(daysAhead[1])), 'yyyy-MM-dd');
  }

  // "daqui a X semanas", "em X semanas", "dentro de X semanas"
  const weeksAhead = normalized.match(/(?:daqui\s+a|em|dentro\s+de)\s+(\d+)\s+semanas?\b/);
  if (weeksAhead) {
    return format(addWeeks(today, parseInt(weeksAhead[1])), 'yyyy-MM-dd');
  }

  // "daqui a X meses", "em X meses", "dentro de X meses"
  const monthsAhead = normalized.match(/(?:daqui\s+a|em|dentro\s+de)\s+(\d+)\s+m[eê]s(?:es)?\b/);
  if (monthsAhead) {
    return format(addMonths(today, parseInt(monthsAhead[1])), 'yyyy-MM-dd');
  }

  // "proximo mes", "mes que vem"
  if (/\bproxim[ao]\s+mes\b/.test(normalized) || /\bmes\s+que\s+vem\b/.test(normalized)) {
    return format(startOfMonth(addMonths(today, 1)), 'yyyy-MM-dd');
  }

  // "proxima semana" (segunda que vem)
  if (/\bproxima\s+semana\b/.test(normalized) || /\bsemana\s+que\s+vem\b/.test(normalized)) {
    return format(nextMonday(today), 'yyyy-MM-dd');
  }

  // "comeco/inicio do mes" → dia 1 do mês atual
  if (/\b(comeco|inicio)\s+(do|de)\s+mes\b/.test(normalized)) {
    return format(startOfMonth(today), 'yyyy-MM-dd');
  }

  // "final/fim do mes" → último dia do mês
  if (/\b(final|fim|ultimo dia)\s+(do|de)\s+mes\b/.test(normalized)) {
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return format(lastDay, 'yyyy-MM-dd');
  }

  // Dias da semana: "segunda", "proxima quarta", "sexta que vem", etc.
  const dayMap: Record<string, (date: Date) => Date> = {
    'segunda': nextMonday,
    'terca': nextTuesday,
    'quarta': nextWednesday,
    'quinta': nextThursday,
    'sexta': nextFriday,
    'sabado': nextSaturday,
    'domingo': nextSunday,
  };

  for (const [day, nextFn] of Object.entries(dayMap)) {
    // Captura: "proxima segunda", "segunda que vem", "na segunda", "segunda-feira", "segunda"
    if (new RegExp(`(?:proxim[ao]\\s+)?\\b${day}(?:-feira)?\\b(?:\\s+que\\s+vem)?`).test(normalized)) {
      return format(nextFn(today), 'yyyy-MM-dd');
    }
  }

  // Data explícita: "15/03", "15/03/2026", "15-03", "15-03-2026"
  const explicitDate = normalized.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (explicitDate) {
    const day = parseInt(explicitDate[1]);
    const month = parseInt(explicitDate[2]);
    const year = explicitDate[3]
      ? parseInt(explicitDate[3].length === 2 ? `20${explicitDate[3]}` : explicitDate[3])
      : today.getFullYear();
    return format(new Date(year, month - 1, day), 'yyyy-MM-dd');
  }

  // Meses por extenso: "15 de março", "dia 20 de abril"
  const months: Record<string, number> = {
    janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5,
    julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
  };

  const extensoMatch = normalized.match(/(?:dia\s+)?(\d{1,2})\s+de\s+(\w+)/);
  if (extensoMatch) {
    const day = parseInt(extensoMatch[1]);
    const monthName = extensoMatch[2];
    if (monthName in months) {
      return format(new Date(today.getFullYear(), months[monthName], day), 'yyyy-MM-dd');
    }
  }

  return undefined;
}

/**
 * Extrai horário de um texto em português.
 * Retorna HH:mm ou undefined.
 *
 * Suporta:
 * - Numéricos: "14h", "14h30", "14:30", "às 14h"
 * - Nomeados: "meio dia", "meia noite"
 * - Fuzzy: "de manhã", "à tarde", "à noite", "de madrugada"
 * - Período: "começo da tarde", "final da manhã", "fim da noite"
 */
export function extractTimeFromText(text: string): string | undefined {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

  // "14h", "14h30", "14:30", "às 14h"
  const timeMatch = normalized.match(/(\d{1,2})\s*[h:]\s*(\d{0,2})/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  // "meio dia" / "meio-dia"
  if (/meio[- ]?dia/.test(normalized)) return '12:00';

  // "meia noite" / "meia-noite"
  if (/meia[- ]?noite/.test(normalized)) return '00:00';

  // Fuzzy time periods (only used as fallback when no exact time is given)
  // "começo/início da manhã", "cedo"
  if (/\b(comeco|inicio)\s+(da\s+)?manha\b/.test(normalized) || /\bcedo\b/.test(normalized)) return '08:00';
  // "de manhã", "pela manhã"
  if (/\b(de|pela|na)\s+manha\b/.test(normalized)) return '09:00';
  // "final da manhã", "fim da manhã"
  if (/\b(final|fim)\s+(da\s+)?manha\b/.test(normalized)) return '11:00';
  // "começo/início da tarde"
  if (/\b(comeco|inicio)\s+(da\s+)?tarde\b/.test(normalized)) return '13:00';
  // "de tarde", "à tarde", "pela tarde"
  if (/\b(de|a|pela|na)\s+tarde\b/.test(normalized)) return '14:00';
  // "final da tarde", "fim da tarde"
  if (/\b(final|fim)\s+(da\s+)?tarde\b/.test(normalized)) return '17:00';
  // "de noite", "à noite", "pela noite"
  if (/\b(de|a|pela|na)\s+noite\b/.test(normalized)) return '19:00';
  // "de madrugada"
  if (/\b(de\s+)?madrugada\b/.test(normalized)) return '05:00';

  return undefined;
}
