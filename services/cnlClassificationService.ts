/**
 * CNL Classification Service
 * ==========================
 * Classificeert CV items (functies, opleidingen, skills) naar CompetentNL taxonomie.
 *
 * Multi-strategy classification waterval:
 * 1. Exact Match - directe database lookup (overgeslagen bij generieke titels)
 * 2. Fuzzy Match - Levenshtein + token overlap scoring, drempel 87% (overgeslagen bij generieke titels)
 * 3. Semantic Match - vector embeddings met verrijkte context (org + beschrijving + skills)
 * 4. LLM Reranker - Gemini selecteert beste match uit kandidaten met gestructureerde context
 * 5. Handmatige review - alternatieven voor gebruiker
 *
 * Verbeteringen t.o.v. origineel:
 * - Generieke titels ("ondernemer", "eigenaar") worden herkend en direct naar semantic+LLM gestuurd
 * - Context bevat nu organisatienaam, beschrijving EN vaardigheden (was alleen beschrijving)
 * - Fuzzy scoring combineert Levenshtein (40%) + token overlap (60%) om valse positieven te voorkomen
 * - LLM reranker wordt altijd aangeroepen bij onzekere matches (niet alleen als fallback)
 * - Drempels verhoogd naar 87% voor automatische acceptatie
 */

import mysql from 'mysql2/promise';
import type { ConceptType, ConceptMatch } from './conceptResolver.ts';
import { CONCEPT_CONFIGS, normalizeText } from './conceptResolver.ts';
import {
  generateEmbedding,
  cosineSimilarity,
  findMostSimilar
} from './embeddingService.ts';
import {
  getGeminiSingleton,
  isGeminiAvailable,
  generateContentWithRetry
} from './geminiSingleton.ts';

type Pool = mysql.Pool;
type RowDataPacket = mysql.RowDataPacket;

// ============================================================================
// TYPES
// ============================================================================

// Database row interfaces for proper typing
interface ConceptRow extends RowDataPacket {
  uri: string;
  pref_label: string;
  label: string;
  label_normalized: string;
}

interface ExactMatchRow extends RowDataPacket {
  uri: string;
  pref_label: string;
  label: string;
  label_type: string;
}

interface ScoredConceptRow extends ConceptRow {
  similarity: number;
}

export interface ClassificationResult {
  found: boolean;
  confidence: number;
  method: 'exact' | 'fuzzy' | 'semantic' | 'llm' | 'manual';
  match?: {
    uri: string;
    prefLabel: string;
    matchedLabel: string;
    conceptType: ConceptType;
  };
  alternatives?: AlternativeMatch[];
  needsReview: boolean;
}

export interface AlternativeMatch {
  uri: string;
  prefLabel: string;
  matchedLabel: string;
  confidence: number;
  matchType: 'exact' | 'fuzzy' | 'semantic';
}

export interface CVClassificationRequest {
  cvId: number;
  items: ClassificationItem[];
  options?: {
    useSemanticMatching?: boolean;
    useLLMFallback?: boolean;
    minConfidence?: number;
  };
}

export interface ClassificationItem {
  extractionId: number;
  sectionType: 'experience' | 'education' | 'skill';
  value: string;
  context?: string;
}

export interface CVClassificationResponse {
  cvId: number;
  classifications: {
    extractionId: number;
    sectionType: string;
    originalValue: string;
    result: ClassificationResult;
  }[];
  summary: {
    total: number;
    classified: number;
    needsReview: number;
    byMethod: Record<string, number>;
    averageConfidence: number;
  };
  processingTimeMs: number;
}

export interface Step6ClassifyResponse {
  stepNumber: 6;
  stepName: 'classify';
  classifications: {
    experience: ExperienceClassification[];
    education: EducationClassification[];
    skills: SkillClassification[];
  };
  summary: {
    total: number;
    classified: number;
    needsReview: number;
    byMethod: Record<string, number>;
    averageConfidence: number;
  };
  processingTimeMs: number;
}

export interface ExperienceClassification {
  extractionId: number;
  jobTitle: string;
  organization?: string;
  classification: ClassificationResult;
}

export interface EducationClassification {
  extractionId: number;
  degree: string;
  institution?: string;
  classification: ClassificationResult;
}

export interface SkillClassification {
  extractionId: number;
  skillName: string;
  classification: ClassificationResult;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CLASSIFICATION_CONFIG = {
  exactMatchMinConfidence: 0.95,
  fuzzyMatchMinConfidence: 0.87,     // Was 0.70 - verhoogd om valse positieven te voorkomen
  semanticMatchMinConfidence: 0.75,
  llmMatchMinConfidence: 0.80,
  directAcceptThreshold: 0.87,       // Fuzzy/semantic boven deze drempel → direct accepteren
  reviewThreshold: 0.87,             // Was 0.85 - gelijk aan accept drempel
  maxAlternatives: 5,
  llm: {
    model: 'gemini-2.0-flash',
    temperature: 0.1,
    maxCandidates: 10
  }
};

// ============================================================================
// GENERIC TITLE DETECTION (Voorstel 2)
// ============================================================================

/**
 * Generieke functietitels die zonder context niets zeggen over het beroep.
 * Bij deze titels slaan we exact en fuzzy matching over en gaan direct naar
 * semantic + LLM matching die de organisatienaam en beschrijving meenemen.
 */
const GENERIC_TITLES = new Set([
  // Nederlands
  'zelfstandig ondernemer', 'zelfstandige', 'zzper', 'zzp-er', 'zzp',
  'freelancer', 'freelance', 'free lance',
  'eigenaar', 'mede-eigenaar', 'ondernemer', 'startende ondernemer',
  'directeur', 'directeur-eigenaar', 'directeur/eigenaar', 'algemeen directeur',
  'manager', 'general manager', 'operationeel manager',
  'medewerker', 'medewerkster', 'algemeen medewerker',
  'stagiair', 'stagiaire', 'werkstudent', 'leerling',
  'vrijwilliger', 'vrijwilligster',
  'uitzendkracht', 'oproepkracht', 'invalkracht', 'tijdelijke kracht',
  'consultant', 'adviseur', 'specialist', 'expert',
  'assistent', 'assistente',
  'hoofd', 'teamleider', 'teamlead', 'leidinggevende', 'coordinator',
  'werknemer', 'bediende', 'vakman', 'vakvrouw',
  'oprichter', 'medeoprichter', 'founder', 'co-founder',
  // Engels
  'owner', 'self-employed', 'contractor', 'independent',
  'intern', 'trainee', 'volunteer',
  'employee', 'worker', 'staff member',
  'director', 'manager', 'head', 'lead', 'supervisor'
]);

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class CNLClassificationService {
  private db: Pool;
  private embeddingsCache: Map<string, { uri: string; label: string; embedding: number[] }[]> = new Map();
  private embeddingsCacheLoaded = false;
  private static instanceCount = 0;

  constructor(database: Pool, geminiApiKey?: string) {
    this.db = database;
    CNLClassificationService.instanceCount++;

    // Initialize Gemini singleton (only logs on first real initialization)
    const geminiSingleton = getGeminiSingleton();
    if (!geminiSingleton.isAvailable()) {
      geminiSingleton.initialize(geminiApiKey);
    }
  }

  // ==========================================================================
  // PUBLIC METHODS
  // ==========================================================================

  /**
   * Classificeer alle items van een CV (Stap 6 van wizard)
   */
  async classifyCV(cvId: number, options?: {
    useSemanticMatching?: boolean;
    useLLMFallback?: boolean;
  }): Promise<Step6ClassifyResponse> {
    const startTime = Date.now();

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Starting CNL Classification for CV ${cvId}`);
    console.log(`${'='.repeat(60)}\n`);

    // 1. Haal alle extracties op
    const extractions = await this.getUnclassifiedExtractions(cvId);
    console.log(`Found ${extractions.length} items to classify`);

    // 2. Preload embeddings cache als semantic matching is enabled
    if (options?.useSemanticMatching && !this.embeddingsCacheLoaded) {
      await this.loadEmbeddingsCache();
    }

    // 3. Classificeer elk item
    const experienceClassifications: ExperienceClassification[] = [];
    const educationClassifications: EducationClassification[] = [];
    const skillClassifications: SkillClassification[] = [];

    const byMethod: Record<string, number> = {};
    let totalConfidence = 0;
    let classified = 0;
    let needsReview = 0;

    for (const extraction of extractions) {
      const result = await this.classifyItem(extraction, options);

      // Track statistics
      byMethod[result.method] = (byMethod[result.method] || 0) + 1;
      totalConfidence += result.confidence;
      if (result.found) classified++;
      if (result.needsReview) needsReview++;

      // Store classification in database
      await this.storeClassification(extraction.id, result);

      // Group by section type
      if (extraction.section_type === 'experience') {
        experienceClassifications.push({
          extractionId: extraction.id,
          jobTitle: extraction.content.job_title || extraction.content.jobTitle,
          organization: extraction.content.organization,
          classification: result
        });
      } else if (extraction.section_type === 'education') {
        educationClassifications.push({
          extractionId: extraction.id,
          degree: extraction.content.degree,
          institution: extraction.content.institution,
          classification: result
        });
      } else if (extraction.section_type === 'skill') {
        skillClassifications.push({
          extractionId: extraction.id,
          skillName: extraction.content.skill_name || extraction.content.skillName,
          classification: result
        });
      }
    }

    const processingTimeMs = Date.now() - startTime;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Classification Complete`);
    console.log(`  Total: ${extractions.length}, Classified: ${classified}, Needs Review: ${needsReview}`);
    console.log(`  Time: ${processingTimeMs}ms`);
    console.log(`${'='.repeat(60)}\n`);

    return {
      stepNumber: 6,
      stepName: 'classify',
      classifications: {
        experience: experienceClassifications,
        education: educationClassifications,
        skills: skillClassifications
      },
      summary: {
        total: extractions.length,
        classified,
        needsReview,
        byMethod,
        averageConfidence: extractions.length > 0 ? totalConfidence / extractions.length : 0
      },
      processingTimeMs
    };
  }

  /**
   * Classificeer een enkel item
   *
   * Nieuwe waterval (alle 5 voorstellen gecombineerd):
   * 1. Exact match (overslaan bij generieke titels)
   * 2. Fuzzy match met combined scoring (overslaan bij generieke titels)
   *    → Direct accepteren als ≥ 87%
   * 3. Semantic match met verrijkte context (altijd proberen)
   *    → Direct accepteren als ≥ 87%
   * 4. LLM reranker met gestructureerde context + alle kandidaten
   *    → Accepteren als ≥ 80%
   * 5. Handmatige review met alternatieven
   */
  async classifyItem(
    extraction: {
      id?: number;
      section_type: string;
      content: any;
    },
    options?: {
      useSemanticMatching?: boolean;
      useLLMFallback?: boolean;
    }
  ): Promise<ClassificationResult> {
    // Preload embeddings cache if semantic matching is enabled
    if (options?.useSemanticMatching && !this.embeddingsCacheLoaded) {
      await this.loadEmbeddingsCache();
    }

    const conceptType = this.mapSectionToConceptType(extraction.section_type);
    const value = this.extractValueForClassification(extraction);

    // Skip classification for empty/whitespace-only values
    if (!value || value.trim().length === 0) {
      console.log(`    ⚠ Empty value for ${extraction.section_type}, skipping classification`);
      return {
        found: false,
        confidence: 0,
        method: 'manual',
        alternatives: [],
        needsReview: true
      };
    }

    const context = this.extractContextForClassification(extraction);
    const structuredContext = this.extractStructuredContext(extraction);
    const isGeneric = extraction.section_type === 'experience'
      && this.isGenericTitle(value);

    console.log(`  Classifying: "${value}" (${conceptType})${isGeneric ? ' [GENERIC]' : ''}`);
    if (context) console.log(`    Context: "${context.substring(0, 100)}"`);

    // Verzamel kandidaten van alle strategieën voor eventuele LLM reranking
    let allAlternatives: AlternativeMatch[] = [];

    // ── Stap 1: Exact match (overslaan bij generieke titels) ──────────────
    let exactResult: ClassificationResult | null = null;
    if (!isGeneric) {
      exactResult = await this.tryExactMatch(value, conceptType);
      if (exactResult.found && exactResult.confidence >= CLASSIFICATION_CONFIG.exactMatchMinConfidence) {
        console.log(`    ✓ Exact: ${exactResult.match?.prefLabel} (${(exactResult.confidence * 100).toFixed(0)}%)`);
        return exactResult;
      }
      allAlternatives.push(...(exactResult.alternatives || []));
    }

    // ── Stap 2: Fuzzy match met token-overlap (overslaan bij generiek) ───
    let fuzzyResult: ClassificationResult | null = null;
    if (!isGeneric) {
      fuzzyResult = await this.tryFuzzyMatch(value, conceptType);
      if (fuzzyResult.found && fuzzyResult.confidence >= CLASSIFICATION_CONFIG.fuzzyMatchMinConfidence) {
        console.log(`    ✓ Fuzzy: ${fuzzyResult.match?.prefLabel} (${(fuzzyResult.confidence * 100).toFixed(0)}%)`);
        return fuzzyResult;  // ≥87% met combined scoring → betrouwbaar
      }
      // Voeg fuzzy beste match toe als kandidaat voor LLM reranker
      if (fuzzyResult.found) {
        allAlternatives.push({
          uri: fuzzyResult.match!.uri,
          prefLabel: fuzzyResult.match!.prefLabel,
          matchedLabel: fuzzyResult.match!.matchedLabel,
          confidence: fuzzyResult.confidence,
          matchType: 'fuzzy'
        });
      }
      allAlternatives.push(...(fuzzyResult.alternatives || []));
    }

    // ── Stap 3: Semantic match (altijd proberen als enabled) ─────────────
    let semanticResult: ClassificationResult | null = null;
    if (options?.useSemanticMatching) {
      semanticResult = await this.trySemanticMatch(value, context, conceptType);
      if (semanticResult.found && semanticResult.confidence >= CLASSIFICATION_CONFIG.directAcceptThreshold) {
        console.log(`    ✓ Semantic: ${semanticResult.match?.prefLabel} (${(semanticResult.confidence * 100).toFixed(0)}%)`);
        return semanticResult;  // ≥87% semantic → betrouwbaar
      }
      // Voeg semantic beste match toe als kandidaat voor LLM reranker
      if (semanticResult.found) {
        allAlternatives.push({
          uri: semanticResult.match!.uri,
          prefLabel: semanticResult.match!.prefLabel,
          matchedLabel: semanticResult.match!.matchedLabel,
          confidence: semanticResult.confidence,
          matchType: 'semantic'
        });
      }
      allAlternatives.push(...(semanticResult.alternatives || []));
    }

    // ── Stap 4: LLM reranker met volledige gestructureerde context ──────
    const uniqueAlternatives = this.deduplicateAlternatives(allAlternatives)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, CLASSIFICATION_CONFIG.llm.maxCandidates);

    if (options?.useLLMFallback && isGeminiAvailable() && uniqueAlternatives.length > 0) {
      const llmResult = await this.tryLLMMatch(
        value, context, conceptType, uniqueAlternatives, structuredContext
      );
      if (llmResult.found && llmResult.confidence >= CLASSIFICATION_CONFIG.llmMatchMinConfidence) {
        console.log(`    ✓ LLM rerank: ${llmResult.match?.prefLabel} (${(llmResult.confidence * 100).toFixed(0)}%)`);
        return llmResult;
      }
    }

    // ── Stap 5: Handmatige review ───────────────────────────────────────
    const topAlternatives = uniqueAlternatives.slice(0, CLASSIFICATION_CONFIG.maxAlternatives);

    console.log(`    ⚠ Geen match, ${topAlternatives.length} alternatieven`);

    return {
      found: false,
      confidence: topAlternatives.length > 0 ? topAlternatives[0].confidence : 0,
      method: 'manual',
      alternatives: topAlternatives,
      needsReview: true
    };
  }

  /**
   * Update classificatie na gebruikerselectie
   */
  async updateClassification(
    extractionId: number,
    selectedUri: string,
    selectedLabel: string,
    method: 'manual' = 'manual'
  ): Promise<void> {
    await this.db.execute(`
      UPDATE cv_extractions SET
        matched_cnl_uri = ?,
        matched_cnl_label = ?,
        classification_method = ?,
        confidence_score = 1.0,
        classification_confirmed = TRUE,
        classified_at = NOW(),
        needs_review = FALSE,
        updated_at = NOW()
      WHERE id = ?
    `, [selectedUri, selectedLabel, method, extractionId]);
  }

  /**
   * Zoek CNL concepten voor handmatige selectie
   */
  async searchConcepts(
    searchTerm: string,
    conceptType: ConceptType,
    limit: number = 10
  ): Promise<AlternativeMatch[]> {
    const config = CONCEPT_CONFIGS[conceptType];
    const normalized = normalizeText(searchTerm);

    const [rows] = await this.db.execute<RowDataPacket[]>(`
      SELECT DISTINCT
        ${config.uriColumn} as uri,
        pref_label,
        label,
        label_normalized
      FROM ${config.table}
      WHERE label_normalized LIKE ?
         OR label_normalized LIKE ?
         OR pref_label LIKE ?
      ORDER BY
        CASE
          WHEN label_normalized = ? THEN 1
          WHEN label_normalized LIKE ? THEN 2
          ELSE 3
        END,
        LENGTH(label)
      LIMIT ?
    `, [
      `${normalized}%`,
      `%${normalized}%`,
      `%${searchTerm}%`,
      normalized,
      `${normalized}%`,
      limit
    ]);

    return rows.map(row => ({
      uri: row.uri,
      prefLabel: row.pref_label,
      matchedLabel: row.label,
      confidence: this.calculateSimilarity(normalized, row.label_normalized),
      matchType: 'fuzzy' as const
    }));
  }

  // ==========================================================================
  // CLASSIFICATION STRATEGIES
  // ==========================================================================

  /**
   * Strategy 1: Exact match in lokale database
   */
  private async tryExactMatch(
    value: string,
    conceptType: ConceptType
  ): Promise<ClassificationResult> {
    const config = CONCEPT_CONFIGS[conceptType];
    const normalized = normalizeText(value);

    // Exact match op normalized label
    const [rows] = await this.db.execute<ExactMatchRow[]>(`
      SELECT
        ${config.uriColumn} as uri,
        pref_label,
        label,
        label_type
      FROM ${config.table}
      WHERE label_normalized = ?
      ORDER BY
        CASE label_type
          WHEN 'prefLabel' THEN 1
          WHEN 'altLabel' THEN 2
          ELSE 3
        END
      LIMIT 5
    `, [normalized]);

    if (rows.length > 0) {
      const bestMatch = rows[0];
      const isPrefLabel = bestMatch.label_type === 'prefLabel';

      return {
        found: true,
        confidence: isPrefLabel ? 1.0 : 0.95,
        method: 'exact',
        match: {
          uri: bestMatch.uri,
          prefLabel: bestMatch.pref_label,
          matchedLabel: bestMatch.label,
          conceptType
        },
        alternatives: rows.slice(1).map(r => ({
          uri: r.uri,
          prefLabel: r.pref_label,
          matchedLabel: r.label,
          confidence: r.label_type === 'prefLabel' ? 0.95 : 0.90,
          matchType: 'exact' as const
        })),
        needsReview: false
      };
    }

    // Try partial matches for alternatives
    const [partialRows] = await this.db.execute<ConceptRow[]>(`
      SELECT DISTINCT
        ${config.uriColumn} as uri,
        pref_label,
        label,
        label_normalized
      FROM ${config.table}
      WHERE label_normalized LIKE ?
         OR label_normalized LIKE ?
      ORDER BY LENGTH(label)
      LIMIT 5
    `, [`${normalized}%`, `%${normalized}%`]);

    return {
      found: false,
      confidence: 0,
      method: 'exact',
      alternatives: partialRows.map(r => ({
        uri: r.uri,
        prefLabel: r.pref_label,
        matchedLabel: r.label,
        confidence: this.calculateSimilarity(normalized, r.label_normalized),
        matchType: 'exact' as const
      })),
      needsReview: true
    };
  }

  /**
   * Strategy 2: Fuzzy match met Levenshtein + token overlap (combined scoring)
   */
  private async tryFuzzyMatch(
    value: string,
    conceptType: ConceptType
  ): Promise<ClassificationResult> {
    const config = CONCEPT_CONFIGS[conceptType];
    const normalized = normalizeText(value);

    // Get candidates with LIKE
    const [rows] = await this.db.execute<ConceptRow[]>(`
      SELECT DISTINCT
        ${config.uriColumn} as uri,
        pref_label,
        label,
        label_normalized
      FROM ${config.table}
      WHERE label_normalized LIKE ?
         OR label_normalized LIKE ?
         OR SOUNDEX(label_normalized) = SOUNDEX(?)
      ORDER BY LENGTH(label)
      LIMIT 20
    `, [`%${normalized}%`, `${normalized.substring(0, 4)}%`, normalized]);

    if (rows.length === 0) {
      return { found: false, confidence: 0, method: 'fuzzy', needsReview: true };
    }

    // Calculate combined similarity scores (Levenshtein + token overlap)
    const scored: ScoredConceptRow[] = rows.map(row => ({
      ...row,
      similarity: this.calculateCombinedSimilarity(normalized, row.label_normalized)
    })).sort((a, b) => b.similarity - a.similarity);

    const bestMatch = scored[0];

    if (bestMatch.similarity >= CLASSIFICATION_CONFIG.fuzzyMatchMinConfidence) {
      return {
        found: true,
        confidence: bestMatch.similarity,
        method: 'fuzzy',
        match: {
          uri: bestMatch.uri,
          prefLabel: bestMatch.pref_label,
          matchedLabel: bestMatch.label,
          conceptType
        },
        alternatives: scored.slice(1, 6).map(s => ({
          uri: s.uri,
          prefLabel: s.pref_label,
          matchedLabel: s.label,
          confidence: s.similarity,
          matchType: 'fuzzy' as const
        })),
        needsReview: bestMatch.similarity < CLASSIFICATION_CONFIG.reviewThreshold
      };
    }

    return {
      found: false,
      confidence: bestMatch.similarity,
      method: 'fuzzy',
      alternatives: scored.slice(0, 5).map(s => ({
        uri: s.uri,
        prefLabel: s.pref_label,
        matchedLabel: s.label,
        confidence: s.similarity,
        matchType: 'fuzzy' as const
      })),
      needsReview: true
    };
  }

  /**
   * Strategy 3: Semantic match met embeddings
   */
  private async trySemanticMatch(
    value: string,
    context: string | undefined,
    conceptType: ConceptType
  ): Promise<ClassificationResult> {
    try {
      // Generate embedding for search text
      const searchText = context ? `${value} - ${context}` : value;
      const queryEmbedding = await generateEmbedding(searchText);

      // Get cached embeddings for concept type
      const conceptEmbeddings = this.embeddingsCache.get(conceptType) || [];

      if (conceptEmbeddings.length === 0) {
        console.log(`    No embeddings cached for ${conceptType}`);
        return { found: false, confidence: 0, method: 'semantic', needsReview: true };
      }

      // Find most similar
      const candidates = conceptEmbeddings.map(c => ({
        id: 0,
        uri: c.uri,
        prefLabel: c.label,
        embedding: c.embedding
      }));

      const matches = findMostSimilar(queryEmbedding, candidates, 5, 0.5);

      if (matches.length > 0 && matches[0].similarity >= CLASSIFICATION_CONFIG.semanticMatchMinConfidence) {
        return {
          found: true,
          confidence: matches[0].similarity,
          method: 'semantic',
          match: {
            uri: matches[0].uri,
            prefLabel: matches[0].prefLabel,
            matchedLabel: matches[0].prefLabel,
            conceptType
          },
          alternatives: matches.slice(1).map(m => ({
            uri: m.uri,
            prefLabel: m.prefLabel,
            matchedLabel: m.prefLabel,
            confidence: m.similarity,
            matchType: 'semantic' as const
          })),
          needsReview: matches[0].similarity < CLASSIFICATION_CONFIG.reviewThreshold
        };
      }

      return {
        found: false,
        confidence: matches.length > 0 ? matches[0].similarity : 0,
        method: 'semantic',
        alternatives: matches.map(m => ({
          uri: m.uri,
          prefLabel: m.prefLabel,
          matchedLabel: m.prefLabel,
          confidence: m.similarity,
          matchType: 'semantic' as const
        })),
        needsReview: true
      };

    } catch (error) {
      console.warn('Semantic match failed:', error);
      return { found: false, confidence: 0, method: 'semantic', needsReview: true };
    }
  }

  /**
   * Strategy 4: LLM Reranker - Selecteert beste match met volledige context
   *
   * Gebruikt Gemini AI om het beste CNL concept te selecteren uit de kandidaten.
   * Krijgt nu gestructureerde context (organisatie, beschrijving, vaardigheden)
   * zodat generieke titels correct geclassificeerd kunnen worden.
   */
  private async tryLLMMatch(
    value: string,
    context: string | undefined,
    conceptType: ConceptType,
    candidates: AlternativeMatch[],
    structuredContext?: { organization?: string; description?: string; skills?: string[] }
  ): Promise<ClassificationResult> {
    if (!isGeminiAvailable() || candidates.length === 0) {
      return { found: false, confidence: 0, method: 'llm', needsReview: true };
    }

    try {
      console.log(`    [LLM] Attempting LLM rerank for: "${value}" with ${candidates.length} candidates`);

      // Build the prompt
      const conceptTypeLabels: Record<ConceptType, string> = {
        occupation: 'beroep/functie',
        education: 'opleiding',
        capability: 'vaardigheid/competentie',
        knowledge: 'kennisgebied',
        task: 'taak',
        workingCondition: 'werkomstandigheid'
      };

      const candidateList = candidates
        .map((c, i) => `${i + 1}. "${c.prefLabel}" (URI: ${c.uri})`)
        .join('\n');

      // Bouw gestructureerde context blokken op
      const contextLines: string[] = [];
      if (structuredContext?.organization) {
        contextLines.push(`ORGANISATIE: "${structuredContext.organization}"`);
      }
      if (structuredContext?.description) {
        contextLines.push(`BESCHRIJVING: "${structuredContext.description}"`);
      }
      if (structuredContext?.skills?.length) {
        contextLines.push(`VAARDIGHEDEN: "${structuredContext.skills.join(', ')}"`);
      }
      // Fallback naar platte context string als er geen structured context is
      if (contextLines.length === 0 && context) {
        contextLines.push(`CONTEXT: "${context}"`);
      }

      const prompt = `Je bent een expert in het matchen van CV-inhoud naar de CompetentNL taxonomie (beroepen, opleidingen, vaardigheden).

TAAK: Selecteer het beste ${conceptTypeLabels[conceptType]} concept uit de kandidatenlijst voor de gegeven CV-gegevens.

FUNCTIETITEL: "${value}"
${contextLines.join('\n')}

KANDIDATEN:
${candidateList}

INSTRUCTIES:
1. Gebruik ALLE beschikbare informatie (titel, organisatie, beschrijving, vaardigheden)
2. Bij generieke titels zoals "ondernemer", "medewerker" of "eigenaar", bepaal het werkelijke beroep op basis van de organisatie en beschrijving
3. Selecteer het concept dat het beste past bij het WERKELIJKE beroep, niet bij de letterlijke titel
4. Als geen enkel concept goed past, antwoord met "GEEN_MATCH"

ANTWOORD FORMAT (ALLEEN dit, geen uitleg):
SELECTIE: [nummer van je keuze, bijv. 1, 2, 3, etc. OF "GEEN_MATCH"]
CONFIDENCE: [0.0 tot 1.0, waar 1.0 = perfecte match]
REDEN: [korte reden in max 10 woorden]`;

      // Use singleton with automatic retry on 429 errors
      const { text: response, retryCount } = await generateContentWithRetry({
        model: CLASSIFICATION_CONFIG.llm.model,
        contents: prompt,
        config: {
          temperature: CLASSIFICATION_CONFIG.llm.temperature,
          maxOutputTokens: 500
        }
      });

      if (retryCount > 0) {
        console.log(`    [LLM] Request succeeded after ${retryCount} retries`);
      }

      console.log(`    [LLM] Raw response: ${response}`);

      // Parse the response
      const selectionMatch = response.match(/SELECTIE:\s*(\d+|GEEN_MATCH)/i);
      const confidenceMatch = response.match(/CONFIDENCE:\s*([\d.]+)/i);
      const reasonMatch = response.match(/REDEN:\s*(.+?)(?:\n|$)/i);

      if (!selectionMatch || selectionMatch[1].toUpperCase() === 'GEEN_MATCH') {
        console.log(`    [LLM] No confident match from LLM`);
        return {
          found: false,
          confidence: 0,
          method: 'llm',
          alternatives: candidates.slice(0, CLASSIFICATION_CONFIG.maxAlternatives),
          needsReview: true
        };
      }

      const selectedIndex = parseInt(selectionMatch[1], 10) - 1;
      const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.85;
      const reason = reasonMatch ? reasonMatch[1].trim() : undefined;

      if (selectedIndex < 0 || selectedIndex >= candidates.length) {
        console.log(`    [LLM] Invalid selection index: ${selectedIndex + 1}`);
        return {
          found: false,
          confidence: 0,
          method: 'llm',
          alternatives: candidates.slice(0, CLASSIFICATION_CONFIG.maxAlternatives),
          needsReview: true
        };
      }

      const selectedCandidate = candidates[selectedIndex];

      console.log(`    [LLM] Selected: "${selectedCandidate.prefLabel}" (confidence: ${confidence})`);
      if (reason) {
        console.log(`    [LLM] Reason: ${reason}`);
      }

      // Remaining candidates become alternatives
      const remainingAlternatives = candidates
        .filter((_, i) => i !== selectedIndex)
        .slice(0, CLASSIFICATION_CONFIG.maxAlternatives - 1);

      return {
        found: true,
        confidence,
        method: 'llm',
        match: {
          uri: selectedCandidate.uri,
          prefLabel: selectedCandidate.prefLabel,
          matchedLabel: selectedCandidate.matchedLabel,
          conceptType
        },
        alternatives: remainingAlternatives,
        needsReview: confidence < CLASSIFICATION_CONFIG.reviewThreshold
      };

    } catch (error) {
      console.warn('    [LLM] LLM match failed:', error);
      return {
        found: false,
        confidence: 0,
        method: 'llm',
        alternatives: candidates.slice(0, CLASSIFICATION_CONFIG.maxAlternatives),
        needsReview: true
      };
    }
  }

  /**
   * Deduplicate alternatives by URI
   */
  private deduplicateAlternatives(alternatives: AlternativeMatch[]): AlternativeMatch[] {
    const seen = new Set<string>();
    return alternatives.filter(alt => {
      if (seen.has(alt.uri)) {
        return false;
      }
      seen.add(alt.uri);
      return true;
    });
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Map CV section type naar CNL concept type
   */
  private mapSectionToConceptType(sectionType: string): ConceptType {
    switch (sectionType) {
      case 'experience': return 'occupation';
      case 'education': return 'education';
      case 'skill': return 'capability';
      default: return 'occupation';
    }
  }

  /**
   * Extract de waarde om te classificeren uit een extractie
   */
  private extractValueForClassification(extraction: { section_type: string; content: any }): string {
    switch (extraction.section_type) {
      case 'experience':
        return extraction.content.job_title || extraction.content.jobTitle || '';
      case 'education':
        return extraction.content.degree || '';
      case 'skill':
        return extraction.content.skill_name || extraction.content.skillName || '';
      default:
        return '';
    }
  }

  /**
   * Check of een titel generiek is (zonder context nietszeggend)
   */
  private isGenericTitle(value: string): boolean {
    return GENERIC_TITLES.has(normalizeText(value));
  }

  /**
   * Extract gestructureerde context voor LLM prompt
   */
  private extractStructuredContext(extraction: {
    section_type: string;
    content: any;
  }): { organization?: string; description?: string; skills?: string[] } {
    if (extraction.section_type === 'experience') {
      return {
        organization: extraction.content.organization,
        description: extraction.content.description,
        skills: extraction.content.extracted_skills || extraction.content.skills
      };
    }
    if (extraction.section_type === 'education') {
      return {
        organization: extraction.content.institution,
        description: extraction.content.field_of_study || extraction.content.fieldOfStudy
      };
    }
    return {};
  }

  /**
   * Extract context als samengestelde string (voor semantic matching)
   * Bevat nu organisatie + beschrijving + vaardigheden (was alleen beschrijving)
   */
  private extractContextForClassification(extraction: { section_type: string; content: any }): string | undefined {
    const ctx = this.extractStructuredContext(extraction);
    const parts: string[] = [];
    if (ctx.organization) parts.push(ctx.organization);
    if (ctx.description) parts.push(ctx.description);
    if (ctx.skills?.length) parts.push(ctx.skills.join(', '));
    return parts.length > 0 ? parts.join(' - ') : undefined;
  }

  /**
   * Haal ongeclassificeerde extracties op
   */
  private async getUnclassifiedExtractions(cvId: number): Promise<{
    id: number;
    section_type: string;
    content: any;
  }[]> {
    const [rows] = await this.db.execute<RowDataPacket[]>(`
      SELECT id, section_type, content
      FROM cv_extractions
      WHERE cv_id = ?
        AND (matched_cnl_uri IS NULL OR classification_confirmed = FALSE)
      ORDER BY section_type, id
    `, [cvId]);

    return rows.map(row => ({
      id: row.id,
      section_type: row.section_type,
      content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content
    }));
  }

  /**
   * Sla classificatie op in database
   */
  private async storeClassification(
    extractionId: number,
    result: ClassificationResult
  ): Promise<void> {
    await this.db.execute(`
      UPDATE cv_extractions SET
        matched_cnl_uri = ?,
        matched_cnl_label = ?,
        confidence_score = ?,
        classification_method = ?,
        alternative_matches = ?,
        needs_review = ?,
        classified_at = NOW(),
        updated_at = NOW()
      WHERE id = ?
    `, [
      result.match?.uri || null,
      result.match?.prefLabel || null,
      result.confidence,
      result.method,
      JSON.stringify(result.alternatives || []),
      result.needsReview,
      extractionId
    ]);
  }

  /**
   * Token-overlap scoring (Voorstel 4)
   * Voorkomt valse positieven waar strings karakter-overlap hebben maar
   * geen betekenisvolle woordovereenkomst (bijv. "ondernemer" → "Hovenier").
   * Gebruikt substring matching zodat "software" matcht in "softwareontwikkelaar".
   */
  private calculateTokenOverlap(a: string, b: string): number {
    const tokenize = (text: string) =>
      text.toLowerCase().split(/[\s\-\/]+/).filter(t => t.length > 2);

    const tokensA = tokenize(a);
    const tokensB = tokenize(b);

    if (tokensA.length === 0 && tokensB.length === 0) return 1.0;
    if (tokensA.length === 0 || tokensB.length === 0) return 0;

    // Check of tokens uit A voorkomen in B (als substring of omgekeerd)
    let matchesA = 0;
    for (const tA of tokensA) {
      if (tokensB.some(tB => tA.includes(tB) || tB.includes(tA))) matchesA++;
    }

    let matchesB = 0;
    for (const tB of tokensB) {
      if (tokensA.some(tA => tB.includes(tA) || tA.includes(tB))) matchesB++;
    }

    // Symmetrische score
    const scoreA = tokensA.length > 0 ? matchesA / tokensA.length : 0;
    const scoreB = tokensB.length > 0 ? matchesB / tokensB.length : 0;

    return (scoreA + scoreB) / 2;
  }

  /**
   * Combined similarity: 40% Levenshtein + 60% token overlap
   * Dit filtert valse positieven uit waar Levenshtein hoog scoort maar
   * er geen enkele woordovereenkomst is.
   *
   * Extra regel: als token overlap 0 is (geen enkel woord komt overeen),
   * cap de score op 0.50 zodat het nooit de fuzzy drempel (87%) haalt.
   */
  private calculateCombinedSimilarity(a: string, b: string): number {
    const levenshtein = this.calculateSimilarity(a, b);
    const tokenOverlap = this.calculateTokenOverlap(a, b);
    const combined = 0.4 * levenshtein + 0.6 * tokenOverlap;

    // Als er geen enkele woordovereenkomst is, beperk de score
    if (tokenOverlap === 0) {
      return Math.min(combined, 0.50);
    }

    return combined;
  }

  /**
   * Bereken string similarity (Levenshtein-based)
   */
  private calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1.0;
    if (a.length === 0 || b.length === 0) return 0;

    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    const maxLen = Math.max(a.length, b.length);
    return 1 - matrix[b.length][a.length] / maxLen;
  }

  /**
   * Load embeddings cache from database
   */
  private async loadEmbeddingsCache(): Promise<void> {
    console.log('Loading CNL concept embeddings cache...');

    const conceptTypes: ConceptType[] = ['occupation', 'education', 'capability', 'knowledge'];

    for (const conceptType of conceptTypes) {
      try {
        const [rows] = await this.db.execute<RowDataPacket[]>(`
          SELECT concept_uri, pref_label, embedding
          FROM cnl_concept_embeddings
          WHERE concept_type = ?
        `, [conceptType]);

        const embeddings = rows.map(row => {
          // Convert MySQL Buffer to Float32Array correctly
          // row.embedding is a Buffer, we need to create a proper ArrayBuffer from it
          const buffer = row.embedding;
          const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
          const floatArray = new Float32Array(arrayBuffer);
          return {
            uri: row.concept_uri,
            label: row.pref_label,
            embedding: Array.from(floatArray)
          };
        });

        this.embeddingsCache.set(conceptType, embeddings);
        console.log(`  Loaded ${embeddings.length} embeddings for ${conceptType}`);
      } catch (error) {
        console.warn(`  Failed to load embeddings for ${conceptType}:`, error);
        this.embeddingsCache.set(conceptType, []);
      }
    }

    this.embeddingsCacheLoaded = true;
  }

  /**
   * Generate and store embeddings for all concepts (batch job)
   */
  async generateConceptEmbeddings(conceptType: ConceptType, batchSize: number = 100): Promise<number> {
    const config = CONCEPT_CONFIGS[conceptType];
    let processed = 0;

    // Get all unique concepts
    const [rows] = await this.db.execute<RowDataPacket[]>(`
      SELECT DISTINCT ${config.uriColumn} as uri, pref_label
      FROM ${config.table}
      WHERE label_type = 'prefLabel'
    `);

    console.log(`Generating embeddings for ${rows.length} ${conceptType} concepts...`);

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);

      for (const row of batch) {
        try {
          // Check if embedding exists
          const [existing] = await this.db.execute<RowDataPacket[]>(
            `SELECT id FROM cnl_concept_embeddings WHERE concept_uri = ?`,
            [row.uri]
          );

          if (existing.length > 0) continue;

          // Generate embedding
          const embedding = await generateEmbedding(row.pref_label);
          const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);

          // Store embedding
          await this.db.execute(`
            INSERT INTO cnl_concept_embeddings (concept_uri, concept_type, pref_label, embedding)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE embedding = VALUES(embedding), updated_at = NOW()
          `, [row.uri, conceptType, row.pref_label, embeddingBuffer]);

          processed++;
        } catch (error) {
          console.warn(`Failed to generate embedding for ${row.pref_label}:`, error);
        }
      }

      console.log(`  Processed ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
    }

    return processed;
  }
}

export default CNLClassificationService;
