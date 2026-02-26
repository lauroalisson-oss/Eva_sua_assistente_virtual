import { ClassificationResult, IntentType, ExtractedEntities } from '../types';
import { agendaPatterns } from './patterns/agenda.patterns';
import { financePatterns } from './patterns/finance.patterns';
import { notesPatterns } from './patterns/notes.patterns';
import { systemPatterns } from './patterns/system.patterns';

interface PatternRule {
  intent: IntentType;
  patterns: RegExp[];
  confidence: number;
  extractEntities?: (text: string, match: RegExpMatchArray) => ExtractedEntities;
}

class RuleEngine {
  private rules: PatternRule[];

  constructor() {
    // Carregar todas as regras (ordem importa: mais específico primeiro)
    this.rules = [
      ...agendaPatterns,
      ...financePatterns,
      ...notesPatterns,
      ...systemPatterns,
    ];
  }

  /**
   * Tenta classificar a mensagem usando patterns de regex.
   * Retorna o primeiro match com maior confidence.
   */
  classify(normalizedText: string): ClassificationResult {
    let bestMatch: ClassificationResult = {
      intent: IntentType.DESCONHECIDO,
      entities: {},
      confidence: 0,
      source: 'rules',
    };

    for (const rule of this.rules) {
      for (const pattern of rule.patterns) {
        const match = normalizedText.match(pattern);
        if (match && rule.confidence > bestMatch.confidence) {
          const entities = rule.extractEntities
            ? rule.extractEntities(normalizedText, match)
            : {};

          bestMatch = {
            intent: rule.intent,
            entities,
            confidence: rule.confidence,
            source: 'rules',
          };
        }
      }
    }

    return bestMatch;
  }
}

export const ruleEngine = new RuleEngine();
