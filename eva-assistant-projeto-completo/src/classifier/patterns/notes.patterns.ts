import { IntentType, ExtractedEntities } from '../../types';

// Keywords that signal a note/reminder intent
const NOTE_VERBS = 'anot[ae]r?|lembr[ae]r?|salv[ae]r?|guard[ae]r?|registr[ae]r?|grav[ae]r?|escrev[ae]r?|marc[ae]r?';
const NOTE_NOUNS = 'nota|lembrete|anotacao|recado|observacao|memo|memorando|aviso';
const NOTE_INFORMAL = 'nao (me )?deixa esquecer|pra (eu )?nao esquecer|antes que eu esqueca|preciso lembrar|nao posso esquecer|tenho que lembrar';

/**
 * Cleans the note content by removing command prefixes and filler words,
 * extracting only the meaningful content the user wants to save.
 */
function extractNoteContent(text: string): string {
  let content = text;

  // Remove command prefixes (verbs + optional colon/dash)
  content = content.replace(
    /^(?:eva\s*[,:]?\s*)?(?:anot[ae]r?|lembr[ae]r?|salv[ae]r?|guard[ae]r?|registr[ae]r?|grav[ae]r?|escrev[ae]r?)\s*(?:isso|aqui|ai|que|de|o|a|um|uma)?\s*[:\-]?\s*/i,
    ''
  );

  // Remove noun-based prefixes
  content = content.replace(
    /^(?:cri[ae]r?\s+)?(?:uma?\s+)?(?:nota|lembrete|anotacao|recado|observacao|memo|aviso)\s*[:\-]?\s*/i,
    ''
  );

  // Remove informal prefixes
  content = content.replace(
    /^(?:nao (?:me )?deixa esquecer|pra (?:eu )?nao esquecer|antes que eu esqueca|preciso lembrar|nao posso esquecer|tenho que lembrar)\s*(?:que|de|do|da|o|a)?\s*[:\-]?\s*/i,
    ''
  );

  // Remove "por favor" / "pfv" / "pf"
  content = content.replace(/\s*(?:por favor|pfv|pf)\s*/gi, ' ');

  // Remove leading filler: "que", "de que", "isso:", "o seguinte:"
  content = content.replace(/^(?:que|de que|isso|o seguinte)\s*[:\-]?\s*/i, '');

  return content.trim() || text;
}

export const notesPatterns = [
  // --- ANOTAR ---
  {
    intent: IntentType.ANOTAR,
    confidence: 0.85,
    patterns: [
      // Verb + content (with optional colon/dash separator)
      new RegExp(`\\b(${NOTE_VERBS})\\b\\s*[:\\-]?\\s+(.+)`, 'i'),
      // Noun + content
      new RegExp(`\\b(${NOTE_NOUNS})\\b\\s*[:\\-]\\s*(.+)`, 'i'),
      // Informal expressions that imply saving
      new RegExp(`(${NOTE_INFORMAL})`, 'i'),
      // "cria uma nota", "faz uma anotação"
      /\b(cri[ae]r?|faz(?:er)?|fac[ao])\b.*\b(nota|lembrete|anotacao|recado)\b/,
      // Standalone verbs (lower confidence, caught by the pattern order)
      new RegExp(`\\b(${NOTE_VERBS})\\b`, 'i'),
      // "quero anotar", "preciso salvar", "pode anotar"
      /\b(quero|preciso|pode|consegue|da pra)\b.*\b(anot|salv|lembr|guard|registr|grav)/,
      // "bota isso na nota", "coloca no lembrete"
      /\b(bot[ae]|coloc[ae]|p[oõ]e)\b.*\b(nota|lembrete|anotacao)\b/,
      // "me lembra de/que" (common phrasing)
      /\bme\s+lembr[ae]\b.*\b(de|que)\b/,
    ],
    extractEntities: (text: string): ExtractedEntities => {
      return {
        description: extractNoteContent(text),
      };
    },
  },

  // --- LISTAR NOTAS ---
  {
    intent: IntentType.LISTAR_NOTAS,
    confidence: 0.9,
    patterns: [
      /\b(minhas?|meus?)\b.*(notas?|anotac[oõ]es?|lembretes?|recados?|observac[oõ]es?)/,
      /\b(listar?|mostr[ae]r?|ver|exib[ei]r?|abr[ei]r?|consultar?|buscar?)\b.*(notas?|anotac[oõ]es?|lembretes?|recados?)/,
      /\b(quais?|quai?s)\b.*(notas?|anotac[oõ]es?|lembretes?|recados?)/,
      // "o que eu anotei", "o que salvei", "o que tenho anotado"
      /\b(o que)\b.*(anotei|salvei|guardei|registrei|gravei|tenho anotado|tenho salvo)/,
      // "tem algum lembrete?", "tem nota?"
      /\b(tem|tenho|existe)\b.*\b(lembrete|nota|anotacao|recado)\b/,
    ],
    extractEntities: (): ExtractedEntities => ({}),
  },
];
