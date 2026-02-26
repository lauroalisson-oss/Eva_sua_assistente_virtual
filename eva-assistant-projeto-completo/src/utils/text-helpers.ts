/**
 * Extrai texto que aparece após uma palavra-chave.
 */
export function extractAfterKeyword(text: string, keywords: string[]): string | undefined {
  for (const keyword of keywords) {
    const regex = new RegExp(`${keyword}\\s+(?:com\\s+|no\\s+|na\\s+|do\\s+|da\\s+)?(.+)`, 'i');
    const match = text.match(regex);
    if (match) return match[1].trim();
  }
  return undefined;
}

/**
 * Detecta categoria financeira com base em palavras-chave no texto.
 */
export function extractCategory(
  text: string,
  type: 'expense' | 'income'
): string | undefined {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (type === 'expense') {
    const expenseCategories: Record<string, RegExp> = {
      alimentacao: /\b(mercado|supermercado|restaurante|almoco|janta|cafe|comida|lanche|padaria|feira|acougue|ifood|delivery)\b/,
      transporte: /\b(combustivel|gasolina|etanol|alcool|uber|99|taxi|onibus|passagem|estacionamento|pedagio|posto)\b/,
      moradia: /\b(aluguel|condominio|iptu|reforma|mobilia|movel)\b/,
      contas: /\b(agua|luz|energia|internet|telefone|celular|plano|fatura|conta)\b/,
      saude: /\b(farmacia|remedio|medico|consulta|exame|plano de saude|hospital|dentista)\b/,
      educacao: /\b(curso|escola|faculdade|livro|material|mensalidade|matricula)\b/,
      lazer: /\b(cinema|viagem|hotel|passeio|bar|festa|entretenimento|jogo|assinatura|netflix|spotify)\b/,
      impostos: /\b(imposto|taxa|das|simples|inss|irpf|icms|iss|multa)\b/,
    };

    for (const [category, pattern] of Object.entries(expenseCategories)) {
      if (pattern.test(normalized)) return category;
    }
    return 'outros';
  }

  if (type === 'income') {
    const incomeCategories: Record<string, RegExp> = {
      vendas: /\b(vend[aei]|loja|cliente|produto)\b/,
      servicos: /\b(servico|consultoria|projeto|trabalho|freela)\b/,
      salario: /\b(salario|contra-?cheque|folha|pagamento)\b/,
      comissoes: /\b(comissao|bonus|premiacao)\b/,
      rendimentos: /\b(rendimento|dividendo|juros|investimento|poupanca)\b/,
    };

    for (const [category, pattern] of Object.entries(incomeCategories)) {
      if (pattern.test(normalized)) return category;
    }
    return 'outros';
  }

  return undefined;
}
