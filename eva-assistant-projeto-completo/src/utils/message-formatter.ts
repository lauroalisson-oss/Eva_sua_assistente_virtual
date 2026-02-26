import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Formata uma data para exibição amigável no WhatsApp.
 * Ex: "Qui, 27/02 às 14:00"
 */
export function formatDateBR(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, "EEE, dd/MM 'às' HH:mm", { locale: ptBR });
}

/**
 * Formata um valor monetário para BRL.
 * Ex: 1500.5 → "R$ 1.500,50"
 */
export function formatCurrencyBR(amount: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amount);
}

/**
 * Formata porcentagem.
 * Ex: 0.806 → "80,6%"
 */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1).replace('.', ',')}%`;
}

/**
 * Cria barra de progresso visual para WhatsApp.
 * Ex: "████████░░ 80%"
 */
export function progressBar(current: number, max: number, length: number = 10): string {
  const ratio = Math.min(current / max, 1);
  const filled = Math.round(ratio * length);
  const empty = length - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `${bar} ${formatPercent(ratio)}`;
}
