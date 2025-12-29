/**
 * Matching Types - v1.0.0
 * TypeScript type definities voor profiel matching
 */

// ============================================================
// PROFIEL TYPES
// ============================================================

export interface MatchProfile {
  skills: string[];
  knowledge?: string[];
  tasks?: string[];
}

export interface ProfileItem {
  uri: string;
  label: string;
  type: 'skill' | 'knowledge' | 'task';
  source?: string;
  relevance?: 'essential' | 'important' | 'somewhat';
}

// ============================================================
// MATCH RESULTATEN
// ============================================================

export interface MatchResult {
  occupation: {
    uri: string;
    label: string;
  };
  score: number;
  breakdown: {
    skills: DimensionScore;
    knowledge: DimensionScore;
    tasks: DimensionScore;
  };
  gaps?: {
    skills: GapItem[];
    knowledge: GapItem[];
    tasks: GapItem[];
  };
  matched?: {
    skills: MatchedItem[];
    knowledge: MatchedItem[];
    tasks: MatchedItem[];
  };
}

export interface DimensionScore {
  score: number;
  weight: number;
  matchedCount: number;
  totalCount: number;
}

export interface GapItem {
  uri?: string;
  label: string;
  relevance: 'essential' | 'important' | 'somewhat' | 'optional';
  idf?: number;
}

export interface MatchedItem {
  uri?: string;
  label: string;
  relevance: 'essential' | 'important' | 'somewhat' | 'optional';
  idf?: number;
}

// ============================================================
// API RESPONSES
// ============================================================

export interface MatchResponse {
  success: boolean;
  matches: MatchResult[];
  meta: MatchMeta;
  error?: string;
}

export interface MatchMeta {
  executionTime: number;
  totalCandidates: number;
  matchedCandidates?: number;
  returnedMatches: number;
  resolvedProfile?: ResolvedProfile;
  weights: {
    skills: number;
    knowledge: number;
    tasks: number;
  };
  cacheInfo?: {
    cached: boolean;
    cacheAge: number | null;
  };
}

export interface ResolvedProfile {
  skills: ResolvedItem[];
  knowledge: ResolvedItem[];
  tasks: ResolvedItem[];
}

export interface ResolvedItem {
  input: string;
  resolved: string;
  uri: string;
}

// ============================================================
// SKILL SEARCH
// ============================================================

export interface SkillSearchResult {
  uri: string;
  label: string;
  category?: string;
  matchType: 'exact' | 'synonym' | 'fuzzy';
  confidence: number;
}

export interface SkillSearchResponse {
  success: boolean;
  results: SkillSearchResult[];
  query: string;
}

// ============================================================
// MATCH OPTIONS
// ============================================================

export interface MatchOptions {
  limit?: number;
  minScore?: number;
  includeGaps?: boolean;
  includeMatched?: boolean;
}

// ============================================================
// UI STATE
// ============================================================

export type MatchModalView = 'builder' | 'loading' | 'results' | 'error';

export interface MatchModalState {
  view: MatchModalView;
  profile: MatchProfile;
  results: MatchResult[];
  error: string | null;
  isLoading: boolean;
}
