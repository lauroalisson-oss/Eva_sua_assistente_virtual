import { describe, it, expect } from 'vitest';
import { IntentType, ExtractedEntities } from '../src/types';

// ============================================
// Testar o Rule Engine diretamente
// (sem necessidade de API keys ou banco de dados)
// ============================================

// --- Importar as regras e o motor ---
import { agendaPatterns } from '../src/classifier/patterns/agenda.patterns';
import { financePatterns } from '../src/classifier/patterns/finance.patterns';
import { notesPatterns } from '../src/classifier/patterns/notes.patterns';
import { systemPatterns } from '../src/classifier/patterns/system.patterns';

interface PatternRule {
  intent: IntentType;
  patterns: RegExp[];
  confidence: number;
  extractEntities?: (text: string, match: RegExpMatchArray) => ExtractedEntities;
}

const allRules: PatternRule[] = [
  ...agendaPatterns,
  ...financePatterns,
  ...notesPatterns,
  ...systemPatterns,
];

/**
 * Simula a classificacao por regras (mesma logica do rule-engine.ts).
 */
function classifyByRules(text: string): { intent: IntentType; confidence: number; entities: ExtractedEntities } {
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

  for (const rule of allRules) {
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
// TESTES: AGENDA
// ============================================

describe('Classificador — Agenda', () => {
  it('deve classificar AGENDAR com frase basica', () => {
    const result = classifyByRules('Marca reunião amanhã às 14h');
    expect(result.intent).toBe(IntentType.AGENDAR);
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('deve classificar AGENDAR com variacao "agendar"', () => {
    const result = classifyByRules('Agendar encontro na quarta');
    expect(result.intent).toBe(IntentType.AGENDAR);
  });

  it('deve classificar AGENDAR com consulta medica', () => {
    const result = classifyByRules('Marca consulta sexta às 10h');
    expect(result.intent).toBe(IntentType.AGENDAR);
  });

  it('deve classificar AGENDAR com horario explicito', () => {
    const result = classifyByRules('Marca amanhã às 15:30');
    expect(result.intent).toBe(IntentType.AGENDAR);
  });

  it('deve classificar AGENDAR com "preciso agendar"', () => {
    const result = classifyByRules('Preciso agendar uma entrevista');
    expect(result.intent).toBe(IntentType.AGENDAR);
  });

  it('deve classificar AGENDAR com "bota na agenda"', () => {
    const result = classifyByRules('Bota na agenda reunião com cliente');
    expect(result.intent).toBe(IntentType.AGENDAR);
  });

  it('deve classificar AGENDAR com visita', () => {
    const result = classifyByRules('Marca visita na prefeitura amanhã');
    expect(result.intent).toBe(IntentType.AGENDAR);
  });

  it('deve classificar LISTAR_AGENDA para hoje', () => {
    const result = classifyByRules('O que tenho pra hoje?');
    expect(result.intent).toBe(IntentType.LISTAR_AGENDA);
    expect(result.entities.period).toBe('today');
  });

  it('deve classificar LISTAR_AGENDA para amanha', () => {
    const result = classifyByRules('Quais compromissos tenho amanhã?');
    expect(result.intent).toBe(IntentType.LISTAR_AGENDA);
    expect(result.entities.period).toBe('tomorrow');
  });

  it('deve classificar LISTAR_AGENDA para semana', () => {
    const result = classifyByRules('Minha agenda da semana');
    expect(result.intent).toBe(IntentType.LISTAR_AGENDA);
    expect(result.entities.period).toBe('week');
  });

  it('deve classificar LISTAR_AGENDA com "como ta minha agenda"', () => {
    const result = classifyByRules('Como tá minha agenda?');
    expect(result.intent).toBe(IntentType.LISTAR_AGENDA);
  });

  it('deve classificar LISTAR_AGENDA com "mostra minha agenda"', () => {
    const result = classifyByRules('Mostra minha agenda');
    expect(result.intent).toBe(IntentType.LISTAR_AGENDA);
  });

  it('deve classificar LISTAR_AGENDA com "o que tá marcado"', () => {
    const result = classifyByRules('O que tá marcado pra amanhã?');
    expect(result.intent).toBe(IntentType.LISTAR_AGENDA);
  });

  it('deve classificar LISTAR_AGENDA com "como está meu dia"', () => {
    const result = classifyByRules('Como está meu dia?');
    expect(result.intent).toBe(IntentType.LISTAR_AGENDA);
  });

  it('deve classificar CANCELAR_EVENTO', () => {
    const result = classifyByRules('Cancela a reunião de amanhã');
    expect(result.intent).toBe(IntentType.CANCELAR_EVENTO);
  });

  it('deve classificar CANCELAR_EVENTO com "desmarcar"', () => {
    const result = classifyByRules('Desmarca o compromisso de segunda');
    expect(result.intent).toBe(IntentType.CANCELAR_EVENTO);
  });

  it('deve classificar CANCELAR_EVENTO com "tira da agenda"', () => {
    const result = classifyByRules('Tira da agenda a reunião de amanhã');
    expect(result.intent).toBe(IntentType.CANCELAR_EVENTO);
  });
});

// ============================================
// TESTES: FINANCEIRO
// ============================================

describe('Classificador — Financeiro', () => {
  it('deve classificar REGISTRAR_DESPESA com valor', () => {
    const result = classifyByRules('Gastei 150 de combustível');
    expect(result.intent).toBe(IntentType.REGISTRAR_DESPESA);
    expect(result.entities.amount).toBe(150);
  });

  it('deve classificar REGISTRAR_DESPESA com "paguei"', () => {
    const result = classifyByRules('Paguei 80 reais de internet');
    expect(result.intent).toBe(IntentType.REGISTRAR_DESPESA);
    expect(result.entities.amount).toBe(80);
  });

  it('deve classificar REGISTRAR_DESPESA com "comprei"', () => {
    const result = classifyByRules('Comprei um livro por 45 reais');
    expect(result.intent).toBe(IntentType.REGISTRAR_DESPESA);
    expect(result.entities.amount).toBe(45);
  });

  it('deve classificar REGISTRAR_DESPESA com valor grande', () => {
    const result = classifyByRules('Gastei 1.500,00 no mercado');
    expect(result.intent).toBe(IntentType.REGISTRAR_DESPESA);
    expect(result.entities.amount).toBe(1500);
  });

  it('deve classificar REGISTRAR_DESPESA e detectar categoria alimentacao', () => {
    const result = classifyByRules('Gastei 200 no supermercado');
    expect(result.intent).toBe(IntentType.REGISTRAR_DESPESA);
    expect(result.entities.category).toBe('alimentacao');
  });

  it('deve classificar REGISTRAR_DESPESA e detectar categoria transporte', () => {
    const result = classifyByRules('Gastei 300 de gasolina');
    expect(result.intent).toBe(IntentType.REGISTRAR_DESPESA);
    expect(result.entities.category).toBe('transporte');
  });

  it('deve classificar REGISTRAR_DESPESA com "torrei"', () => {
    const result = classifyByRules('Torrei 500 no shopping');
    expect(result.intent).toBe(IntentType.REGISTRAR_DESPESA);
    expect(result.entities.amount).toBe(500);
  });

  it('deve classificar REGISTRAR_DESPESA com "conta de X"', () => {
    const result = classifyByRules('Conta de luz de 250 reais');
    expect(result.intent).toBe(IntentType.REGISTRAR_DESPESA);
    expect(result.entities.amount).toBe(250);
  });

  it('deve classificar REGISTRAR_RECEITA com "recebi"', () => {
    const result = classifyByRules('Recebi 5000 do cliente');
    expect(result.intent).toBe(IntentType.REGISTRAR_RECEITA);
    expect(result.entities.amount).toBe(5000);
  });

  it('deve classificar REGISTRAR_RECEITA com "entrada"', () => {
    const result = classifyByRules('Entrada de 3.500 reais');
    expect(result.intent).toBe(IntentType.REGISTRAR_RECEITA);
    expect(result.entities.amount).toBe(3500);
  });

  it('deve classificar REGISTRAR_RECEITA com "vendi"', () => {
    const result = classifyByRules('Vendi o produto por 2k');
    expect(result.intent).toBe(IntentType.REGISTRAR_RECEITA);
    expect(result.entities.amount).toBe(2000);
  });

  it('deve classificar REGISTRAR_RECEITA com "ganhei"', () => {
    const result = classifyByRules('Ganhei 1000 de comissão');
    expect(result.intent).toBe(IntentType.REGISTRAR_RECEITA);
    expect(result.entities.amount).toBe(1000);
  });

  it('deve classificar REGISTRAR_RECEITA com "caiu na conta"', () => {
    const result = classifyByRules('Caiu 3000 na conta');
    expect(result.intent).toBe(IntentType.REGISTRAR_RECEITA);
    expect(result.entities.amount).toBe(3000);
  });

  it('deve classificar CONSULTAR_SALDO com "como ta meu financeiro"', () => {
    const result = classifyByRules('Como tá meu financeiro?');
    expect(result.intent).toBe(IntentType.CONSULTAR_SALDO);
  });

  it('deve classificar CONSULTAR_SALDO com "saldo"', () => {
    const result = classifyByRules('Qual meu saldo?');
    expect(result.intent).toBe(IntentType.CONSULTAR_SALDO);
  });

  it('deve classificar CONSULTAR_SALDO com "quanto gastei"', () => {
    const result = classifyByRules('Quanto gastei esse mês?');
    expect(result.intent).toBe(IntentType.CONSULTAR_SALDO);
  });

  it('deve classificar CONSULTAR_SALDO com "resumo"', () => {
    const result = classifyByRules('Resumo financeiro do mês');
    expect(result.intent).toBe(IntentType.CONSULTAR_SALDO);
  });

  it('deve classificar CONSULTAR_SALDO com "minhas finanças"', () => {
    const result = classifyByRules('Minhas finanças');
    expect(result.intent).toBe(IntentType.CONSULTAR_SALDO);
  });

  it('deve classificar CONSULTAR_SALDO com "quanto sobrou"', () => {
    const result = classifyByRules('Quanto sobrou esse mês?');
    expect(result.intent).toBe(IntentType.CONSULTAR_SALDO);
  });

  it('deve classificar DEFINIR_LIMITE', () => {
    const result = classifyByRules('Meu limite de gastos é 8000');
    expect(result.intent).toBe(IntentType.DEFINIR_LIMITE);
    expect(result.entities.amount).toBe(8000);
  });

  it('deve classificar DEFINIR_LIMITE com "orçamento"', () => {
    const result = classifyByRules('Define orçamento mensal de 5 mil');
    expect(result.intent).toBe(IntentType.DEFINIR_LIMITE);
    expect(result.entities.amount).toBe(5000);
  });

  it('deve classificar CANCELAR_TRANSACAO com "errei o valor"', () => {
    const result = classifyByRules('Errei o valor do gasto');
    expect(result.intent).toBe(IntentType.CANCELAR_TRANSACAO);
  });
});

// ============================================
// TESTES: ANOTAÇÕES
// ============================================

describe('Classificador — Anotações', () => {
  it('deve classificar ANOTAR com "anota"', () => {
    const result = classifyByRules('Anota: ligar pro João segunda');
    expect(result.intent).toBe(IntentType.ANOTAR);
  });

  it('deve classificar ANOTAR com "lembra"', () => {
    const result = classifyByRules('Lembra de comprar papel');
    expect(result.intent).toBe(IntentType.ANOTAR);
  });

  it('deve classificar ANOTAR com "salva"', () => {
    const result = classifyByRules('Salva: código do portão 4523');
    expect(result.intent).toBe(IntentType.ANOTAR);
  });

  it('deve classificar ANOTAR com "guarda"', () => {
    const result = classifyByRules('Guarda essa informação: reunião às 15h');
    expect(result.intent).toBe(IntentType.ANOTAR);
  });

  it('deve classificar ANOTAR com "não me deixa esquecer"', () => {
    const result = classifyByRules('Não me deixa esquecer de ligar pro dentista');
    expect(result.intent).toBe(IntentType.ANOTAR);
  });

  it('deve classificar ANOTAR com "preciso lembrar"', () => {
    const result = classifyByRules('Preciso lembrar de comprar leite');
    expect(result.intent).toBe(IntentType.ANOTAR);
  });

  it('deve classificar ANOTAR com "cria uma nota"', () => {
    const result = classifyByRules('Cria uma nota sobre o projeto');
    expect(result.intent).toBe(IntentType.ANOTAR);
  });

  it('deve classificar ANOTAR com "me lembra de"', () => {
    const result = classifyByRules('Me lembra de pagar a conta amanhã');
    expect(result.intent).toBe(IntentType.ANOTAR);
  });

  it('deve extrair conteúdo limpo de nota com "anota"', () => {
    const result = classifyByRules('anota: ligar pro João segunda');
    expect(result.entities.description).toBeDefined();
    // Should extract the content without the "anota:" prefix
    expect(result.entities.description).not.toMatch(/^anot/i);
  });

  it('deve extrair conteúdo limpo de nota com "não me deixa esquecer"', () => {
    const result = classifyByRules('não me deixa esquecer de pagar o boleto');
    expect(result.entities.description).toBeDefined();
    expect(result.entities.description).not.toMatch(/nao me deixa esquecer/i);
  });

  it('deve classificar LISTAR_NOTAS com "minhas notas"', () => {
    const result = classifyByRules('Quais são minhas notas?');
    expect(result.intent).toBe(IntentType.LISTAR_NOTAS);
  });

  it('deve classificar LISTAR_NOTAS com "meus lembretes"', () => {
    const result = classifyByRules('Mostra meus lembretes');
    expect(result.intent).toBe(IntentType.LISTAR_NOTAS);
  });

  it('deve classificar LISTAR_NOTAS com "o que eu anotei"', () => {
    const result = classifyByRules('O que eu anotei?');
    expect(result.intent).toBe(IntentType.LISTAR_NOTAS);
  });

  it('deve classificar LISTAR_NOTAS com "o que eu salvei"', () => {
    const result = classifyByRules('O que eu salvei?');
    expect(result.intent).toBe(IntentType.LISTAR_NOTAS);
  });
});

// ============================================
// TESTES: SISTEMA
// ============================================

describe('Classificador — Sistema', () => {
  it('deve classificar SAUDACAO com "oi"', () => {
    const result = classifyByRules('Oi');
    expect(result.intent).toBe(IntentType.SAUDACAO);
  });

  it('deve classificar SAUDACAO com "bom dia"', () => {
    const result = classifyByRules('Bom dia');
    expect(result.intent).toBe(IntentType.SAUDACAO);
  });

  it('deve classificar SAUDACAO com "boa noite"', () => {
    const result = classifyByRules('Boa noite');
    expect(result.intent).toBe(IntentType.SAUDACAO);
  });

  it('deve classificar SAUDACAO com "e ai"', () => {
    const result = classifyByRules('E aí');
    expect(result.intent).toBe(IntentType.SAUDACAO);
  });

  it('deve classificar SAUDACAO com "beleza"', () => {
    const result = classifyByRules('Beleza');
    expect(result.intent).toBe(IntentType.SAUDACAO);
  });

  it('deve classificar SAUDACAO com "tudo bem"', () => {
    const result = classifyByRules('Tudo bem?');
    expect(result.intent).toBe(IntentType.SAUDACAO);
  });

  it('deve classificar AJUDA com "ajuda"', () => {
    const result = classifyByRules('Ajuda');
    expect(result.intent).toBe(IntentType.AJUDA);
  });

  it('deve classificar AJUDA com "como funciona"', () => {
    const result = classifyByRules('Como funciona?');
    expect(result.intent).toBe(IntentType.AJUDA);
  });

  it('deve classificar AJUDA com "o que voce faz"', () => {
    const result = classifyByRules('O que você faz?');
    expect(result.intent).toBe(IntentType.AJUDA);
  });

  it('deve classificar AJUDA com "me ajuda"', () => {
    const result = classifyByRules('Me ajuda aqui');
    expect(result.intent).toBe(IntentType.AJUDA);
  });

  it('deve classificar AJUDA com "o que eu posso fazer"', () => {
    const result = classifyByRules('O que eu posso fazer aqui?');
    expect(result.intent).toBe(IntentType.AJUDA);
  });

  it('deve classificar RELATORIO', () => {
    const result = classifyByRules('Relatório de fevereiro');
    expect(result.intent).toBe(IntentType.RELATORIO);
  });

  it('deve classificar RELATORIO com "resumo da semana"', () => {
    const result = classifyByRules('Resumo da semana');
    expect(result.intent).toBe(IntentType.RELATORIO);
    expect(result.entities.period).toBe('week');
  });

  it('deve classificar RELATORIO com "como foi meu mês"', () => {
    const result = classifyByRules('Como foi meu mês?');
    expect(result.intent).toBe(IntentType.RELATORIO);
  });

  it('deve classificar RELATORIO com "gera um relatório"', () => {
    const result = classifyByRules('Gera um relatório mensal');
    expect(result.intent).toBe(IntentType.RELATORIO);
  });

  it('deve retornar DESCONHECIDO para frase aleatoria', () => {
    const result = classifyByRules('O tempo hoje está bom');
    expect(result.intent).toBe(IntentType.DESCONHECIDO);
  });
});

// ============================================
// TESTES: EXTRAÇÃO DE ENTIDADES
// ============================================

describe('Extração de Entidades', () => {
  it('deve extrair valor monetário em despesa', () => {
    const result = classifyByRules('Gastei 250 no mercado');
    expect(result.entities.amount).toBe(250);
  });

  it('deve extrair valor com "k" (mil)', () => {
    const result = classifyByRules('Recebi 5k do cliente');
    expect(result.entities.amount).toBe(5000);
  });

  it('deve extrair valor com "mil"', () => {
    const result = classifyByRules('Gastei 2 mil no dentista');
    expect(result.entities.amount).toBe(2000);
  });

  it('deve extrair valor formatado BR (1.500,00)', () => {
    const result = classifyByRules('Paguei 1.500,00 de aluguel');
    expect(result.entities.amount).toBe(1500);
  });

  it('deve detectar categoria alimentacao', () => {
    const result = classifyByRules('Gastei 80 no restaurante');
    expect(result.entities.category).toBe('alimentacao');
  });

  it('deve detectar categoria saude', () => {
    const result = classifyByRules('Paguei 150 na farmacia');
    expect(result.entities.category).toBe('saude');
  });

  it('deve detectar categoria lazer', () => {
    const result = classifyByRules('Gastei 50 no cinema');
    expect(result.entities.category).toBe('lazer');
  });

  it('deve detectar categoria educacao', () => {
    const result = classifyByRules('Paguei 300 na mensalidade do curso');
    expect(result.entities.category).toBe('educacao');
  });

  it('deve detectar categoria vestuario', () => {
    const result = classifyByRules('Comprei roupa por 200 reais');
    expect(result.entities.category).toBe('vestuario');
  });

  it('deve extrair periodo "today" para agenda', () => {
    const result = classifyByRules('O que tenho pra hoje?');
    expect(result.entities.period).toBe('today');
  });

  it('deve extrair periodo "week" para agenda', () => {
    const result = classifyByRules('Meus compromissos da semana');
    expect(result.entities.period).toBe('week');
  });

  it('deve extrair periodo "month" para agenda', () => {
    const result = classifyByRules('Agenda do mês');
    expect(result.entities.period).toBe('month');
  });
});

// ============================================
// TESTES: PARSER DE DATAS
// ============================================

import { extractDateFromText, extractTimeFromText } from '../src/utils/date-parser';

describe('Parser de Datas PT-BR', () => {
  it('deve extrair "hoje"', () => {
    const result = extractDateFromText('hoje');
    expect(result).toBeDefined();
  });

  it('deve extrair "amanha"', () => {
    const result = extractDateFromText('amanhã');
    expect(result).toBeDefined();
  });

  it('deve extrair "depois de amanha"', () => {
    const result = extractDateFromText('depois de amanhã');
    expect(result).toBeDefined();
  });

  it('deve extrair dia da semana "segunda"', () => {
    const result = extractDateFromText('segunda');
    expect(result).toBeDefined();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('deve extrair data explicita "15/03"', () => {
    const result = extractDateFromText('dia 15/03');
    expect(result).toBeDefined();
    expect(result).toContain('-03-15');
  });

  it('deve extrair data por extenso "20 de abril"', () => {
    const result = extractDateFromText('dia 20 de abril');
    expect(result).toBeDefined();
    expect(result).toContain('-04-20');
  });

  it('deve extrair "daqui a 3 dias"', () => {
    const result = extractDateFromText('daqui a 3 dias');
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

  it('deve extrair "semana que vem"', () => {
    const result = extractDateFromText('semana que vem');
    expect(result).toBeDefined();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('deve extrair "final do mês"', () => {
    const result = extractDateFromText('final do mês');
    expect(result).toBeDefined();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('deve retornar undefined para texto sem data', () => {
    const result = extractDateFromText('ola tudo bem');
    expect(result).toBeUndefined();
  });
});

describe('Parser de Horarios PT-BR', () => {
  it('deve extrair "14h"', () => {
    expect(extractTimeFromText('às 14h')).toBe('14:00');
  });

  it('deve extrair "14h30"', () => {
    expect(extractTimeFromText('às 14h30')).toBe('14:30');
  });

  it('deve extrair "14:30"', () => {
    expect(extractTimeFromText('às 14:30')).toBe('14:30');
  });

  it('deve extrair "meio dia"', () => {
    expect(extractTimeFromText('ao meio dia')).toBe('12:00');
  });

  it('deve extrair "meia noite"', () => {
    expect(extractTimeFromText('meia noite')).toBe('00:00');
  });

  it('deve extrair "de manhã"', () => {
    expect(extractTimeFromText('de manhã')).toBe('09:00');
  });

  it('deve extrair "à tarde"', () => {
    expect(extractTimeFromText('à tarde')).toBe('14:00');
  });

  it('deve extrair "à noite"', () => {
    expect(extractTimeFromText('à noite')).toBe('19:00');
  });

  it('deve extrair "cedo"', () => {
    expect(extractTimeFromText('cedo')).toBe('08:00');
  });

  it('deve extrair "final da tarde"', () => {
    expect(extractTimeFromText('final da tarde')).toBe('17:00');
  });

  it('deve retornar undefined para texto sem horario', () => {
    expect(extractTimeFromText('ola tudo bem')).toBeUndefined();
  });
});

// ============================================
// TESTES: PARSER DE MOEDA
// ============================================

import { extractCurrency } from '../src/utils/currency-parser';

describe('Parser de Moeda BR', () => {
  it('deve extrair numero simples', () => {
    expect(extractCurrency('150')).toBe(150);
  });

  it('deve extrair com "R$"', () => {
    expect(extractCurrency('R$ 1.500,00')).toBe(1500);
  });

  it('deve extrair com "reais"', () => {
    expect(extractCurrency('200 reais')).toBe(200);
  });

  it('deve extrair "2k"', () => {
    expect(extractCurrency('2k')).toBe(2000);
  });

  it('deve extrair "5 mil"', () => {
    expect(extractCurrency('5 mil')).toBe(5000);
  });

  it('deve extrair valor com centavos', () => {
    expect(extractCurrency('R$ 49,90')).toBe(49.9);
  });

  it('deve extrair "conto"', () => {
    expect(extractCurrency('150 conto')).toBe(150);
  });
});
