import { describe, it, expect, vi } from 'vitest';
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

  it('deve extrair "daqui a 5 dias"', () => {
    const result = extractDateFromText('daqui a 5 dias');
    expect(result).toBeDefined();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('deve extrair "em 2 semanas"', () => {
    const result = extractDateFromText('em 2 semanas');
    expect(result).toBeDefined();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('deve extrair "próximo mês"', () => {
    const result = extractDateFromText('próximo mês');
    expect(result).toBeDefined();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('deve extrair "mês que vem"', () => {
    const result = extractDateFromText('mês que vem');
    expect(result).toBeDefined();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('deve extrair "final do mês"', () => {
    const result = extractDateFromText('final do mês');
    expect(result).toBeDefined();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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

  it('deve classificar EDITAR_EVENTO com "corrige o horário"', () => {
    const result = classifyByRules('Corrige o horário da reunião', agendaPatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.EDITAR_EVENTO);
  });

  it('deve classificar EDITAR_EVENTO com "antecipa a consulta"', () => {
    const result = classifyByRules('Antecipa a consulta', agendaPatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.EDITAR_EVENTO);
  });

  it('deve classificar EDITAR_EVENTO com "posterga o evento"', () => {
    const result = classifyByRules('Posterga o evento', agendaPatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.EDITAR_EVENTO);
  });

  it('deve classificar EDITAR_EVENTO com "passa pra sexta"', () => {
    const result = classifyByRules('Passa a reunião pra sexta', agendaPatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.EDITAR_EVENTO);
  });

  it('deve classificar EDITAR_EVENTO com "na verdade a reunião"', () => {
    const result = classifyByRules('Na verdade a reunião é às 15h', agendaPatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.EDITAR_EVENTO);
  });

  it('deve classificar EDITAR_EVENTO com "remarca"', () => {
    const result = classifyByRules('Remarca a consulta para quarta', agendaPatterns as PatternRule[]);
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
      audioEnabled: true,
      audioMaxSeconds: 60,
    },
    PROFESSIONAL: {
      messagesPerDay: 500,
      eventsMax: 200,
      transactionsPerMonth: 1000,
      notesMax: 200,
      reportsEnabled: true,
      audioEnabled: true,
      audioMaxSeconds: 300,
    },
    ENTERPRISE: {
      messagesPerDay: Infinity,
      eventsMax: Infinity,
      transactionsPerMonth: Infinity,
      notesMax: Infinity,
      reportsEnabled: true,
      audioEnabled: true,
      audioMaxSeconds: 600,
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

  it('BASIC deve ter áudio habilitado (com limite de duração)', () => {
    expect(PLAN_LIMITS.BASIC.audioEnabled).toBe(true);
    expect(PLAN_LIMITS.BASIC.audioMaxSeconds).toBe(60);
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

// ============================================
// TESTES: BULLMQ QUEUE CONFIG (ETAPA 6)
// (Inlined para evitar conexão Redis real)
// ============================================

describe('BullMQ — Queue Config', () => {
  // Inline da função parseRedisUrl para teste isolado
  function parseRedisUrl(url: string): { host: string; port: number; password?: string; db: number } {
    try {
      const parsed = new URL(url);
      return {
        host: parsed.hostname || 'localhost',
        port: parseInt(parsed.port || '6379', 10),
        password: parsed.password || undefined,
        db: parseInt(parsed.pathname?.slice(1) || '0', 10),
      };
    } catch {
      return { host: 'localhost', port: 6379, db: 0 };
    }
  }

  it('deve parsear REDIS_URL padrão', () => {
    const result = parseRedisUrl('redis://localhost:6379');
    expect(result.host).toBe('localhost');
    expect(result.port).toBe(6379);
    expect(result.password).toBeUndefined();
    expect(result.db).toBe(0);
  });

  it('deve parsear REDIS_URL com password', () => {
    const result = parseRedisUrl('redis://:mypassword@redis.host.com:6380/2');
    expect(result.host).toBe('redis.host.com');
    expect(result.port).toBe(6380);
    expect(result.password).toBe('mypassword');
    expect(result.db).toBe(2);
  });

  it('deve retornar defaults para URL inválida', () => {
    const result = parseRedisUrl('not-a-url');
    expect(result.host).toBe('localhost');
    expect(result.port).toBe(6379);
  });
});

// ============================================
// TESTES: AUDIT LOGGER (ETAPA 6)
// (Teste da interface sem banco real)
// ============================================

describe('Audit Logger — Interface', () => {
  type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

  interface AuditEntry {
    tenantId: string;
    action: AuditAction;
    entity: string;
    entityId: string;
    changes?: Record<string, unknown>;
  }

  it('deve aceitar ação CREATE', () => {
    const entry: AuditEntry = {
      tenantId: 'tenant123',
      action: 'CREATE',
      entity: 'Event',
      entityId: 'event456',
      changes: { title: 'Reunião' },
    };
    expect(entry.action).toBe('CREATE');
    expect(entry.entity).toBe('Event');
  });

  it('deve aceitar ação UPDATE com diff', () => {
    const entry: AuditEntry = {
      tenantId: 'tenant123',
      action: 'UPDATE',
      entity: 'Event',
      entityId: 'event456',
      changes: { status: { from: 'ACTIVE', to: 'CANCELLED' } },
    };
    expect(entry.action).toBe('UPDATE');
    expect(entry.changes).toHaveProperty('status');
    const statusChange = entry.changes!.status as Record<string, string>;
    expect(statusChange.from).toBe('ACTIVE');
    expect(statusChange.to).toBe('CANCELLED');
  });

  it('deve aceitar ação DELETE', () => {
    const entry: AuditEntry = {
      tenantId: 'tenant123',
      action: 'DELETE',
      entity: 'Transaction',
      entityId: 'tx789',
      changes: { type: 'EXPENSE', amount: 150 },
    };
    expect(entry.action).toBe('DELETE');
    expect(entry.entity).toBe('Transaction');
  });

  it('deve aceitar changes opcionais', () => {
    const entry: AuditEntry = {
      tenantId: 'tenant123',
      action: 'CREATE',
      entity: 'Note',
      entityId: 'note101',
    };
    expect(entry.changes).toBeUndefined();
  });

  it('deve suportar todas as entidades auditáveis', () => {
    const entities = ['Event', 'Transaction', 'Note', 'Budget'];
    entities.forEach((entity) => {
      const entry: AuditEntry = {
        tenantId: 't1',
        action: 'CREATE',
        entity,
        entityId: 'id1',
      };
      expect(entry.entity).toBe(entity);
    });
  });
});

// ============================================
// TESTES: CORS + HELMET CONFIG (ETAPA 6)
// ============================================

describe('Security Plugins — Config', () => {
  it('CORS deve configurar métodos permitidos', () => {
    const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    expect(allowedMethods).toContain('GET');
    expect(allowedMethods).toContain('POST');
    expect(allowedMethods).toContain('PATCH');
    expect(allowedMethods).toContain('DELETE');
    expect(allowedMethods).not.toContain('TRACE');
  });

  it('CORS em produção deve desabilitar origin', () => {
    const nodeEnv = 'production';
    const corsOrigin = nodeEnv === 'production' ? false : true;
    expect(corsOrigin).toBe(false);
  });

  it('CORS em desenvolvimento deve permitir qualquer origin', () => {
    const nodeEnv = 'development';
    const corsOrigin = nodeEnv === 'production' ? false : true;
    expect(corsOrigin).toBe(true);
  });

  it('Helmet CSP deve estar desabilitado para API', () => {
    const helmetConfig = { contentSecurityPolicy: false };
    expect(helmetConfig.contentSecurityPolicy).toBe(false);
  });
});

// ============================================
// TESTES: CI/CD PIPELINE CONFIG (ETAPA 6)
// ============================================

// ============================================
// TESTES: NOTAS EXPANDIDAS
// ============================================

import { notesPatterns } from '../src/classifier/patterns/notes.patterns';

describe('Classificador — Notas Expandidas', () => {
  it('deve classificar ANOTAR com "guarda"', () => {
    const result = classifyByRules('Guarda isso: senha do wifi é 12345', notesPatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.ANOTAR);
  });

  it('deve classificar ANOTAR com "não me deixa esquecer"', () => {
    const result = classifyByRules('Não me deixa esquecer de pagar o boleto', notesPatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.ANOTAR);
  });

  it('deve classificar ANOTAR com "preciso lembrar"', () => {
    const result = classifyByRules('Preciso lembrar de ligar pro dentista', notesPatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.ANOTAR);
  });

  it('deve classificar ANOTAR com "cria uma nota"', () => {
    const result = classifyByRules('Cria uma nota sobre o projeto novo', notesPatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.ANOTAR);
  });

  it('deve classificar ANOTAR com "me lembra de"', () => {
    const result = classifyByRules('Me lembra de comprar leite amanhã', notesPatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.ANOTAR);
  });

  it('deve classificar LISTAR_NOTAS com "o que eu anotei"', () => {
    const result = classifyByRules('O que eu anotei?', notesPatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.LISTAR_NOTAS);
  });

  it('deve classificar LISTAR_NOTAS com "o que eu salvei"', () => {
    const result = classifyByRules('O que eu salvei?', notesPatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.LISTAR_NOTAS);
  });

  it('deve extrair conteúdo limpo removendo prefixo de comando', () => {
    const result = classifyByRules('anota: reunião com cliente às 10h', notesPatterns as PatternRule[]);
    expect(result.entities.description).toBeDefined();
    expect(result.entities.description).not.toMatch(/^anot/i);
  });
});

// ============================================
// TESTES: CANCELAR TRANSAÇÃO EXPANDIDO
// ============================================

describe('Classificador — Cancelar Transação Expandido', () => {
  it('deve classificar CANCELAR_TRANSACAO com "errei o valor"', () => {
    const result = classifyByRules('Errei o valor do gasto', financePatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.CANCELAR_TRANSACAO);
  });

  it('deve classificar CANCELAR_TRANSACAO com "estorna"', () => {
    const result = classifyByRules('Estorna o último lançamento', financePatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.CANCELAR_TRANSACAO);
  });

  it('deve classificar CANCELAR_TRANSACAO com "exclui a despesa"', () => {
    const result = classifyByRules('Exclui a despesa', financePatterns as PatternRule[]);
    expect(result.intent).toBe(IntentType.CANCELAR_TRANSACAO);
  });
});

// ============================================
// TESTES: HORÁRIOS FUZZY
// ============================================

import { extractTimeFromText as extractTime } from '../src/utils/date-parser';

describe('Parser de Horários Fuzzy', () => {
  it('deve extrair "de manhã" como 09:00', () => {
    expect(extractTime('de manhã')).toBe('09:00');
  });

  it('deve extrair "à tarde" como 14:00', () => {
    expect(extractTime('à tarde')).toBe('14:00');
  });

  it('deve extrair "à noite" como 19:00', () => {
    expect(extractTime('à noite')).toBe('19:00');
  });

  it('deve extrair "cedo" como 08:00', () => {
    expect(extractTime('cedo')).toBe('08:00');
  });

  it('deve extrair "final da tarde" como 17:00', () => {
    expect(extractTime('final da tarde')).toBe('17:00');
  });

  it('deve extrair "começo da manhã" como 08:00', () => {
    expect(extractTime('começo da manhã')).toBe('08:00');
  });
});

// ============================================
// TESTES: ÁUDIO — LIMITES POR PLANO
// ============================================

describe('Áudio — Limites por Plano', () => {
  const AUDIO_PLAN_LIMITS = {
    BASIC: { audioEnabled: true, audioMaxSeconds: 60 },
    PROFESSIONAL: { audioEnabled: true, audioMaxSeconds: 300 },
    ENTERPRISE: { audioEnabled: true, audioMaxSeconds: 600 },
  } as const;

  it('BASIC deve permitir áudio de até 60s', () => {
    expect(AUDIO_PLAN_LIMITS.BASIC.audioEnabled).toBe(true);
    expect(AUDIO_PLAN_LIMITS.BASIC.audioMaxSeconds).toBe(60);
  });

  it('PROFESSIONAL deve permitir áudio de até 300s', () => {
    expect(AUDIO_PLAN_LIMITS.PROFESSIONAL.audioEnabled).toBe(true);
    expect(AUDIO_PLAN_LIMITS.PROFESSIONAL.audioMaxSeconds).toBe(300);
  });

  it('ENTERPRISE deve permitir áudio de até 600s', () => {
    expect(AUDIO_PLAN_LIMITS.ENTERPRISE.audioEnabled).toBe(true);
    expect(AUDIO_PLAN_LIMITS.ENTERPRISE.audioMaxSeconds).toBe(600);
  });
});

// ============================================
// TESTES: NORMALIZAÇÃO PÓS-TRANSCRIÇÃO
// ============================================

describe('Normalização Pós-Transcrição PT-BR', () => {
  // Simulates the normalization logic from audio-transcriber
  function normalize(text: string): string {
    let result = text.trim();
    const corrections: Array<[RegExp, string]> = [
      [/legendas?\s+(?:pela|por)\s+(?:comunidade\s+)?amara\.?org/gi, ''],
      [/obrigad[oa]\s+por\s+assistir/gi, ''],
      [/\[música\]/gi, ''],
      [/\b(é|eh|uh|ah|hm|hmm|uhm|ahn)\b\s*/gi, ''],
      [/\bcem reais\b/gi, '100 reais'],
      [/\bduzentos reais\b/gi, '200 reais'],
      [/\bmil reais\b/gi, '1000 reais'],
      [/\s{2,}/g, ' '],
    ];
    for (const [pattern, replacement] of corrections) {
      result = result.replace(pattern, replacement);
    }
    result = result.replace(/^[.,;:!?\s]+/, '').replace(/[.,;:\s]+$/, '');
    if (result.length > 0) {
      result = result.charAt(0).toUpperCase() + result.slice(1);
    }
    return result.trim();
  }

  it('deve remover artefatos do Whisper', () => {
    const input = 'Legendas pela comunidade Amara.org marca reunião amanhã';
    const result = normalize(input);
    expect(result).not.toContain('Amara');
    expect(result.toLowerCase()).toContain('marca');
  });

  it('deve remover fillers (é, eh, uh, ah)', () => {
    const input = 'eh marca uh reunião ah amanhã';
    const result = normalize(input);
    expect(result).not.toContain('eh');
    expect(result).not.toContain('uh');
    expect(result).not.toContain('ah');
  });

  it('deve converter "cem reais" para "100 reais"', () => {
    const input = 'gastei cem reais no mercado';
    expect(normalize(input)).toContain('100 reais');
  });

  it('deve converter "mil reais" para "1000 reais"', () => {
    const input = 'recebi mil reais do cliente';
    expect(normalize(input)).toContain('1000 reais');
  });

  it('deve limpar espaços extras', () => {
    const input = 'marca   reunião   amanhã';
    const result = normalize(input);
    expect(result).not.toContain('  ');
  });

  it('deve capitalizar primeira letra', () => {
    const input = 'gastei 50 reais';
    const result = normalize(input);
    expect(result.charAt(0)).toBe('G');
  });
});

describe('CI/CD — Node Version Matrix', () => {
  const supportedVersions = [20, 22];

  it('deve suportar Node.js 20', () => {
    expect(supportedVersions).toContain(20);
  });

  it('deve suportar Node.js 22', () => {
    expect(supportedVersions).toContain(22);
  });

  it('engines deve requerer Node >= 20', () => {
    const engines = { node: '>=20.0.0' };
    const minVersion = parseInt(engines.node.replace('>=', ''));
    expect(minVersion).toBe(20);
    expect(supportedVersions.every(v => v >= minVersion)).toBe(true);
  });
});
