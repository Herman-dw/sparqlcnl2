import { ProfileItem } from './matching';

export type ProfileSourceType = 'wizard' | 'riasec' | 'manual' | 'import' | 'unknown';

export interface ProfileSource {
  id: string;
  label: string;
  type: ProfileSourceType;
}

export interface ProfileHistoryEntry {
  id: string;
  kind: 'work' | 'education';
  title: string;
  organization: string;
  years: string;
  description: string;
}

export interface ProfileItemWithSource extends ProfileItem {
  sources: ProfileSource[];
}

export interface SessionProfile {
  skills: ProfileItemWithSource[];
  knowledge: ProfileItemWithSource[];
  tasks: ProfileItemWithSource[];
  workConditions: ProfileItemWithSource[];
}

export type ProfileSuggestionCategory = 'capability' | 'knowledge' | 'workCondition' | 'task';

export interface ProfileSuggestion extends ProfileItem {
  score?: number;
  source?: string;
  category?: ProfileSuggestionCategory;
}

export interface ProfileSuggestionRequest {
  title: string;
  organization?: string;
  years?: string;
  description?: string;
  kind?: 'work' | 'education';
}

export interface ProfileSuggestionsResponse {
  success: boolean;
  capabilities: ProfileSuggestion[];
  knowledge: ProfileSuggestion[];
  workConditions: ProfileSuggestion[];
  tasks: ProfileSuggestion[];
  meta?: {
    cached?: boolean;
    durationMs?: number;
  };
  error?: string;
}
