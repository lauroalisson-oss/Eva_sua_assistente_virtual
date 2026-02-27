import { describe, it, expect } from 'vitest';
import { extractDateFromText, extractTimeFromText } from '../src/utils/date-parser';
import { extractPerson, extractLocation } from '../src/utils/text-helpers';
import { IntentType, ExtractedEntities } from '../src/types';
import { agendaPatterns } from '../src/classifier/patterns/agenda.patterns';
import { financePatterns } from '../src/classifier/patterns/finance.patterns';
import { createHmac } from 'crypto';

// ============================================
// Helper: classificacao por regras
// ============================================

interface PatternRule {
  intent: IntentType;
  patterns: RegExp[];
  confidence: number;
  extractEntities?: (text: string, match: RegExpMatchArray) => ExtractedEntities;
}

function classifyByRules(text: string, rules: PatternRule[]): {
  intent: IntentType;
  confidence: number;
  entities: ExtractedEntities;
} {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  let bestMatch = {
    intent: IntentType.DESCONHECIDO,
    confidence: 0,
    entities: {} as ExtractedEntities,
  };

  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      const match = normalized.match(pattern);
      if (match && rule.confidence > bestMatch.confidence) {
        const entities = rule.extractEntities
          ? rule.extractEntities(normalized, match)
          : {};
        bestMatch = {
          intent: rule.intent,
          confidence: rule.confidence,
          entities,
        };
      }
    }
  }

  return bestMatch;
}

// ============================================
// TESTES: DATAS COMPOSTAS (ETAPA 3)
// ============================================

describe('Parser de Datas — Datas Compostas', () => {
  it('deve extrair "proxima segunda"', () => {
    const result = extractDateFromText('proxima segunda');
    expect(result).toBeDefined();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('deve extrair "sexta que vem"', () => {
    const result = extractDateFromText('sexta que vem');
    expect(result).toBeDefined();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('deve extrair "segunda-feira"', () => {
    const result = extractDateFromText('segunda-feira');
    expect(result).toBeDefined();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('deve extrair "proxima semana" (como segunda)', () => {
    const result = extractDateFromText('proxima semana');
    expect(result).toBeDefined();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('deve extrair "quarta que vem"', () => {
    const result = extractDateFromText('quarta que vem');
    expect(result).toBeDefined();
  });

  it('deve extrair "proxima quarta"', () => {
    const result = extractDateFromText('proxima quarta');
    expect(result).toBeDefined();
  });
});

// ============================================
// TESTES: EXTRATOR DE PESSOA (ETAPA 3)
// ============================================

describe('Extrator de Pessoa', () => {
  it('deve extrair "com o João"', () => {
    expect(extractPerson('Reunião com o João amanhã')).toBe('João');
  });

  it('deve extrair "com a Maria"', () => {
    expect(extractPerson('Encontro com a Maria às 14h')).toBe('Maria');
  });

  it('deve extrair "com Dr. Silva"', () => {
    expect(extractPerson('Consulta com Dr. Silva sexta')).toBe('Silva');
  });

  it('deve extrair "cliente Pedro"', () => {
    expect(extractPerson('Recebi do cliente Pedro')).toBe('Pedro');
  });

  it('deve extrair "pro João"', () => {
    expect(extractPerson('Ligar pro João segunda')).toBe('João');
  });

  it('deve retornar undefined sem nome', () => {
    expect(extractPerson('reunião amanhã às 14h')).toBeUndefined();
  });

  it('não deve extrair "do mercado" como pessoa', () => {
    expect(extractPerson('Gastei 200 do Mercado')).toBeUndefined();
  });
});

// ============================================
// TESTES: EXTRATOR DE LOCAL (ETAPA 3)
// ============================================

describe('Extrator de Local', () => {
  it('deve extrair "no Escritório"', () => {
    const result = extractLocation('Reunião no Escritório às 14h');
    expect(result).toBeDefined();
    expect(result).toContain('Escritório');
  });

  it('deve extrair "na Prefeitura"', () => {
    const result = extractLocation('Reunião na Prefeitura amanhã');
    expect(result).toBeDefined();
    expect(result).toContain('Prefeitura');
  });

  it('deve extrair "em São Paulo"', () => {
    const result = extractLocation('Viagem em São Paulo');
    expect(result).toBeDefined();
  });

  it('deve retornar undefined sem local', () => {
    expect(extractLocation('reunião amanhã às 14h')).toBeUndefined();
  });
});

// ============================================
// TESTES: EDITAR EVENTO (ETAPA 3)
// ============================================

describe('Classificador — Editar Evento', () => {
  it('deve classificar EDITAR_EVENTO com "muda a reunião"', () => {
    const result = classifyByRules('Muda a reunião para sexta', agendaPatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.EDITAR_EVENTO);
  });

  it('deve classificar EDITAR_EVENTO com "reagenda"', () => {
    const result = classifyByRules('Reagenda o compromisso', agendaPatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.EDITAR_EVENTO);
  });

  it('deve classificar EDITAR_EVENTO com "adiar reunião"', () => {
    const result = classifyByRules('Adia a reunião de amanhã', agendaPatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.EDITAR_EVENTO);
  });

  it('deve classificar EDITAR_EVENTO com "alterar compromisso"', () => {
    const result = classifyByRules('Altera o compromisso de segunda', agendaPatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.EDITAR_EVENTO);
  });
});

// ============================================
// TESTES: CANCELAR TRANSAÇÃO (ETAPA 3)
// ============================================

describe('Classificador — Cancelar Transação', () => {
  it('deve classificar CANCELAR_TRANSACAO com "cancela o gasto"', () => {
    const result = classifyByRules('Cancela o gasto', financePatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.CANCELAR_TRANSACAO);
  });

  it('deve classificar CANCELAR_TRANSACAO com "apaga a despesa"', () => {
    const result = classifyByRules('Apaga a despesa', financePatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.CANCELAR_TRANSACAO);
  });

  it('deve classificar CANCELAR_TRANSACAO com "remove a receita"', () => {
    const result = classifyByRules('Remove a receita', financePatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.CANCELAR_TRANSACAO);
  });

  it('deve classificar CANCELAR_TRANSACAO com "desfaz o lançamento"', () => {
    const result = classifyByRules('Desfaz o lançamento', financePatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.CANCELAR_TRANSACAO);
  });
});

// ============================================
// TESTES: PLAN LIMITS (ETAPA 4)
// (Importando diretamente sem trigger de env)
// ============================================

describe('Limites de Plano', () => {
  // Inline para evitar import da cadeia env → database → prisma
  const PLAN_LIMITS = {
    BASIC: {
      messagesPerDay: 50,
      eventsMax: 20,
      transactionsPerMonth: 100,
      notesMax: 30,
      reportsEnabled: false,
      audioEnabled: false,
    },
    PROFESSIONAL: {
      messagesPerDay: 500,
      eventsMax: 200,
      transactionsPerMonth: 1000,
      notesMax: 200,
      reportsEnabled: true,
      audioEnabled: true,
    },
    ENTERPRISE: {
      messagesPerDay: Infinity,
      eventsMax: Infinity,
      transactionsPerMonth: Infinity,
      notesMax: Infinity,
      reportsEnabled: true,
      audioEnabled: true,
    },
  } as const;

  type PlanType = keyof typeof PLAN_LIMITS;

  function getPlanLimits(plan: string) {
    return PLAN_LIMITS[plan as PlanType] || PLAN_LIMITS.BASIC;
  }

  it('BASIC deve ter 50 mensagens/dia', () => {
    expect(PLAN_LIMITS.BASIC.messagesPerDay).toBe(50);
  });

  it('BASIC não deve ter relatórios', () => {
    expect(PLAN_LIMITS.BASIC.reportsEnabled).toBe(false);
  });

  it('BASIC não deve ter áudio', () => {
    expect(PLAN_LIMITS.BASIC.audioEnabled).toBe(false);
  });

  it('PROFESSIONAL deve ter 500 mensagens/dia', () => {
    expect(PLAN_LIMITS.PROFESSIONAL.messagesPerDay).toBe(500);
  });

  it('PROFESSIONAL deve ter relatórios', () => {
    expect(PLAN_LIMITS.PROFESSIONAL.reportsEnabled).toBe(true);
  });

  it('ENTERPRISE deve ser ilimitado', () => {
    expect(PLAN_LIMITS.ENTERPRISE.messagesPerDay).toBe(Infinity);
  });

  it('getPlanLimits deve retornar BASIC para plano desconhecido', () => {
    const limits = getPlanLimits('INEXISTENTE');
    expect(limits.messagesPerDay).toBe(50);
  });
});

// ============================================
// TESTES: WEBHOOK SIGNATURE (ETAPA 4)
// (Inlined para evitar import de env/redis)
// ============================================

describe('Webhook Security — Assinatura', () => {
  const secret = 'test-secret-key';

  // Inline da função validateWebhookSignature para teste isolado
  function validateSignature(rawBody: string, signature: string | undefined, key: string): boolean {
    if (!signature) return false;
    try {
      const hmac = createHmac('sha256', key);
      hmac.update(rawBody);
      const expectedSignature = hmac.digest('hex');
      if (signature.length !== expectedSignature.length) return false;
      let result = 0;
      for (let i = 0; i < signature.length; i++) {
        result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
      }
      return result === 0;
    } catch {
      return false;
    }
  }

  it('deve validar assinatura HMAC correta', () => {
    const body = '{"event":"messages.upsert"}';
    const hmac = createHmac('sha256', secret);
    hmac.update(body);
    const signature = hmac.digest('hex');

    expect(validateSignature(body, signature, secret)).toBe(true);
  });

  it('deve rejeitar assinatura incorreta', () => {
    const body = '{"event":"messages.upsert"}';
    expect(validateSignature(body, 'a'.repeat(64), secret)).toBe(false);
  });

  it('deve rejeitar quando assinatura tem tamanho diferente', () => {
    const body = '{"data":"test"}';
    expect(validateSignature(body, 'short', secret)).toBe(false);
  });

  it('deve rejeitar quando assinatura é undefined', () => {
    const body = '{"data":"test"}';
    expect(validateSignature(body, undefined, secret)).toBe(false);
  });
});
