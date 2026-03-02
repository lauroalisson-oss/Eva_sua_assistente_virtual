import Anthropic from '@anthropic-ai/sdk';
import { ResponseMessage } from '../../types';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import * as fs from 'fs';
import * as path from 'path';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// Carregar prompt base do atendente
const attendantPromptPath = path.join(process.cwd(), 'prompts', 'attendant.txt');
let baseAttendantPrompt = '';

try {
  baseAttendantPrompt = fs.readFileSync(attendantPromptPath, 'utf-8');
} catch {
  console.warn('⚠️ prompts/attendant.txt não encontrado, usando prompt padrão embutido');
}

class ConversationService {
  /**
   * Processa uma mensagem no modo conversa livre.
   * Busca contexto (histórico + base de conhecimento) e responde via Claude Haiku.
   */
  async handleConversation(
    tenantId: string,
    customerPhone: string,
    customerName: string,
    text: string
  ): Promise<ResponseMessage> {
    try {
      // 1. Buscar ou criar configuração do atendente
      const config = await this.getOrCreateConfig(tenantId);

      if (!config.isEnabled) {
        return {
          text: '🤖 O modo atendente virtual não está ativado.\n\nPara ativar, diga: *"ativar atendente"*',
        };
      }

      // 2. Buscar ou criar conversa ativa
      const conversation = await this.getOrCreateConversation(
        config.id,
        customerPhone,
        customerName
      );

      // 3. Salvar mensagem do usuário
      await prisma.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'USER',
          content: text,
        },
      });

      // 4. Buscar histórico recente
      const history = await prisma.conversationMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'asc' },
        take: config.maxHistoryMessages,
      });

      // 5. Buscar base de conhecimento relevante
      const knowledge = await this.searchKnowledge(config.id, text);

      // 6. Montar o system prompt completo
      const systemPrompt = this.buildSystemPrompt(config, knowledge);

      // 7. Montar mensagens para Claude
      const messages: Anthropic.MessageParam[] = history.map((msg: { role: string; content: string }) => ({
        role: msg.role === 'USER' ? 'user' as const : 'assistant' as const,
        content: msg.content,
      }));

      // 8. Chamar Claude Haiku
      const startTime = Date.now();
      const response = await anthropic.messages.create({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 500,
        system: systemPrompt,
        messages,
      });

      const processingTime = Date.now() - startTime;
      const responseText =
        response.content[0].type === 'text' ? response.content[0].text : '';

      // 9. Salvar resposta do assistente
      await prisma.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'ASSISTANT',
          content: responseText,
          tokenCount: response.usage?.output_tokens || 0,
          processingTimeMs: processingTime,
        },
      });

      // 10. Atualizar lead score baseado na conversa
      await this.updateLeadScore(conversation.id, text, responseText);

      return { text: responseText };
    } catch (error) {
      console.error('❌ Erro na conversa livre:', error);
      return {
        text: '⚠️ Desculpe, tive um problema ao processar sua mensagem. Pode tentar novamente?',
      };
    }
  }

  /**
   * Ativa o modo atendente virtual para o tenant.
   */
  async activateAttendant(
    tenantId: string,
    entities: Record<string, unknown>
  ): Promise<ResponseMessage> {
    const businessName = (entities.businessName as string) || undefined;
    const agentName = (entities.agentName as string) || 'EVA';

    const config = await prisma.conversationConfig.upsert({
      where: { tenantId },
      update: {
        isEnabled: true,
        businessName: businessName || undefined,
        agentName,
      },
      create: {
        tenantId,
        isEnabled: true,
        businessName,
        agentName,
        salesMode: true,
      },
    });

    return {
      text: `✅ *Atendente virtual ativado!*\n\n🤖 Nome: *${config.agentName}*\n🏪 Empresa: ${config.businessName || '(não definida)'}\n💬 Modo vendas: ${config.salesMode ? 'Ativado' : 'Desativado'}\n\n📚 *Próximo passo:* Treine o agente com informações do seu negócio.\n\nExemplos:\n• _"treinar: Corte masculino custa R$ 45"_\n• _"treinar: Horário de funcionamento: seg a sáb, 9h às 19h"_\n• _"treinar: Aceitamos Pix, cartão e dinheiro"_\n\nQuanto mais informações, melhor o atendimento! 🎯`,
    };
  }

  /**
   * Desativa o modo atendente virtual.
   */
  async deactivateAttendant(tenantId: string): Promise<ResponseMessage> {
    await prisma.conversationConfig.updateMany({
      where: { tenantId },
      data: { isEnabled: false },
    });

    return {
      text: '⏸️ Atendente virtual *desativado*. As conversas foram pausadas.\n\nPara reativar, diga: *"ativar atendente"*',
    };
  }

  /**
   * Treina o agente adicionando conhecimento à base.
   */
  async trainAgent(
    tenantId: string,
    _entities: Record<string, unknown>,
    originalText: string
  ): Promise<ResponseMessage> {
    const config = await this.getOrCreateConfig(tenantId);

    // Extrair o conteúdo após "treinar:" ou "ensinar:" ou "cadastrar:"
    const trainContent = originalText
      .replace(/^(treinar|ensinar|cadastrar|adicionar|registrar)\s*[:;-]?\s*/i, '')
      .trim();

    if (!trainContent || trainContent.length < 5) {
      return {
        text: '📚 Para treinar o agente, use o formato:\n\n• _"treinar: Corte masculino custa R$ 45"_\n• _"treinar: Abrimos de seg a sáb, 9h às 19h"_\n• _"treinar: Temos 15% de desconto no Pix"_\n• _"treinar: FAQ - Tempo de entrega é de 3 a 5 dias"_',
      };
    }

    // Classificar automaticamente a categoria do conhecimento
    const category = this.classifyKnowledgeCategory(trainContent);

    // Extrair preço se mencionado
    const priceMatch = trainContent.match(/R\$\s*([\d.,]+)/);
    const price = priceMatch
      ? parseFloat(priceMatch[1].replace('.', '').replace(',', '.'))
      : null;

    // Extrair título (primeira frase antes de qualquer separador)
    const titleMatch = trainContent.match(/^([^:.\-–]+)/);
    const title = titleMatch ? titleMatch[1].trim().slice(0, 100) : trainContent.slice(0, 100);

    // Gerar tags automaticamente
    const tags = this.generateTags(trainContent);

    await prisma.knowledgeEntry.create({
      data: {
        configId: config.id,
        category,
        title,
        content: trainContent,
        price: price ? price : undefined,
        tags,
      },
    });

    // Contar total de conhecimentos
    const total = await prisma.knowledgeEntry.count({
      where: { configId: config.id, isActive: true },
    });

    return {
      text: `✅ *Conhecimento registrado!*\n\n📂 Categoria: *${this.formatCategory(category)}*\n📝 ${title}\n${price ? `💰 Preço: R$ ${price.toFixed(2)}\n` : ''}🏷️ Tags: ${tags.join(', ')}\n\n📊 Total na base: *${total} itens*`,
    };
  }

  /**
   * Transfere a conversa para atendimento humano.
   */
  async transferToHuman(
    tenantId: string,
    customerPhone: string
  ): Promise<ResponseMessage> {
    const config = await prisma.conversationConfig.findUnique({
      where: { tenantId },
    });

    if (config) {
      // Marcar conversa como transferida
      await prisma.conversation.updateMany({
        where: {
          configId: config.id,
          customerPhone,
          status: 'ACTIVE',
        },
        data: {
          status: 'TRANSFERRED',
        },
      });
    }

    return {
      text: '👤 *Entendi! Vou te transferir para um atendente humano.*\n\nAguarde um momento que alguém da equipe vai te atender. 🙏',
    };
  }

  // ============================================
  // MÉTODOS PRIVADOS
  // ============================================

  private async getOrCreateConfig(tenantId: string) {
    let config = await prisma.conversationConfig.findUnique({
      where: { tenantId },
    });

    if (!config) {
      config = await prisma.conversationConfig.create({
        data: {
          tenantId,
          isEnabled: false,
        },
      });
    }

    return config;
  }

  private async getOrCreateConversation(
    configId: string,
    customerPhone: string,
    customerName: string | null
  ) {
    // Buscar conversa ativa para este cliente
    let conversation = await prisma.conversation.findFirst({
      where: {
        configId,
        customerPhone,
        status: 'ACTIVE',
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          configId,
          customerPhone,
          customerName,
          status: 'ACTIVE',
        },
      });
    }

    return conversation;
  }

  /**
   * Busca na base de conhecimento usando palavras-chave da mensagem.
   */
  private async searchKnowledge(configId: string, text: string) {
    const keywords = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    if (keywords.length === 0) return [];

    // Buscar por tags ou conteúdo que contenham as palavras-chave
    const entries = await prisma.knowledgeEntry.findMany({
      where: {
        configId,
        isActive: true,
        OR: [
          { tags: { hasSome: keywords } },
          ...keywords.slice(0, 5).map((kw) => ({
            content: { contains: kw, mode: 'insensitive' as const },
          })),
        ],
      },
      orderBy: { priority: 'desc' },
      take: 10,
    });

    return entries;
  }

  /**
   * Monta o system prompt completo para o Claude.
   */
  private buildSystemPrompt(
    config: {
      agentName: string;
      businessName: string | null;
      businessSegment: string | null;
      personality: string;
      systemPrompt: string | null;
      salesMode: boolean;
      greeting: string | null;
    },
    knowledge: Array<{
      category: string;
      title: string;
      content: string;
      price: unknown;
    }>
  ): string {
    // Base do prompt
    let prompt = baseAttendantPrompt || this.getDefaultPrompt();

    // Substituir placeholders
    prompt = prompt
      .replace(/\{AGENT_NAME\}/g, config.agentName)
      .replace(/\{BUSINESS_NAME\}/g, config.businessName || 'nossa empresa')
      .replace(/\{BUSINESS_SEGMENT\}/g, config.businessSegment || 'atendimento ao cliente')
      .replace(/\{PERSONALITY\}/g, this.getPersonalityDescription(config.personality));

    // Adicionar prompt customizado se existir
    if (config.systemPrompt) {
      prompt += `\n\n## Instruções Adicionais do Dono:\n${config.systemPrompt}`;
    }

    // Adicionar base de conhecimento
    if (knowledge.length > 0) {
      prompt += '\n\n## Base de Conhecimento (use estas informações para responder):';
      for (const entry of knowledge) {
        prompt += `\n- [${entry.category.toUpperCase()}] ${entry.title}: ${entry.content}`;
        if (entry.price) {
          prompt += ` (Preço: R$ ${entry.price})`;
        }
      }
    }

    // Adicionar técnicas de venda se ativado
    if (config.salesMode) {
      prompt += `\n\n## Técnicas de Venda (aplique naturalmente):
- Use perguntas abertas para entender a necessidade do cliente
- Destaque benefícios, não apenas características
- Crie senso de urgência quando apropriado ("temos poucas vagas", "promoção até sexta")
- Ofereça opções (ancoragem): apresente 2-3 opções, destacando a do meio
- Quando o cliente demonstrar interesse, conduza para o fechamento: "Posso reservar para você?"
- Trate objeções com empatia: "Entendo sua preocupação, e por isso mesmo..."
- Use prova social: "A maioria dos nossos clientes escolhe...", "É o nosso mais pedido"
- Após o fechamento, faça upsell leve: "Quer aproveitar e adicionar..."
- Se o cliente hesitar, ofereça uma garantia ou teste: "Pode experimentar e ver como se sente"
- NUNCA pressione demais — o objetivo é ajudar, a venda é consequência`;
    }

    return prompt;
  }

  private getDefaultPrompt(): string {
    return `Você é {AGENT_NAME}, atendente virtual de {BUSINESS_NAME}.

## Seu Papel:
Você é um(a) atendente virtual inteligente e humanizado(a) que atende clientes via WhatsApp.
Seu objetivo é fornecer informações precisas, ajudar com dúvidas e conduzir o cliente
para a melhor experiência possível.

## Personalidade:
{PERSONALITY}

## Regras de Comportamento:
1. Sempre responda em português brasileiro natural, como uma pessoa real faria no WhatsApp
2. Use emojis com moderação para ser amigável (mas não exagere)
3. Respostas curtas e diretas — máximo 3-4 parágrafos
4. Se não souber a resposta, diga honestamente e ofereça alternativa
5. NUNCA invente informações sobre preços, horários ou produtos
6. Se o cliente pedir algo que você não pode resolver, ofereça transferir para um humano
7. Chame o cliente pelo nome quando disponível
8. Mantenha o contexto da conversa — lembre do que já foi dito
9. Ao final de cada interação, pergunte se pode ajudar em mais algo

## Formato WhatsApp:
- Use *negrito* para destacar informações importantes
- Use _itálico_ para ênfase suave
- Use listas com • para organizar opções
- Mantenha mensagens com no máximo 300 palavras`;
  }

  private getPersonalityDescription(personality: string): string {
    const personalities: Record<string, string> = {
      profissional_amigavel:
        'Profissional mas amigável. Tom acolhedor, usa linguagem acessível. Transmite confiança e competência sem ser frio.',
      formal:
        'Formal e corporativo. Linguagem polida e respeitosa. Ideal para serviços premium, escritórios e consultórios.',
      descontraido:
        'Descontraído e jovem. Usa gírias leves, tom animado e energético. Ideal para lojas, barbearias e negócios informais.',
    };
    return personalities[personality] || personalities.profissional_amigavel;
  }

  private classifyKnowledgeCategory(text: string): string {
    const lower = text.toLowerCase();
    if (/pre[cç]o|cust[ao]|valor|R\$|reais|cobr/.test(lower)) return 'preco';
    if (/servi[cç]o|atend|consult|sess[aã]o/.test(lower)) return 'servico';
    if (/produto|item|estoque|tamanho/.test(lower)) return 'produto';
    if (/hor[aá]rio|funciona|abre|fecha|dia|seg|ter|qua|qui|sex|s[aá]b|dom/.test(lower))
      return 'horario';
    if (/desconto|promo[cç][aã]o|oferta|cupom/.test(lower)) return 'promocao';
    if (/entrega|frete|envio|prazo|despacho/.test(lower)) return 'entrega';
    if (/pagamento|pix|cart[aã]o|boleto|parcel/.test(lower)) return 'pagamento';
    if (/troca|devolu|garantia|reembolso/.test(lower)) return 'politica';
    if (/pergunt|d[uú]vida|faq|frequen/.test(lower)) return 'faq';
    return 'geral';
  }

  private formatCategory(category: string): string {
    const map: Record<string, string> = {
      preco: '💰 Preço',
      servico: '🛎️ Serviço',
      produto: '📦 Produto',
      horario: '🕐 Horário',
      promocao: '🏷️ Promoção',
      entrega: '🚚 Entrega',
      pagamento: '💳 Pagamento',
      politica: '📋 Política',
      faq: '❓ FAQ',
      geral: '📄 Geral',
    };
    return map[category] || category;
  }

  private generateTags(text: string): string[] {
    const tags: string[] = [];
    const lower = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    // Extrair palavras significativas (>3 chars, sem stopwords)
    const stopwords = new Set([
      'para', 'como', 'mais', 'qual', 'quais', 'voce', 'nosso', 'nossa',
      'temos', 'sobre', 'este', 'esta', 'isso', 'aqui', 'onde', 'quando',
      'cada', 'todo', 'toda', 'mesmo', 'tambem', 'muito', 'ainda', 'entre',
      'depois', 'antes', 'desde', 'pois', 'porque', 'sendo', 'apenas',
      'custa', 'custo', 'valor', 'preco',
    ]);

    const words = lower.split(/\s+/).filter((w) => w.length > 3 && !stopwords.has(w));

    // Pegar as 5 palavras mais relevantes
    const unique = [...new Set(words)];
    tags.push(...unique.slice(0, 5));

    return tags;
  }

  /**
   * Atualiza o lead score baseado em sinais de intenção de compra.
   */
  private async updateLeadScore(
    conversationId: string,
    userText: string,
    _assistantText: string
  ): Promise<void> {
    try {
      const lower = userText.toLowerCase();
      let scoreChange = 0;

      // Sinais positivos de compra
      if (/quanto custa|qual o pre[cç]o|valor|quanto [eé]/.test(lower)) scoreChange += 15;
      if (/quero|gostaria|interesse|comprar|adquirir|contratar/.test(lower)) scoreChange += 25;
      if (/reservar|agendar|marcar|fechar/.test(lower)) scoreChange += 30;
      if (/desconto|promo|oferta|condi[cç][aã]o/.test(lower)) scoreChange += 10;
      if (/pix|cart[aã]o|pagamento|parcela/.test(lower)) scoreChange += 20;

      // Sinais negativos
      if (/n[aã]o (quero|preciso|obrigado)|talvez depois/.test(lower)) scoreChange -= 15;
      if (/caro|muito caro|absurdo|fora/.test(lower)) scoreChange -= 10;

      if (scoreChange !== 0) {
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
        });

        if (conversation) {
          const newScore = Math.max(0, Math.min(100, conversation.leadScore + scoreChange));
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { leadScore: newScore },
          });
        }
      }
    } catch (error) {
      console.warn('⚠️ Falha ao atualizar lead score:', error);
    }
  }
}

export const conversationService = new ConversationService();
