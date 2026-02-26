/**
 * Extrai um valor monetário de um texto em português.
 * Suporta: "150", "1.500", "1.500,00", "R$ 150", "150 reais", "2k", "2 mil"
 */
export function extractCurrency(text: string): number | undefined {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');

  // "2k", "3k", "5k"
  const kMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*k\b/);
  if (kMatch) {
    return parseFloat(kMatch[1].replace(',', '.')) * 1000;
  }

  // "2 mil", "3 mil"
  const milMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*mil\b/);
  if (milMatch) {
    return parseFloat(milMatch[1].replace(',', '.')) * 1000;
  }

  // "R$ 1.500,00" ou "R$1500"
  const rMatch = normalized.match(/r\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)/);
  if (rMatch) {
    return parseBRL(rMatch[1]);
  }

  // "1.500,00 reais" ou "150 reais"
  const reaisMatch = normalized.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)\s*(?:reais|real|conto)/);
  if (reaisMatch) {
    return parseBRL(reaisMatch[1]);
  }

  // Último recurso: qualquer número no texto
  const anyNumber = normalized.match(/\b(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)\b/);
  if (anyNumber) {
    return parseBRL(anyNumber[1]);
  }

  return undefined;
}

/**
 * Converte string BRL (1.500,00) para número (1500.00).
 */
function parseBRL(value: string): number {
  // Remove pontos de milhar e troca vírgula por ponto decimal
  const cleaned = value.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}
