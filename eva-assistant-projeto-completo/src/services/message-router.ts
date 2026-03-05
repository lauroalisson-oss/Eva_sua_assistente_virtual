import { IncomingMessage, ResponseMessage } from '../types';
import { hybridClassifier } from '../classifier/hybrid-classifier';
import { whatsappClient } from './whatsapp-client';
import { audioTranscriber, AudioError } from './audio-transcriber';
import { agendaService } from '../modules/agenda/agenda.service';
import { financeService } from '../modules/finance/finance.service';
import { notesService } from '../modules/notes/notes.service';
import { pdfGenerator } from '../modules/reports/pdf-generator';
import { conversationService } from '../modules/conversation/conversation.service';
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
      let isFromAudio = false;

      if (!text && message.audio) {
        // Validate audio duration
        if (message.audio.seconds && message.audio.seconds > 300) {
          await whatsappClient.sendText(
            message.phone,
            '⚠️ O áudio é muito longo (máximo 5 minutos). Pode enviar um áudio mais curto ou digitar? 📝'
          );
          return;
        }

        const result = await audioTranscriber.transcribe(message.audio);
        text = result.text;
        if (!text) {
          const errorMessages: Record<string, string> = {
            [AudioError.NO_API_KEY]: '⚠️ Transcrição de áudio ainda não está configurada. Por favor, envie por texto! 📝',
            [AudioError.DOWNLOAD_FAILED]: '❌ Não consegui baixar o áudio. Pode enviar novamente ou digitar? 🔄',
            [AudioError.TRANSCRIPTION_FAILED]: '❌ Não consegui transcrever o áudio. Tente falar mais perto do microfone, em um local silencioso, ou envie por texto. 🎤',
            [AudioError.AUDIO_TOO_LONG]: '⚠️ O áudio é muito longo (máximo 5 minutos). Envie um mais curto ou digite! 📝',
            [AudioError.EMPTY_RESULT]: '❌ O áudio ficou vazio após transcrição. Tente falar mais claramente ou envie por texto. 🎤',
          };
          const msg = result.error ? errorMessages[result.error] : errorMessages[AudioError.TRANSCRIPTION_FAILED];
          await whatsappClient.sendText(message.phone, msg);
          return;
        }
        isFromAudio = true;
      }

      if (!text) {
        return; // Sem texto para processar
      }

      // 2. Classificar a mensagem (Motor Híbrido)
      let classification = await hybridClassifier.classify(text);

      console.log(
        `🧠 Classificação: ${classification.intent} (${classification.source}, ${(classification.confidence * 100).toFixed(0)}%)`
      );

      // 2.1 Se a classificação é DESCONHECIDO ou SAUDACAO, verificar se o modo
      //     atendente virtual está ativo → redirecionar para CONVERSA_LIVRE
      if (
        classification.intent === IntentType.DESCONHECIDO ||
        classification.intent === IntentType.SAUDACAO
      ) {
        const conversationConfig = await prisma.conversationConfig?.findUnique({
          where: { tenantId: message.tenantId },
        }).catch(() => null);

        if (conversationConfig?.isEnabled) {
          console.log('💬 Modo atendente ativo — redirecionando para CONVERSA_LIVRE');
          classification = {
            ...classification,
            intent: IntentType.CONVERSA_LIVRE,
            source: classification.source,
          };
        }
      }

      // 3. Rotear para o módulo correto (usa tenantId para DB)
      const response = await this.routeToModule(
        classification.intent,
        classification.entities,
        text,
        message
      );

      // 4. Enviar resposta (usa phone para WhatsApp)
      if (response.text) {
        // If message was from audio, prepend the transcription so user knows what was understood
        let finalText = response.text;
        if (isFromAudio && text) {
          const preview = text.length > 120 ? text.substring(0, 120) + '...' : text;
          finalText = `🎤 _"${preview}"_\n\n${response.text}`;
        }
        await whatsappClient.sendText(message.phone, finalText);
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
   * Usa message.tenantId para operações de banco de dados.
   */
  private async routeToModule(
    intent: IntentType,
    entities: Record<string, unknown>,
    originalText: string,
    message: IncomingMessage
  ): Promise<ResponseMessage> {
    const tid = message.tenantId;

    switch (intent) {
      // --- Agenda ---
      case IntentType.AGENDAR:
        return agendaService.createEvent(tid, entities, originalText);

      case IntentType.LISTAR_AGENDA:
        return agendaService.listEvents(tid, entities);

      case IntentType.CANCELAR_EVENTO:
        return agendaService.cancelEvent(tid, entities, originalText);

      case IntentType.EDITAR_EVENTO:
        return agendaService.editEvent(tid, entities, originalText);

      // --- Financeiro ---
      case IntentType.REGISTRAR_DESPESA:
        return financeService.registerExpense(tid, entities, originalText);

      case IntentType.REGISTRAR_RECEITA:
        return financeService.registerIncome(tid, entities, originalText);

      case IntentType.CONSULTAR_SALDO:
        return financeService.getBalance(tid, entities);

      case IntentType.DEFINIR_LIMITE:
        return financeService.setBudget(tid, entities, originalText);

      case IntentType.CANCELAR_TRANSACAO:
        return financeService.deleteLastTransaction(tid, entities, originalText);

      // --- Anotações ---
      case IntentType.ANOTAR:
        return notesService.createNote(tid, entities, originalText);

      case IntentType.LISTAR_NOTAS:
        return notesService.listNotes(tid, entities);

      // --- Conversa Livre / Atendente Virtual ---
      case IntentType.ATIVAR_ATENDENTE:
        return conversationService.activateAttendant(tid, entities);

      case IntentType.DESATIVAR_ATENDENTE:
        return conversationService.deactivateAttendant(tid);

      case IntentType.TREINAR_AGENTE:
        return conversationService.trainAgent(tid, entities, originalText);

      case IntentType.FALAR_COM_HUMANO:
        return conversationService.transferToHuman(tid, message.phone);

      case IntentType.CONVERSA_LIVRE:
        return conversationService.handleConversation(
          tid,
          message.phone,
          message.senderName,
          originalText
        );

      // --- Sistema ---
      case IntentType.RELATORIO:
        return pdfGenerator.generateMonthlyReport(tid);

      case IntentType.SAUDACAO:
        return {
          text: `Olá, ${message.senderName}! 👋\n\nSou a *EVA*, sua assistente virtual. Como posso te ajudar?\n\n📅 *Agenda* — marcar, listar ou cancelar compromissos\n💰 *Financeiro* — registrar gastos, receitas e ver saldo\n📝 *Anotações* — salvar lembretes e notas rápidas\n\nÉ só me dizer o que precisa! 😊`,
        };

      case IntentType.AJUDA:
        return {
          text: `🤖 *O que eu posso fazer:*\n\n📅 *Agenda:*\n• "Marca reunião amanhã às 14h"\n• "O que tenho pra hoje?"\n• "Muda a reunião para sexta às 15h"\n• "Cancela a reunião de amanhã"\n\n💰 *Financeiro:*\n• "Gastei 150 de combustível"\n• "Recebi 3.500 do cliente X"\n• "Como tá meu financeiro?"\n• "Limite de gastos: 8 mil"\n• "Cancela o último gasto"\n\n📝 *Anotações:*\n• "Anota: ligar pro contador segunda"\n• "Quais são minhas anotações?"\n\n📊 *Relatórios:*\n• "Relatório de fevereiro"\n\n🤖 *Atendente Virtual:*\n• "Ativar atendente" — Liga o modo conversa livre\n• "Treinar: produto X custa R$ 50" — Ensina o agente\n• "Desativar atendente" — Desliga o modo conversa\n\nVocê pode enviar por *texto* ou *áudio*! 🎤`,
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
          tenantId: message.tenantId,
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
    }
  }
}

export const messageRouter = new MessageRouter();
