import { addDays, nextMonday, nextTuesday, nextWednesday, nextThursday, nextFriday, nextSaturday, nextSunday, format } from 'date-fns';

/**
 * Extrai uma data de um texto em português brasileiro.
 * Retorna ISO string (YYYY-MM-DD) ou undefined.
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

  // "amanha" / "amanhã"
  if (/\bamanha\b/.test(normalized)) {
    return format(addDays(today, 1), 'yyyy-MM-dd');
  }

  // "depois de amanha"
  if (/\bdepois de amanha\b/.test(normalized)) {
    return format(addDays(today, 2), 'yyyy-MM-dd');
  }

  // Dias da semana: "segunda", "terça", etc.
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
    if (new RegExp(`\\b${day}\\b`).test(normalized)) {
      return format(nextFn(today), 'yyyy-MM-dd');
    }
  }

  // Data explícita: "15/03", "15/03/2026", "15 de março"
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
 */
export function extractTimeFromText(text: string): string | undefined {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');

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

  return undefined;
}
