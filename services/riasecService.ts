/**
 * RIASEC Service - v1.0.0
 * API service voor RIASEC capabilities ophalen
 */

// Types
export interface RiasecLetterInfo {
  code: string;
  name: string;
  dutch: string;
  description: string;
}

export interface Capability {
  uri: string;
  label: string;
}

export interface RiasecCapabilitiesResponse {
  success: boolean;
  letter: string;
  name: string;
  dutch: string;
  description: string;
  capabilities: Capability[];
  totalCount: number;
  error?: string;
}

export interface RiasecBatchResponse {
  success: boolean;
  letters: string[];
  results: Record<string, RiasecCapabilitiesResponse>;
  error?: string;
}

export interface RiasecResult {
  code: string;  // e.g., "SIA"
  scores: Array<[string, number]>;  // e.g., [["S", 18], ["I", 15], ["A", 12], ...]
}

// Backend URL
const getBackendUrl = () => {
  return localStorage.getItem('local_backend_url') || 'http://localhost:3001';
};

/**
 * Haal capabilities op voor een enkele RIASEC letter
 */
export async function getCapabilitiesForLetter(
  letter: string
): Promise<RiasecCapabilitiesResponse> {
  const backendUrl = getBackendUrl();
  
  try {
    const response = await fetch(
      `${backendUrl}/api/riasec/capabilities/${letter.toUpperCase()}`
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('RIASEC capabilities error:', error);
    return {
      success: false,
      letter: letter.toUpperCase(),
      name: '',
      dutch: '',
      description: '',
      capabilities: [],
      totalCount: 0,
      error: error instanceof Error ? error.message : 'Onbekende fout'
    };
  }
}

/**
 * Haal capabilities op voor meerdere RIASEC letters tegelijk
 */
export async function getCapabilitiesForLetters(
  letters: string[]
): Promise<RiasecBatchResponse> {
  const backendUrl = getBackendUrl();
  
  try {
    const response = await fetch(`${backendUrl}/api/riasec/capabilities/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ letters: letters.map(l => l.toUpperCase()) })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('RIASEC batch capabilities error:', error);
    return {
      success: false,
      letters: [],
      results: {},
      error: error instanceof Error ? error.message : 'Onbekende fout'
    };
  }
}

/**
 * Haal capabilities op voor de top-3 letters uit een RIASEC resultaat
 */
export async function getCapabilitiesForRiasecResult(
  result: RiasecResult
): Promise<RiasecBatchResponse> {
  // Extract top 3 letters from the code
  const topLetters = result.code.split('').slice(0, 3);
  return getCapabilitiesForLetters(topLetters);
}

/**
 * Haal informatie op over alle RIASEC letters
 */
export async function getRiasecInfo(): Promise<{
  success: boolean;
  letters: RiasecLetterInfo[];
  error?: string;
}> {
  const backendUrl = getBackendUrl();
  
  try {
    const response = await fetch(`${backendUrl}/api/riasec/info`);
    
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('RIASEC info error:', error);
    return {
      success: false,
      letters: [],
      error: error instanceof Error ? error.message : 'Onbekende fout'
    };
  }
}

// RIASEC letter informatie (fallback voor offline gebruik)
export const RIASEC_LETTERS: Record<string, RiasecLetterInfo> = {
  R: { code: 'R', name: 'Realistic', dutch: 'Praktisch', description: 'Praktische vaardigheden' },
  I: { code: 'I', name: 'Investigative', dutch: 'Onderzoekend', description: 'Onderzoekende vaardigheden' },
  A: { code: 'A', name: 'Artistic', dutch: 'Artistiek', description: 'Creatieve vaardigheden' },
  S: { code: 'S', name: 'Social', dutch: 'Sociaal', description: 'Sociale vaardigheden' },
  E: { code: 'E', name: 'Enterprising', dutch: 'Ondernemend', description: 'Ondernemende vaardigheden' },
  C: { code: 'C', name: 'Conventional', dutch: 'Conventioneel', description: 'Organisatorische vaardigheden' }
};
