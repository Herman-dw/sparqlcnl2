
export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  role: MessageRole;
  text: string;
  sparql?: string;
  results?: any[];
  timestamp: Date;
  status: 'pending' | 'success' | 'error';
  feedback?: 'like' | 'dislike';
  needsList?: boolean;
  listSparql?: string;
  sourceQuestion?: string;
  metadata?: {
    graphs?: string[];
    endpoint?: string;
    error?: string;
    isDisambiguation?: boolean;
    needsList?: boolean;
  };
}

export interface SparqlExample {
  vraag: string;
  query: string;
}

export interface SchemaHint {
  prefix: string;
  uri: string;
  description: string;
}

export interface AppState {
  messages: Message[];
  selectedGraphs: string[];
  contentStatus: string;
  resourceType: string;
  showSparql: boolean;
  isLoading: boolean;
}

export enum ResourceType {
  Occupation = 'cnlo:Occupation',
  HumanCapability = 'cnlo:HumanCapability',
  All = ''
}
