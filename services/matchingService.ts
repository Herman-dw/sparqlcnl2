/**
 * Matching Service - v1.0.0
 * API service voor profiel-naar-beroep matching
 */

import { 
  MatchProfile, 
  MatchResponse, 
  MatchOptions,
  SkillSearchResponse,
  SkillSearchResult 
} from '../types/matching';

// Backend URL (gebruikt dezelfde als de rest van de app)
const getBackendUrl = () => {
  return localStorage.getItem('local_backend_url') || 'http://localhost:3001';
};

// ============================================================
// MATCH PROFILE
// ============================================================

/**
 * Match een profiel tegen alle beroepen in de database
 */
export async function matchProfile(
  profile: MatchProfile,
  options: MatchOptions = {}
): Promise<MatchResponse> {
  const backendUrl = getBackendUrl();
  
  const queryParams = new URLSearchParams();
  if (options.limit) queryParams.set('limit', String(options.limit));
  if (options.minScore) queryParams.set('minScore', String(options.minScore));
  if (options.includeGaps !== undefined) queryParams.set('includeGaps', String(options.includeGaps));
  if (options.includeMatched !== undefined) queryParams.set('includeMatched', String(options.includeMatched));
  
  const url = `${backendUrl}/api/match-profile?${queryParams.toString()}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Match profile error:', error);
    return {
      success: false,
      matches: [],
      meta: {
        executionTime: 0,
        totalCandidates: 0,
        returnedMatches: 0,
        weights: { skills: 0.5, knowledge: 0.3, tasks: 0.2 }
      },
      error: error instanceof Error ? error.message : 'Onbekende fout'
    };
  }
}

// ============================================================
// SKILL SEARCH (voor autocomplete)
// ============================================================

/**
 * Zoek naar vaardigheden voor autocomplete
 * Let op: backend gebruikt 'capability' als conceptType, niet 'skill'
 */
export async function searchSkills(
  query: string,
  limit: number = 10
): Promise<SkillSearchResponse> {
  const backendUrl = getBackendUrl();
  
  // Gebruik het bestaande concept resolve endpoint
  // BELANGRIJK: backend noemt dit 'capability', niet 'skill'
  try {
    const response = await fetch(`${backendUrl}/concept/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchTerm: query,
        conceptType: 'capability'  // <-- Dit was 'skill', moet 'capability' zijn
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    
    const data = await response.json();
    
    // Transform naar SkillSearchResult format
    // FILTER: synthetische matches (beginnen met 'synthetic:') worden uitgesloten
    const results: SkillSearchResult[] = (data.matches || [])
      .filter((match: any) => !match.uri?.startsWith('synthetic:'))  // <-- Filter verzonnen items
      .slice(0, limit)
      .map((match: any) => ({
        uri: match.uri,
        label: match.prefLabel || match.label,
        category: match.category,
        matchType: match.matchType || 'fuzzy',
        confidence: match.confidence || 0.5
      }));
    
    return {
      success: true,
      results,
      query
    };
  } catch (error) {
    console.error('Skill search error:', error);
    return {
      success: false,
      results: [],
      query
    };
  }
}

/**
 * Zoek naar kennisgebieden voor autocomplete
 */
export async function searchKnowledge(
  query: string,
  limit: number = 10
): Promise<SkillSearchResponse> {
  const backendUrl = getBackendUrl();
  
  try {
    const response = await fetch(`${backendUrl}/concept/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        searchTerm: query,
        conceptType: 'knowledge'
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    
    const data = await response.json();
    
    // FILTER: synthetische matches (beginnen met 'synthetic:') worden uitgesloten
    const results: SkillSearchResult[] = (data.matches || [])
      .filter((match: any) => !match.uri?.startsWith('synthetic:'))  // <-- Filter verzonnen items
      .slice(0, limit)
      .map((match: any) => ({
        uri: match.uri,
        label: match.prefLabel || match.label,
        matchType: match.matchType || 'fuzzy',
        confidence: match.confidence || 0.5
      }));
    
    return {
      success: true,
      results,
      query
    };
  } catch (error) {
    console.error('Knowledge search error:', error);
    return {
      success: false,
      results: [],
      query
    };
  }
}

// ============================================================
// HEALTH CHECK
// ============================================================

/**
 * Check of de matching service beschikbaar is
 */
export async function checkMatchingHealth(): Promise<{
  available: boolean;
  status: string;
  idfWeightsCount?: number;
}> {
  const backendUrl = getBackendUrl();
  
  try {
    const response = await fetch(`${backendUrl}/api/match-profile/health`);
    
    if (!response.ok) {
      return { available: false, status: 'offline' };
    }
    
    const data = await response.json();
    
    return {
      available: data.status === 'ok',
      status: data.status,
      idfWeightsCount: data.checks?.database?.idfWeightsCount
    };
  } catch (error) {
    return { available: false, status: 'unreachable' };
  }
}

// ============================================================
// PRELOAD CACHE
// ============================================================

/**
 * Preload de matching cache (voor snellere eerste query)
 */
export async function preloadMatchingCache(): Promise<boolean> {
  const backendUrl = getBackendUrl();
  
  try {
    const response = await fetch(`${backendUrl}/api/match-profile/preload`, {
      method: 'POST'
    });
    
    return response.ok;
  } catch (error) {
    console.warn('Failed to preload matching cache:', error);
    return false;
  }
}

// ============================================================
// OCCUPATION REQUIREMENTS (voor Fase 2)
// ============================================================

/**
 * Haal de vaardigheden van een beroep op
 * (Voor Fase 2: profiel bouwen vanuit werkervaring)
 */
export async function getOccupationRequirements(
  occupationUri: string
): Promise<{
  success: boolean;
  occupation?: { uri: string; label: string };
  skills?: Array<{ uri: string; label: string; relevance: string }>;
  knowledge?: Array<{ uri: string; label: string; relevance: string }>;
  tasks?: Array<{ uri: string; label: string; relevance: string }>;
  error?: string;
}> {
  const backendUrl = getBackendUrl();
  
  try {
    // Dit endpoint bestaat nog niet - placeholder voor Fase 2
    const response = await fetch(
      `${backendUrl}/api/occupation/${encodeURIComponent(occupationUri)}/requirements`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Get occupation requirements error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Onbekende fout'
    };
  }
}
