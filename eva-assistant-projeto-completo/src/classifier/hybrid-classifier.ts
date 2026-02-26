import { ClassificationResult, IntentType } from '../types';
import { ruleEngine } from './rule-engine';
import { aiClassifier } from './ai-classifier';

const CONFIDENCE_THRESHOLD = 0.7;

class HybridClassifier {
  /**
   * Classifica uma mensagem usando o motor híbrido:
   * 1. Tenta classificar por regras (custo zero, <10ms)
   * 2. Se confidence < threshold, usa Claude API como fallback
   */
  async classify(text: string): Promise<ClassificationResult> {
    const normalizedText = this.normalize(text);

    // Camada 1: Classificação por regras
    const ruleResult = ruleEngine.classify(normalizedText);

    if (ruleResult.confidence >= CONFIDENCE_THRESHOLD) {
      return ruleResult;
    }

    // Camada 2: Fallback para IA generativa
    try {
      const aiResult = await aiClassifier.classify(text); // texto original (não normalizado)
      return aiResult;
    } catch (error) {
      console.error('❌ Falha na classificação por IA, usando resultado das regras:', error);
      // Se a IA falhar, retorna o melhor resultado das regras (mesmo com baixa confidence)
      return ruleResult.intent !== IntentType.DESCONHECIDO
        ? ruleResult
        : { intent: IntentType.DESCONHECIDO, entities: {}, confidence: 0, source: 'rules' };
    }
  }

  /**
   * Normaliza o texto para melhor matching de regras.
   * Remove acentos, converte para lowercase, normaliza espaços.
   */
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/\s+/g, ' ')           // Normaliza espaços
      .trim();
  }
}

export const hybridClassifier = new HybridClassifier();
