import { ProfileItem } from '../types/matching';
import {
  ProfileItemWithSource,
  ProfileSuggestionRequest,
  ProfileSuggestionsResponse,
  ProfileSource
} from '../types/profile';

const getBackendUrl = () => {
  return localStorage.getItem('local_backend_url') || 'http://localhost:3001';
};

const DEFAULT_EMPTY_RESPONSE: ProfileSuggestionsResponse = {
  success: false,
  capabilities: [],
  knowledge: [],
  workConditions: [],
  tasks: [],
  error: 'Geen suggesties beschikbaar'
};

export async function fetchProfileSuggestions(
  payload: ProfileSuggestionRequest
): Promise<ProfileSuggestionsResponse> {
  const backendUrl = getBackendUrl();

  try {
    const response = await fetch(`${backendUrl}/api/profile-builder/suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error ${response.status}`);
    }

    const data = await response.json();

    return {
      success: data.success !== false,
      capabilities: data.capabilities || [],
      knowledge: data.knowledge || [],
      workConditions: data.workConditions || [],
      tasks: data.tasks || [],
      meta: data.meta,
      error: data.error
    };
  } catch (error) {
    console.error('Profile suggestions error:', error);
    return {
      ...DEFAULT_EMPTY_RESPONSE,
      error: error instanceof Error ? error.message : DEFAULT_EMPTY_RESPONSE.error
    };
  }
}

export function createDebouncedProfileSuggestor(delay = 450) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let lastReject: ((reason?: any) => void) | null = null;

  return (payload: ProfileSuggestionRequest): Promise<ProfileSuggestionsResponse> => {
    if (timeout) {
      clearTimeout(timeout);
    }
    if (lastReject) {
      lastReject();
    }

    return new Promise((resolve, reject) => {
      lastReject = reject;
      timeout = setTimeout(async () => {
        try {
          const result = await fetchProfileSuggestions(payload);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      }, delay);
    });
  };
}

export function mapSuggestionsToItems(
  suggestions: ProfileSuggestionsResponse,
  source: ProfileSource
): {
  skills: ProfileItemWithSource[];
  knowledge: ProfileItemWithSource[];
  tasks: ProfileItemWithSource[];
  workConditions: ProfileItemWithSource[];
} {
  const mapCategory = (items: ProfileItem[], type: ProfileItem['type']): ProfileItemWithSource[] =>
    (items || []).map((item) => ({
      ...item,
      type: item.type || type,
      sources: [source]
    }));

  return {
    skills: mapCategory(suggestions.capabilities, 'skill'),
    knowledge: mapCategory(suggestions.knowledge, 'knowledge'),
    tasks: mapCategory(suggestions.tasks, 'task'),
    workConditions: mapCategory(suggestions.workConditions, 'workCondition')
  };
}
