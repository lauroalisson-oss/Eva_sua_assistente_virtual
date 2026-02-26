import Anthropic from '@anthropic-ai/sdk';
import { ClassificationResult, IntentType, ExtractedEntities } from '../types';
import { env } from '../config/env';
import * as fs from 'fs';
import * as path from 'path';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// Carregar system prompt do arquivo
const classifierPromptPath = path.join(process.cwd(), 'prompts', 'classifier.txt');
let classifierPrompt = '';

try {
  classifierPrompt = fs.readFileSync(classifierPromptPath, 'utf-8');
} catch {
  console.warn('⚠️ Arquivo prompts/classifier.txt não encontrado, usando prompt padrão');
  classifierPrompt = `Você é um classificador de intenções para um assistente virtual chamado EVA.
Analise a mensagem do usuário e retorne APENAS um JSON válido com:
- intent: uma das seguintes: AGENDAR, LISTAR_AGENDA, CANCELAR_EVENTO, REGISTRAR_DESPESA, REGISTRAR_RECEITA, CONSULTAR_SALDO, DEFINIR_LIMITE, ANOTAR, LISTAR_NOTAS, RELATORIO, AJUDA, SAUDACAO, DESCONHECIDO
- entities: objeto com dados extraídos (date, time, amount, category, title, description, location, person, period)
- confidence: número de 0 a 1

Regras:
- "date" deve ser ISO string relativa a hoje
- "amount" deve ser número (sem R$)
- "category" para despesas: alimentacao, transporte, moradia, contas, saude, educacao, lazer, impostos, outros
- "category" para receitas: vendas, servicos, salario, comissoes, rendimentos, outros
- Responda SOMENTE com o JSON, sem explicações`;
}

class AIClassifier {
  /**
   * Classifica a mensagem usando Claude API (Haiku).
   * Usado como fallback quando as regras não conseguem classificar.
   */
  async classify(text: string): Promise<ClassificationResult> {
    const today = new Date().toISOString().split('T')[0];

    const message = await anthropic.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 300,
      system: classifierPrompt + `\n\nData de hoje: ${today}`,
      messages: [
        { role: 'user', content: text },
      ],
    });

    // Extrair texto da resposta
    const responseText =
      message.content[0].type === 'text' ? message.content[0].text : '';

    try {
      // Limpar possíveis artefatos de markdown
      const cleanJson = responseText
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      const parsed = JSON.parse(cleanJson) as {
        intent: string;
        entities: ExtractedEntities;
        confidence: number;
      };

      // Validar que o intent é válido
      const intent = IntentType[parsed.intent as keyof typeof IntentType] || IntentType.DESCONHECIDO;

      return {
        intent,
        entities: parsed.entities || {},
        confidence: Math.min(parsed.confidence || 0.8, 1),
        source: 'ai',
      };
    } catch (parseError) {
      console.error('❌ Falha ao parsear resposta da IA:', responseText);
      return {
        intent: IntentType.DESCONHECIDO,
        entities: {},
        confidence: 0.3,
        source: 'ai',
      };
    }
  }
}

export const aiClassifier = new AIClassifier();
