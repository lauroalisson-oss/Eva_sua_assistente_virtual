/**
 * Extrai texto que aparece após uma palavra-chave.
 */
export function extractAfterKeyword(text: string, keywords: string[]): string | undefined {
  for (const keyword of keywords) {
    const regex = new RegExp(`${keyword}\\s+(?:com\\s+|no\\s+|na\\s+|do\\s+|da\\s+|de\\s+|para\\s+|pra\\s+)?(.+)`, 'i');
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
    if (!isCommonPlace(name)) {
      return name;
    }
  }

  // "cliente [Nome]"
  const clienteMatch = text.match(/\bcliente\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/);
  if (clienteMatch) return clienteMatch[1];

  // "pro/pra [Nome]"
  const proMatch = text.match(/\bp(?:ro|ra)\s+(?:o\s+|a\s+)?([A-ZÀ-Ú][a-zà-ú]+)/);
  if (proMatch) {
    const name = proMatch[1];
    if (!isCommonPlace(name)) {
      return name;
    }
  }

  return undefined;
}

/**
 * Checks if a word is a common place/noun (not a person's name).
 */
function isCommonPlace(name: string): boolean {
  const notNames = /^(Mercado|Supermercado|Farmacia|Restaurante|Prefeitura|Banco|Hospital|Escola|Posto|Padaria|Cinema|Hotel|Loja|Trabalho|Mes|Dia|Semana|Manha|Tarde|Noite|Shopping|Oficina|Clinica|Igreja|Feira|Academia|Cartorio|Correios|Delegacia|Forum|Tribunal|Praia|Parque|Centro|Aeroporto|Rodoviaria|Escritorio|Consultorio|Laboratorio|Studio|Estudio)$/i;
  return notNames.test(name.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
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
 * Expanded vocabulary for more accurate categorization.
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
      alimentacao: /\b(mercado|supermercado|restaurante|almoco|janta|cafe|comida|lanche|padaria|feira|acougue|ifood|delivery|rappi|uber\s*eats?|pizza|hamburger|churrasco|marmita|quentinha|hortifruti|sacolao|refeicao|jantar|almocar|cantina|bar|boteco|salgado|doce|sorvete|sorveteria|doceria|confeitaria)\b/,
      transporte: /\b(combustivel|gasolina|etanol|alcool|uber|99|taxi|onibus|passagem|estacionamento|pedagio|posto|diesel|gnv|metro|trem|brt|bicicleta|bike|patinete|manutencao do carro|oficina|mecanico|borracheiro|lavagem|lava[- ]?jato|seguro do carro|ipva|licenciamento|multa de transito|pneu)\b/,
      moradia: /\b(aluguel|condominio|iptu|reforma|mobilia|movel|mudanca|pintura|encanador|eletricista|pedreiro|construcao|imovel|apartamento|casa|kitnet|quitinete)\b/,
      contas: /\b(agua|luz|energia|internet|telefone|celular|plano|fatura|conta|wifi|fibra|tv a cabo|streaming|gas|gas de cozinha|botijao)\b/,
      saude: /\b(farmacia|remedio|medico|consulta|exame|plano de saude|hospital|dentista|clinica|laboratorio|cirurgia|tratamento|terapia|psicologo|psiquiatra|fisioterapia|vacina|medicamento|drogaria|oculista|oftalmologista|ortopedista|dermato)\b/,
      educacao: /\b(curso|escola|faculdade|livro|material|mensalidade|matricula|apostila|caderno|caneta|mochila|uniforme|formatura|treinamento|workshop|palestra|congresso|seminario|pos[- ]?graduacao|mestrado|doutorado|especializacao)\b/,
      lazer: /\b(cinema|viagem|hotel|passeio|bar|festa|entretenimento|jogo|assinatura|netflix|spotify|amazon|disney|hbo|show|teatro|museu|parque|praia|camping|churrasco|aniversario|presente|game|ingresso|boliche|karaoke|escape|diversao)\b/,
      impostos: /\b(imposto|taxa|das|simples|inss|irpf|icms|iss|multa|tributo|contribuicao|anuidade|crea|crm|oab|crc|conselho|alvara|licenca)\b/,
      vestuario: /\b(roupa|calcado|sapato|tenis|camisa|calca|vestido|blusa|jaqueta|bermuda|short|cueca|meia|chinelo|sandalia|bota|loja de roupa|costureira|lavanderia|alfaiate)\b/,
      pets: /\b(racao|veterinario|vet|pet\s?shop|banho e tosa|vacina do pet|remedio do pet|coleira|casinha|areia|gato|cachorro|pet)\b/,
      assinaturas: /\b(assinatura|mensalidade|plano mensal|recorrente|renovacao|anuidade)\b/,
    };

    for (const [category, pattern] of Object.entries(expenseCategories)) {
      if (pattern.test(normalized)) return category;
    }
    return 'outros';
  }

  if (type === 'income') {
    const incomeCategories: Record<string, RegExp> = {
      vendas: /\b(vend[aei]|loja|cliente|produto|mercadoria|encomenda|pedido)\b/,
      servicos: /\b(servico|consultoria|projeto|trabalho|freela|freelancer?|bico|diaria|job|demanda)\b/,
      salario: /\b(salario|contra-?cheque|folha|pagamento|holerite|vale|adiantamento|decimo|ferias|rescisao|fgts)\b/,
      comissoes: /\b(comissao|bonus|premiacao|gratificacao|incentivo|meta|performance)\b/,
      rendimentos: /\b(rendimento|dividendo|juros|investimento|poupanca|cdb|tesouro|acao|fundo|debenture|lci|lca|fii|renda\s+fixa|renda\s+variavel)\b/,
      aluguel: /\b(aluguel|inquilino|locacao|locatario|imovel alugado)\b/,
    };

    for (const [category, pattern] of Object.entries(incomeCategories)) {
      if (pattern.test(normalized)) return category;
    }
    return 'outros';
  }

  return undefined;
}
