export interface SonarMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface SonarRequest {
  model: string;
  messages: SonarMessage[];
  stream?: boolean;
  temperature?: number;
}

export interface SonarDelta {
  content?: string;
  role?: string;
}

export interface SonarChoice {
  index: number;
  delta?: SonarDelta;
  message?: SonarMessage;
  finish_reason?: string | null;
}

export interface SonarChunk {
  id: string;
  model: string;
  created: number;
  choices: SonarChoice[];
  citations?: string[];
}
