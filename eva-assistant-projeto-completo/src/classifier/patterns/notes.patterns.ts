import { IntentType, ExtractedEntities } from '../../types';

export const notesPatterns = [
  // --- ANOTAR ---
  {
    intent: IntentType.ANOTAR,
    confidence: 0.85,
    patterns: [
      /\b(anot[ae]r?|lembr[ae]r?|salv[ae]r?)\b[:\s]+(.+)/,
      /\b(nota|lembrete|anotacao)[:\s]+(.+)/,
      /\b(anot[ae]|lembr[ae])\b/,
    ],
    extractEntities: (text: string): ExtractedEntities => {
      // Extrai o conteúdo após palavras-chave de anotação
      const match = text.match(/(?:anot[ae]r?|lembr[ae]r?|salv[ae]r?|nota|lembrete)[:\s]+(.+)/);
      return {
        description: match ? match[1].trim() : text,
      };
    },
  },

  // --- LISTAR NOTAS ---
  {
    intent: IntentType.LISTAR_NOTAS,
    confidence: 0.9,
    patterns: [
      /\b(minhas?|meus?)\b.*(notas?|anotac[oõ]es?|lembretes?)/,
      /\b(listar?|mostr[ae]r?|ver)\b.*(notas?|anotac[oõ]es?|lembretes?)/,
      /\b(quais?|quai?s)\b.*(notas?|anotac[oõ]es?|lembretes?)/,
    ],
    extractEntities: (): ExtractedEntities => ({}),
  },
];
