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

const getSparqlEndpoint = () => {
  return localStorage.getItem('sparql_url') || 'https://sparql.competentnl.nl';
};

const pushUnique = (collection: ProfileItem[], item: ProfileItem) => {
  if (!collection.find((i) => i.label.toLowerCase() === item.label.toLowerCase())) {
    collection.push(item);
  }
};

const buildSource = (label: string): ProfileSource => ({
  id: `resolved-${label}`,
  label,
  type: 'wizard'
});

async function resolveConcept(
  searchTerm: string,
  conceptType: 'occupation' | 'education'
): Promise<{ uri: string; prefLabel: string; matchedLabel?: string } | null> {
  const backendUrl = getBackendUrl();
  const response = await fetch(`${backendUrl}/concept/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ searchTerm, conceptType })
  });

  if (!response.ok) {
    throw new Error(`Resolve error ${response.status}`);
  }

  const data = await response.json();
  const firstMatch = (data.matches || [])[0];
  if (!firstMatch?.uri) return null;

  return {
    uri: firstMatch.uri,
    prefLabel: firstMatch.prefLabel || firstMatch.matchedLabel || searchTerm,
    matchedLabel: firstMatch.matchedLabel
  };
}

async function fetchOccupationProfile(uri: string) {
  const endpoint = getSparqlEndpoint();
  const backendUrl = getBackendUrl();

  const query = `
    PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
    PREFIX cnluwv: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>
    PREFIX cnluwvo: <https://linkeddata.competentnl.nl/def/uwv-ontology#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    SELECT DISTINCT ?capability ?capLabel ?knowledge ?knowledgeLabel ?task ?taskLabel ?condition ?conditionLabel WHERE {
      BIND(<${uri}> AS ?occ)
      OPTIONAL {
        ?occ cnlo:requiresHATEssential|cnlo:requiresHATImportant|cnlo:requiresHATSomewhat ?capability .
        ?capability a cnlo:HumanCapability .
        FILTER NOT EXISTS { ?capability a cnlo:KnowledgeArea }
        ?capability skos:prefLabel ?capLabel .
      }
      OPTIONAL {
        ?occ cnlo:requiresHATEssential|cnlo:requiresHATImportant|cnlo:requiresHATSomewhat ?knowledge .
        ?knowledge a cnlo:KnowledgeArea ;
                  skos:prefLabel ?knowledgeLabel .
      }
      OPTIONAL {
        VALUES ?taskPred {
          cnluwvo:isCharacterizedByOccupationTask_Essential
          cnluwvo:isCharacterizedByOccupationTask_Optional
          cnluwv:isCharacterizedByOccupationTask_Essential
          cnluwv:isCharacterizedByOccupationTask_Important
          cnluwv:isCharacterizedByOccupationTask_Optional
          cnluwv:isCharacterizedByOccupationTask_Somewhat
        }
        ?occ ?taskPred ?task .
        ?task skos:prefLabel ?taskLabel .
      }
      OPTIONAL {
        VALUES ?conditionPred {
          cnluwvo:hasWorkCondition
          cnluwvo:hasWorkContext
          cnluwv:hasWorkCondition
          cnluwv:hasWorkContext
          cnlo:hasWorkingCondition
          cnlo:hasWorkContext
        }
        ?occ ?conditionPred ?condition .
        ?condition skos:prefLabel ?conditionLabel .
      }
    }
  `;

  const response = await fetch(`${backendUrl}/proxy/sparql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, endpoint })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `SPARQL error ${response.status}`);
  }

  const data = await response.json();
  const bindings = data.results?.bindings || [];

  const capabilities: ProfileItem[] = [];
  const knowledge: ProfileItem[] = [];
  const tasks: ProfileItem[] = [];
  const workConditions: ProfileItem[] = [];

  bindings.forEach((row: any) => {
    if (row.capability?.value && row.capLabel?.value) {
      pushUnique(capabilities, {
        uri: row.capability.value,
        label: row.capLabel.value,
        type: 'skill'
      });
    }
    if (row.knowledge?.value && row.knowledgeLabel?.value) {
      pushUnique(knowledge, {
        uri: row.knowledge.value,
        label: row.knowledgeLabel.value,
        type: 'knowledge'
      });
    }
    if (row.task?.value && row.taskLabel?.value) {
      pushUnique(tasks, {
        uri: row.task.value,
        label: row.taskLabel.value,
        type: 'task'
      });
    }
    if (row.condition?.value && row.conditionLabel?.value) {
      pushUnique(workConditions, {
        uri: row.condition.value,
        label: row.conditionLabel.value,
        type: 'workCondition'
      });
    }
  });

  return { capabilities, knowledge, tasks, workConditions };
}

async function fetchEducationProfile(uri: string) {
  const endpoint = getSparqlEndpoint();
  const backendUrl = getBackendUrl();

  const query = `
    PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    SELECT DISTINCT ?capability ?capLabel ?knowledge ?knowledgeLabel WHERE {
      BIND(<${uri}> AS ?edu)
      OPTIONAL {
        VALUES ?capPred {
          cnlo:prescribesHATEssential
          cnlo:prescribesHATImportant
          cnlo:prescribesHATSomewhat
        }
        ?edu ?capPred ?capability .
        ?capability a cnlo:HumanCapability .
        FILTER NOT EXISTS { ?capability a cnlo:KnowledgeArea }
        ?capability skos:prefLabel ?capLabel .
      }
      OPTIONAL {
        VALUES ?knowledgePred {
          cnlo:prescribesKnowledge
          cnlo:prescribesKnowledgeEssential
          cnlo:prescribesKnowledgeImportant
          cnlo:prescribesKnowledgeSomewhat
        }
        ?edu ?knowledgePred ?knowledge .
        ?knowledge a cnlo:KnowledgeArea ;
                  skos:prefLabel ?knowledgeLabel .
      }
    }
  `;

  const response = await fetch(`${backendUrl}/proxy/sparql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, endpoint })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `SPARQL error ${response.status}`);
  }

  const data = await response.json();
  const bindings = data.results?.bindings || [];

  const capabilities: ProfileItem[] = [];
  const knowledge: ProfileItem[] = [];

  bindings.forEach((row: any) => {
    if (row.capability?.value && row.capLabel?.value) {
      pushUnique(capabilities, {
        uri: row.capability.value,
        label: row.capLabel.value,
        type: 'skill'
      });
    }
    if (row.knowledge?.value && row.knowledgeLabel?.value) {
      pushUnique(knowledge, {
        uri: row.knowledge.value,
        label: row.knowledgeLabel.value,
        type: 'knowledge'
      });
    }
  });

  return { capabilities, knowledge, tasks: [], workConditions: [] };
}

export async function fetchProfileSuggestions(
  payload: ProfileSuggestionRequest
): Promise<ProfileSuggestionsResponse> {
  const backendUrl = getBackendUrl();
  const isEducation = payload.kind === 'education';
  const resolveTerm = payload.title || payload.description || payload.organization || '';

  try {
    const resolved = resolveTerm ? await resolveConcept(resolveTerm, isEducation ? 'education' : 'occupation') : null;
    if (!resolved) {
      return {
        ...DEFAULT_EMPTY_RESPONSE,
        error: 'Geen match gevonden in CompetentNL voor deze invoer'
      };
    }

    const source = buildSource(resolved.prefLabel);
    const profile = isEducation
      ? await fetchEducationProfile(resolved.uri)
      : await fetchOccupationProfile(resolved.uri);

    const mapCategory = (items: ProfileItem[]): ProfileItemWithSource[] =>
      (items || []).map((item) => ({
        ...item,
        sources: [source]
      }));

    return {
      success: true,
      capabilities: mapCategory(profile.capabilities),
      knowledge: mapCategory(profile.knowledge),
      workConditions: mapCategory(profile.workConditions),
      tasks: mapCategory(profile.tasks),
      resolvedLabel: resolved.prefLabel,
      resolvedMatchLabel: resolved.matchedLabel,
      resolvedUri: resolved.uri,
      meta: {
        cached: false
      }
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
