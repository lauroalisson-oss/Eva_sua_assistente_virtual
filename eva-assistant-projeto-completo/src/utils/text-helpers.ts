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
 * Extrai nome de pessoa de um texto em português.
 * Detecta: "com o João", "com a Maria", "do Dr. Silva", "cliente Pedro", "pro João".
 */
export function extractPerson(text: string): string | undefined {
  // "com o/a [Nome]", "com [Nome]"
  const comMatch = text.match(
    /\bcom\s+(?:o\s+|a\s+)?(?:[Dd]r\.?\s+|[Dd]outor[a]?\s+|[Pp]rof(?:essor[a]?)?\.?\s+)?([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/
  );
  if (comMatch) return comMatch[1];

  // "do/da [Nome]" (filtra palavras comuns que nao sao nomes)
  const doMatch = text.match(
    /\b(?:do|da)\s+(?:Dr\.?\s+|Doutor[a]?\s+)?([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/
  );
  if (doMatch) {
    const name = doMatch[1];
    const notNames = /^(Mercado|Supermercado|Farmacia|Restaurante|Prefeitura|Banco|Hospital|Escola|Posto|Padaria|Cinema|Hotel|Loja|Trabalho|Mes|Dia|Semana|Manha|Tarde|Noite)$/i;
    if (!notNames.test(name.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) {
      return name;
    }
  }

  // "cliente [Nome]"
  const clienteMatch = text.match(/\bcliente\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/);
  if (clienteMatch) return clienteMatch[1];

  // "pro/pra [Nome]"
  const proMatch = text.match(/\bp(?:ro|ra)\s+(?:o\s+|a\s+)?([A-ZÀ-Ú][a-zà-ú]+)/);
  if (proMatch) return proMatch[1];

  return undefined;
}

/**
 * Extrai local/endereco de um texto em português.
 * Detecta: "na prefeitura de Cipó", "no escritório", "em São Paulo".
 */
export function extractLocation(text: string): string | undefined {
  // "na/no/em [Local]" — captura nome próprio ou sequência de palavras com preposições
  const locMatch = text.match(
    /\b(?:na|no|em)\s+((?:[A-ZÀ-Ú][a-zà-ú]+(?:\s+(?:de|do|da|dos|das)\s+[A-ZÀ-Ú]?[a-zà-ú]+)?(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*))/
  );
  if (locMatch) {
    let loc = locMatch[1].trim();
    // Remover sufixos temporais capturados acidentalmente
    loc = loc.replace(/\s+(?:[àa]s|amanha|hoje|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b.*/i, '').trim();
    if (loc.length >= 3) return loc;
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
