import { IncomingMessage, ResponseMessage } from '../types';
import { hybridClassifier } from '../classifier/hybrid-classifier';
import { whatsappClient } from './whatsapp-client';
import { audioTranscriber } from './audio-transcriber';
import { agendaService } from '../modules/agenda/agenda.service';
import { financeService } from '../modules/finance/finance.service';
import { notesService } from '../modules/notes/notes.service';
import { IntentType } from '../types';
import { prisma } from '../config/database';

class MessageRouter {
  /**
   * Ponto de entrada principal: processa uma mensagem recebida.
   */
  async handleMessage(message: IncomingMessage): Promise<void> {
    const startTime = Date.now();

    try {
      // 1. Pré-processamento: transcrever áudio se necessário
      let text = message.text;
      if (!text && message.audio) {
        text = await audioTranscriber.transcribe(message.audio);
        if (!text) {
          await whatsappClient.sendText(
            message.phone,
            '❌ Não consegui entender o áudio. Pode tentar novamente ou enviar por texto?'
          );
          return;
        }
      }

      if (!text) {
        return; // Sem texto para processar
      }

      // 2. Classificar a mensagem (Motor Híbrido)
      const classification = await hybridClassifier.classify(text);

      console.log(
        `🧠 Classificação: ${classification.intent} (${classification.source}, ${(classification.confidence * 100).toFixed(0)}%)`
      );

      // 3. Rotear para o módulo correto
      const response = await this.routeToModule(
        classification.intent,
        classification.entities,
        text,
        message
      );

      // 4. Enviar resposta
      if (response.text) {
        await whatsappClient.sendText(message.phone, response.text);
      }

      if (response.document) {
        await whatsappClient.sendDocument(
          message.phone,
          response.document.url,
          response.document.filename,
          response.document.mimetype
        );
      }

      // 5. Registrar log de analytics
      const processingTime = Date.now() - startTime;
      await this.logMessage(message, classification, processingTime);
    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error);
      await whatsappClient.sendText(
        message.phone,
        '⚠️ Desculpe, tive um problema ao processar sua mensagem. Tente novamente em instantes.'
      );
    }
  }

  /**
   * Roteia a intenção classificada para o módulo de negócio correto.
   */
  private async routeToModule(
    intent: IntentType,
    entities: Record<string, unknown>,
    originalText: string,
    message: IncomingMessage
  ): Promise<ResponseMessage> {
    switch (intent) {
      // --- Agenda ---
      case IntentType.AGENDAR:
        return agendaService.createEvent(message.phone, entities, originalText);

      case IntentType.LISTAR_AGENDA:
        return agendaService.listEvents(message.phone, entities);

      case IntentType.CANCELAR_EVENTO:
        return agendaService.cancelEvent(message.phone, entities, originalText);

      // --- Financeiro ---
      case IntentType.REGISTRAR_DESPESA:
        return financeService.registerExpense(message.phone, entities, originalText);

      case IntentType.REGISTRAR_RECEITA:
        return financeService.registerIncome(message.phone, entities, originalText);

      case IntentType.CONSULTAR_SALDO:
        return financeService.getBalance(message.phone, entities);

      case IntentType.DEFINIR_LIMITE:
        return financeService.setBudget(message.phone, entities, originalText);

      // --- Anotações ---
      case IntentType.ANOTAR:
        return notesService.createNote(message.phone, entities, originalText);

      case IntentType.LISTAR_NOTAS:
        return notesService.listNotes(message.phone, entities);

      // --- Sistema ---
      case IntentType.RELATORIO:
        return { text: '📊 Geração de relatórios será implementada na Fase 2. Em breve!' };

      case IntentType.SAUDACAO:
        return {
          text: `Olá, ${message.senderName}! 👋\n\nSou a *EVA*, sua assistente virtual. Como posso te ajudar?\n\n📅 *Agenda* — marcar, listar ou cancelar compromissos\n💰 *Financeiro* — registrar gastos, receitas e ver saldo\n📝 *Anotações* — salvar lembretes e notas rápidas\n\nÉ só me dizer o que precisa! 😊`,
        };

      case IntentType.AJUDA:
        return {
          text: `🤖 *O que eu posso fazer:*\n\n📅 *Agenda:*\n• "Marca reunião amanhã às 14h"\n• "O que tenho pra hoje?"\n• "Cancela a reunião de amanhã"\n\n💰 *Financeiro:*\n• "Gastei 150 de combustível"\n• "Recebi 3.500 do cliente X"\n• "Como tá meu financeiro?"\n• "Limite de gastos: 8 mil"\n\n📝 *Anotações:*\n• "Anota: ligar pro contador segunda"\n• "Quais são minhas anotações?"\n\n📊 *Relatórios:*\n• "Relatório de fevereiro"\n\nVocê pode enviar por *texto* ou *áudio*! 🎤`,
        };

      case IntentType.DESCONHECIDO:
      default:
        return {
          text: `🤔 Não entendi muito bem. Pode reformular?\n\nDiga *"ajuda"* para ver o que eu consigo fazer.`,
        };
    }
  }

  /**
   * Registra log da mensagem para analytics.
   */
  private async logMessage(
    message: IncomingMessage,
    classification: { intent: IntentType; source: string; confidence: number },
    processingTimeMs: number
  ): Promise<void> {
    try {
      await prisma.messageLog.create({
        data: {
          tenantId: message.phone, // No MVP, phone = tenantId
          direction: 'incoming',
          messageType: message.audio ? 'audio' : 'text',
          classifiedIntent: classification.intent,
          classifierSource: classification.source,
          confidence: classification.confidence,
          processingTimeMs,
        },
      });
    } catch (error) {
      console.warn('⚠️ Falha ao registrar log:', error);
      // Não falhar o fluxo principal por causa de log
    }
  }
}

export const messageRouter = new MessageRouter();
