// ============================================
// TIPOS CENTRAIS DO EVA
// ============================================

/**
 * Todas as intenções reconhecidas pelo sistema
 */
export enum IntentType {
  // Agenda
  AGENDAR = 'AGENDAR',
  LISTAR_AGENDA = 'LISTAR_AGENDA',
  CANCELAR_EVENTO = 'CANCELAR_EVENTO',

  // Financeiro
  REGISTRAR_DESPESA = 'REGISTRAR_DESPESA',
  REGISTRAR_RECEITA = 'REGISTRAR_RECEITA',
  CONSULTAR_SALDO = 'CONSULTAR_SALDO',
  DEFINIR_LIMITE = 'DEFINIR_LIMITE',

  // Anotações
  ANOTAR = 'ANOTAR',
  LISTAR_NOTAS = 'LISTAR_NOTAS',

  // Sistema
  RELATORIO = 'RELATORIO',
  AJUDA = 'AJUDA',
  SAUDACAO = 'SAUDACAO',
  DESCONHECIDO = 'DESCONHECIDO',
}

/**
 * Resultado da classificação (tanto por regras quanto por IA)
 */
export interface ClassificationResult {
  intent: IntentType;
  entities: ExtractedEntities;
  confidence: number;
  source: 'rules' | 'ai';
}

/**
 * Entidades extraídas da mensagem
 */
export interface ExtractedEntities {
  date?: string;          // Data extraída (ISO string)
  time?: string;          // Hora extraída (HH:mm)
  amount?: number;        // Valor monetário
  category?: string;      // Categoria (financeira ou evento)
  title?: string;         // Título do evento ou nota
  description?: string;   // Descrição adicional
  location?: string;      // Local do evento
  person?: string;        // Nome de pessoa mencionada
  period?: string;        // Período (hoje, esta semana, este mês)
  [key: string]: unknown; // Entidades adicionais
}

/**
 * Mensagem recebida (após pré-processamento)
 */
export interface IncomingMessage {
  phone: string;
  senderName: string;
  text: string | null;
  audio: AudioMessage | null;
  messageId: string;
  timestamp: number;
}

/**
 * Dados de mensagem de áudio
 */
export interface AudioMessage {
  url: string;
  mimetype: string;
  seconds: number;
}

/**
 * Resposta formatada para envio
 */
export interface ResponseMessage {
  text: string;
  buttons?: WhatsAppButton[];
  document?: {
    url: string;
    filename: string;
    mimetype: string;
  };
}

/**
 * Botão interativo do WhatsApp
 */
export interface WhatsAppButton {
  id: string;
  text: string;
}
