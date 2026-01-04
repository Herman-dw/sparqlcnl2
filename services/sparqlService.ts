
import { WHITELIST_PREDICATES } from "../constants";

export type ProxyType = 'none' | 'local' | 'codetabs' | 'allorigins' | 'corsproxy';

export const executeSparql = async (
  query: string, 
  endpoint: string, 
  authHeader?: string,
  proxyType: ProxyType = 'local',
  localBackendUrl: string = 'http://localhost:3001'
): Promise<any[]> => {
  const cleanKey = authHeader?.trim() || '';
  
  // Methode 1: Via de lokale backend (Meest betrouwbaar)
  if (proxyType === 'local') {
    try {
      const response = await fetch(`${localBackendUrl}/proxy/sparql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint,
          query,
          key: cleanKey
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.details || errData.error || `Server fout ${response.status}`);
      }

      const data = await response.json();
      return processBindings(data);
    } catch (e: any) {
      if (e.message.includes('Failed to fetch')) {
        throw new Error("Lokale backend niet gevonden. Start 'node server.js' op poort 3001.");
      }
      throw e;
    }
  }

  // Methode 2: Direct of via publieke proxy (bestaande logica)
  const bodyParams = new URLSearchParams();
  bodyParams.append('query', query);
  bodyParams.append('format', 'application/sparql-results+json');
  if (cleanKey) bodyParams.append('key', cleanKey);

  let finalUrl = endpoint;
  let method = 'POST';
  let fetchOptions: RequestInit = {
    method,
    headers: {
      'Accept': 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    mode: 'cors'
  };

  if (proxyType !== 'none') {
    method = 'GET';
    const target = `${endpoint}?${bodyParams.toString()}`;
    if (proxyType === 'codetabs') finalUrl = `https://api.codetabs.com/v1/proxy?url=${encodeURIComponent(target)}`;
    else if (proxyType === 'allorigins') finalUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`;
    else if (proxyType === 'corsproxy') finalUrl = `https://corsproxy.io/?${encodeURIComponent(target)}`;
    
    fetchOptions.method = 'GET';
    delete (fetchOptions as any).body;
  } else {
    fetchOptions.body = bodyParams;
    if (cleanKey) {
      (fetchOptions.headers as any)['Authorization'] = `Bearer ${cleanKey}`;
      (fetchOptions.headers as any)['X-API-Key'] = cleanKey;
    }
  }

  const response = await fetch(finalUrl, fetchOptions);
  if (!response.ok) {
    if (response.status === 429) throw new Error("Rate limit bereikt op publieke proxy. Gebruik de 'Lokale Backend'.");
    throw new Error(`Endpoint fout ${response.status}`);
  }

  const data = await response.json();
  return processBindings(data);
};

const processBindings = (data: any): any[] => {
  if (data.boolean !== undefined) return [{ result: data.boolean }];
  if (!data.results || !data.results.bindings) return [];
  return data.results.bindings.map((binding: any) => {
    const obj: any = {};
    Object.keys(binding).forEach(key => {
      obj[key] = binding[key].value;
    });
    return obj;
  });
};

export const validateSparqlQuery = (query: string, selectedGraphs: string[]): { valid: boolean; error?: string } => {
  const upper = query.toUpperCase();
  if (/\b(INSERT|DELETE|UPDATE|DROP|CLEAR)\b/.test(upper)) return { valid: false, error: "Alleen lees-queries toegestaan." };
  
  // COUNT queries hoeven geen LIMIT - ze geven altijd maar 1 rij terug
  const hasCount = upper.includes('COUNT(') || upper.includes('COUNT (');
  const hasLimit = upper.includes('LIMIT');
  const hasAsk = upper.includes('ASK');
  
  if (!hasLimit && !hasAsk && !hasCount) {
    return { valid: false, error: "LIMIT is verplicht." };
  }
  
  return { valid: true };
};
