/**
 * Occupation Resolver Service
 * ===========================
 * Lost beroepsnamen op naar officiële occupation URIs.
 * Zoekt in prefLabels, altLabels, specialisaties en synoniemen.
 * Kan suggesties geven als er geen exacte match is.
 */

import mysql from 'mysql2/promise';

const DB_CONFIG = {
  host: process.env.MARIADB_HOST || 'localhost',
  port: parseInt(process.env.MARIADB_PORT || '3306'),
  user: process.env.MARIADB_USER || 'root',
  password: process.env.MARIADB_PASSWORD || '',
  database: process.env.MARIADB_DATABASE || 'competentnl_rag'
};

let pool: mysql.Pool | null = null;

async function getPool(): Promise<mysql.Pool> {
  if (!pool) {
    pool = mysql.createPool({
      ...DB_CONFIG,
      waitForConnections: true,
      connectionLimit: 10
    });
  }
  return pool;
}

// Normaliseer tekst voor zoeken
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resultaat van een occupation lookup
 */
export interface OccupationMatch {
  uri: string;
  prefLabel: string;
  matchedLabel: string;
  matchType: 'exact' | 'fuzzy' | 'synonym' | 'contains';
  labelType: string;
  confidence: number;
}

export interface ResolveResult {
  found: boolean;
  exact: boolean;
  searchTerm: string;
  matches: OccupationMatch[];
  suggestion?: string;
  needsConfirmation: boolean;
}

/**
 * Zoek een beroep op basis van een zoekterm
 */
export async function resolveOccupation(searchTerm: string): Promise<ResolveResult> {
  const db = await getPool();
  const normalized = normalize(searchTerm);
  
  const result: ResolveResult = {
    found: false,
    exact: false,
    searchTerm,
    matches: [],
    needsConfirmation: false
  };

  // 1. Exacte match op genormaliseerde label
  const [exactMatches] = await db.execute(`
    SELECT DISTINCT 
      occupation_uri as uri,
      pref_label as prefLabel,
      label as matchedLabel,
      label_type as labelType,
      1.0 as confidence
    FROM occupation_labels
    WHERE label_normalized = ?
    ORDER BY 
      CASE label_type 
        WHEN 'prefLabel' THEN 1 
        WHEN 'altLabel' THEN 2 
        WHEN 'specialization' THEN 3 
        ELSE 4 
      END
    LIMIT 10
  `, [normalized]) as any[];

  if (exactMatches.length > 0) {
    result.found = true;
    result.exact = true;
    result.matches = exactMatches.map((m: any) => ({
      ...m,
      matchType: 'exact' as const
    }));
    
    // Als er maar 1 uniek beroep is, geen bevestiging nodig
    const uniqueUris = new Set(exactMatches.map((m: any) => m.uri));
    result.needsConfirmation = uniqueUris.size > 1;
    
    await logSearch(db, searchTerm, normalized, true, false, exactMatches.length);
    return result;
  }

  // 2. Check handmatige synoniemen
  const [synonymMatches] = await db.execute(`
    SELECT DISTINCT
      occupation_uri as uri,
      pref_label as prefLabel,
      synonym as matchedLabel,
      'synonym' as labelType,
      confidence
    FROM occupation_synonyms
    WHERE synonym_normalized = ?
    ORDER BY confidence DESC
    LIMIT 10
  `, [normalized]) as any[];

  if (synonymMatches.length > 0) {
    result.found = true;
    result.exact = true;
    result.matches = synonymMatches.map((m: any) => ({
      ...m,
      matchType: 'synonym' as const
    }));
    
    await logSearch(db, searchTerm, normalized, true, false, synonymMatches.length);
    return result;
  }

  // 3. Fuzzy match - CONTAINS op genormaliseerde label
  const [containsMatches] = await db.execute(`
    SELECT DISTINCT
      occupation_uri as uri,
      pref_label as prefLabel,
      label as matchedLabel,
      label_type as labelType,
      CASE 
        WHEN label_normalized = ? THEN 1.0
        WHEN label_normalized LIKE ? THEN 0.9
        WHEN label_normalized LIKE ? THEN 0.8
        ELSE 0.7
      END as confidence
    FROM occupation_labels
    WHERE label_normalized LIKE ?
    ORDER BY confidence DESC, LENGTH(label) ASC
    LIMIT 15
  `, [
    normalized,
    normalized + '%',      // starts with
    '%' + normalized,      // ends with
    '%' + normalized + '%' // contains
  ]) as any[];

  if (containsMatches.length > 0) {
    result.found = true;
    result.exact = false;
    result.matches = containsMatches.map((m: any) => ({
      ...m,
      matchType: 'contains' as const
    }));
    result.needsConfirmation = true;
    
    await logSearch(db, searchTerm, normalized, false, true, containsMatches.length);
    return result;
  }

  // 4. Full-text search als laatste redmiddel
  const [ftMatches] = await db.execute(`
    SELECT DISTINCT
      occupation_uri as uri,
      pref_label as prefLabel,
      label as matchedLabel,
      label_type as labelType,
      MATCH(label, pref_label) AGAINST(? IN NATURAL LANGUAGE MODE) as relevance
    FROM occupation_labels
    WHERE MATCH(label, pref_label) AGAINST(? IN NATURAL LANGUAGE MODE)
    ORDER BY relevance DESC
    LIMIT 10
  `, [searchTerm, searchTerm]) as any[];

  if (ftMatches.length > 0) {
    result.found = true;
    result.exact = false;
    result.matches = ftMatches.map((m: any) => ({
      ...m,
      matchType: 'fuzzy' as const,
      confidence: Math.min(m.relevance / 10, 1.0)
    }));
    result.needsConfirmation = true;
    result.suggestion = `Bedoelde je misschien "${ftMatches[0].prefLabel}"?`;
    
    await logSearch(db, searchTerm, normalized, false, true, ftMatches.length);
    return result;
  }

  // Niets gevonden
  await logSearch(db, searchTerm, normalized, false, false, 0);
  result.suggestion = `Geen beroep gevonden voor "${searchTerm}". Probeer een andere zoekterm.`;
  
  return result;
}

/**
 * Haal suggesties op voor autocomplete
 */
export async function getOccupationSuggestions(
  partial: string, 
  limit: number = 10
): Promise<{ label: string; prefLabel: string; uri: string }[]> {
  const db = await getPool();
  const normalized = normalize(partial);
  
  const [rows] = await db.execute(`
    SELECT DISTINCT
      label,
      pref_label as prefLabel,
      occupation_uri as uri
    FROM occupation_labels
    WHERE label_normalized LIKE ?
    ORDER BY 
      CASE WHEN label_normalized = ? THEN 0 ELSE 1 END,
      LENGTH(label)
    LIMIT ?
  `, [normalized + '%', normalized, limit]) as any[];
  
  return rows;
}

/**
 * Voeg een nieuw synoniem toe
 */
export async function addSynonym(
  synonym: string,
  occupationUri: string,
  prefLabel: string,
  confidence: number = 0.9,
  addedBy: string = 'user'
): Promise<void> {
  const db = await getPool();
  
  await db.execute(`
    INSERT INTO occupation_synonyms 
    (synonym, synonym_normalized, occupation_uri, pref_label, confidence, added_by)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE 
      confidence = GREATEST(confidence, VALUES(confidence)),
      added_by = VALUES(added_by)
  `, [synonym, normalize(synonym), occupationUri, prefLabel, confidence, addedBy]);
}

/**
 * Haal niet-gevonden zoektermen op (voor verbetering)
 */
export async function getMissingOccupations(limit: number = 20): Promise<any[]> {
  const db = await getPool();
  
  const [rows] = await db.execute(`
    SELECT 
      search_term,
      COUNT(*) as search_count,
      MAX(created_at) as last_searched
    FROM occupation_search_log
    WHERE found_exact = FALSE AND found_fuzzy = FALSE
    GROUP BY search_term
    ORDER BY search_count DESC
    LIMIT ?
  `, [limit]);
  
  return rows as any[];
}

/**
 * Bevestig een gebruikersselectie (voor learning)
 */
export async function confirmSelection(
  searchTerm: string,
  selectedUri: string,
  selectedLabel: string
): Promise<void> {
  const db = await getPool();
  
  // Update search log
  await db.execute(`
    UPDATE occupation_search_log
    SET selected_occupation_uri = ?,
        selected_pref_label = ?,
        user_confirmed = TRUE
    WHERE search_term_normalized = ?
    ORDER BY created_at DESC
    LIMIT 1
  `, [selectedUri, selectedLabel, normalize(searchTerm)]);
  
  // Update usage count
  await db.execute(`
    UPDATE occupation_labels
    SET usage_count = usage_count + 1,
        last_used = CURRENT_TIMESTAMP
    WHERE occupation_uri = ? AND label_normalized = ?
  `, [selectedUri, normalize(searchTerm)]);
  
  // Als dit een nieuwe mapping is, voeg toe als synoniem
  const [existing] = await db.execute(`
    SELECT 1 FROM occupation_labels 
    WHERE occupation_uri = ? AND label_normalized = ?
    LIMIT 1
  `, [selectedUri, normalize(searchTerm)]) as any[];
  
  if (existing.length === 0) {
    await addSynonym(searchTerm, selectedUri, selectedLabel, 0.8, 'user_confirmed');
  }
}

// Helper: Log een zoekopdracht
async function logSearch(
  db: mysql.Pool,
  searchTerm: string,
  normalized: string,
  foundExact: boolean,
  foundFuzzy: boolean,
  resultsCount: number
): Promise<void> {
  try {
    await db.execute(`
      INSERT INTO occupation_search_log 
      (search_term, search_term_normalized, found_exact, found_fuzzy, results_count)
      VALUES (?, ?, ?, ?, ?)
    `, [searchTerm, normalized, foundExact, foundFuzzy, resultsCount]);
  } catch (e) {
    // Ignore logging errors
  }
}

export default {
  resolveOccupation,
  getOccupationSuggestions,
  addSynonym,
  getMissingOccupations,
  confirmSelection
};
