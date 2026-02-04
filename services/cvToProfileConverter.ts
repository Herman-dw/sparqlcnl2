/**
 * CV to Profile Converter Service
 * ================================
 * Converteert geclassificeerde CV extracties naar een MatchProfile
 * dat kan worden gebruikt door de profile matching API.
 */

import mysql from 'mysql2/promise';

type Pool = mysql.Pool;
type RowDataPacket = mysql.RowDataPacket;

// ============================================================================
// TYPES
// ============================================================================

export interface ProfileItem {
  uri: string;
  label: string;
  type: 'skill' | 'knowledge' | 'task' | 'workCondition';
  source?: string;
}

export interface OccupationHistory {
  occupationUri: string;
  occupationLabel: string;
  years?: number;
  startYear?: string;
  endYear?: string;
}

export interface EducationHistory {
  educationUri: string;
  educationLabel: string;
  level?: string;
  yearCompleted?: string;
}

export interface CVMatchProfile {
  cvId: number;
  occupationHistory: OccupationHistory[];
  education: EducationHistory[];
  capabilities: ProfileItem[];
  knowledge: ProfileItem[];
  tasks: ProfileItem[];
  workConditions: ProfileItem[];
  meta: {
    totalItems: number;
    classifiedItems: number;
    classificationRate: number;
    generatedAt: Date;
  };
}

export interface MatchRequest {
  skills: string[];    // URIs van capabilities
  knowledge: string[]; // URIs van knowledge areas
  tasks: string[];     // URIs van tasks
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class CVToProfileConverter {
  private db: Pool;
  private backendUrl: string;

  constructor(database: Pool, backendUrl: string = 'http://localhost:3001') {
    this.db = database;
    this.backendUrl = backendUrl;
  }

  /**
   * Convert CV extractions naar een MatchProfile
   */
  async convertCVToProfile(cvId: number): Promise<CVMatchProfile> {
    console.log(`Converting CV ${cvId} to MatchProfile...`);

    // 1. Haal alle geclassificeerde extracties op
    const [rows] = await this.db.execute<RowDataPacket[]>(`
      SELECT
        id,
        section_type,
        content,
        matched_cnl_uri,
        matched_cnl_label,
        confidence_score,
        classification_method
      FROM cv_extractions
      WHERE cv_id = ?
        AND matched_cnl_uri IS NOT NULL
      ORDER BY section_type, id
    `, [cvId]);

    const occupationHistory: OccupationHistory[] = [];
    const education: EducationHistory[] = [];
    const capabilities: ProfileItem[] = [];
    const knowledge: ProfileItem[] = [];
    const tasks: ProfileItem[] = [];
    const workConditions: ProfileItem[] = [];

    // 2. Process elke extractie
    for (const row of rows) {
      const content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;

      switch (row.section_type) {
        case 'experience':
          // Voeg beroep toe aan history
          occupationHistory.push({
            occupationUri: row.matched_cnl_uri,
            occupationLabel: row.matched_cnl_label,
            years: content.duration_years || this.calculateYears(content.start_date, content.end_date),
            startYear: content.start_date,
            endYear: content.end_date
          });

          // Haal bijbehorende skills op voor dit beroep
          const occProfile = await this.fetchOccupationProfile(row.matched_cnl_uri);
          this.mergeItems(capabilities, occProfile.capabilities);
          this.mergeItems(knowledge, occProfile.knowledge);
          this.mergeItems(tasks, occProfile.tasks);
          this.mergeItems(workConditions, occProfile.workConditions);
          break;

        case 'education':
          // Voeg opleiding toe
          education.push({
            educationUri: row.matched_cnl_uri,
            educationLabel: row.matched_cnl_label,
            level: this.inferEducationLevel(content.degree),
            yearCompleted: content.end_year || content.year
          });

          // Haal bijbehorende competenties op
          const eduProfile = await this.fetchEducationProfile(row.matched_cnl_uri);
          this.mergeItems(capabilities, eduProfile.capabilities);
          this.mergeItems(knowledge, eduProfile.knowledge);
          break;

        case 'skill':
          // Voeg skill direct toe
          capabilities.push({
            uri: row.matched_cnl_uri,
            label: row.matched_cnl_label,
            type: 'skill',
            source: 'cv_direct'
          });
          break;
      }
    }

    // 3. Tel totalen
    const [totalRows] = await this.db.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM cv_extractions WHERE cv_id = ?`,
      [cvId]
    );
    const totalItems = totalRows[0].total;

    return {
      cvId,
      occupationHistory,
      education,
      capabilities,
      knowledge,
      tasks,
      workConditions,
      meta: {
        totalItems,
        classifiedItems: rows.length,
        classificationRate: totalItems > 0 ? rows.length / totalItems : 0,
        generatedAt: new Date()
      }
    };
  }

  /**
   * Convert profile naar MatchRequest voor de matching API
   */
  profileToMatchRequest(profile: CVMatchProfile): MatchRequest {
    return {
      skills: profile.capabilities.map(c => c.uri),
      knowledge: profile.knowledge.map(k => k.uri),
      tasks: profile.tasks.map(t => t.uri)
    };
  }

  /**
   * Match profiel tegen beroepen
   */
  async matchProfileToOccupations(cvId: number, options?: {
    limit?: number;
    minScore?: number;
    includeGaps?: boolean;
  }): Promise<any> {
    // 1. Convert CV to profile
    const profile = await this.convertCVToProfile(cvId);

    // 2. Create match request
    const matchRequest = this.profileToMatchRequest(profile);

    // 3. Check if we have anything to match
    const hasMatchableItems =
      matchRequest.skills.length > 0 ||
      matchRequest.knowledge.length > 0 ||
      matchRequest.tasks.length > 0;

    if (!hasMatchableItems) {
      console.log(`[CV Match] No classified items found for CV ${cvId} - returning empty results`);
      return {
        cvId,
        profile,
        matchResults: {
          success: true,
          matches: [],
          message: 'Geen geclassificeerde items gevonden om te matchen'
        },
        timestamp: new Date()
      };
    }

    // 4. Call matching API
    const queryParams = new URLSearchParams();
    if (options?.limit) queryParams.set('limit', options.limit.toString());
    if (options?.minScore) queryParams.set('minScore', options.minScore.toString());
    if (options?.includeGaps) queryParams.set('includeGaps', 'true');

    const response = await fetch(`${this.backendUrl}/api/match-profile?${queryParams}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(matchRequest)
    });

    if (!response.ok) {
      throw new Error(`Matching failed: ${response.status}`);
    }

    const matchResults = await response.json();

    return {
      cvId,
      profile,
      matchResults,
      timestamp: new Date()
    };
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Fetch occupation profile (capabilities, knowledge, tasks)
   */
  private async fetchOccupationProfile(occupationUri: string): Promise<{
    capabilities: ProfileItem[];
    knowledge: ProfileItem[];
    tasks: ProfileItem[];
    workConditions: ProfileItem[];
  }> {
    const endpoint = 'https://sparql.competentnl.nl';

    const query = `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX cnluwv: <https://linkeddata.competentnl.nl/uwv/def/competentnl_uwv#>
      PREFIX cnluwvo: <https://linkeddata.competentnl.nl/def/uwv-ontology#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

      SELECT DISTINCT ?capability ?capLabel ?knowledge ?knowledgeLabel ?task ?taskLabel ?condition ?conditionLabel WHERE {
        BIND(<${occupationUri}> AS ?occ)
        OPTIONAL {
          ?occ cnlo:requiresHATEssential|cnlo:requiresHATImportant|cnlo:requiresHATSomewhat ?capability .
          ?capability a cnlo:HumanCapability .
          FILTER NOT EXISTS { ?capability a cnlo:KnowledgeArea }
          ?capability skos:prefLabel ?capLabel .
          FILTER(LANG(?capLabel) = "nl")
        }
        OPTIONAL {
          ?occ cnlo:requiresHATEssential|cnlo:requiresHATImportant|cnlo:requiresHATSomewhat ?knowledge .
          ?knowledge a cnlo:KnowledgeArea ;
                    skos:prefLabel ?knowledgeLabel .
          FILTER(LANG(?knowledgeLabel) = "nl")
        }
        OPTIONAL {
          VALUES ?taskPred {
            cnluwvo:isCharacterizedByOccupationTask_Essential
            cnluwvo:isCharacterizedByOccupationTask_Optional
          }
          ?occ ?taskPred ?task .
          ?task skos:prefLabel ?taskLabel .
          FILTER(LANG(?taskLabel) = "nl")
        }
        OPTIONAL {
          VALUES ?conditionPred {
            cnluwvo:hasWorkCondition
            cnluwvo:hasWorkContext
          }
          ?occ ?conditionPred ?condition .
          ?condition skos:prefLabel ?conditionLabel .
          FILTER(LANG(?conditionLabel) = "nl")
        }
      }
    `;

    try {
      const response = await fetch(`${this.backendUrl}/proxy/sparql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, endpoint })
      });

      if (!response.ok) {
        console.warn(`Failed to fetch occupation profile for ${occupationUri}`);
        return { capabilities: [], knowledge: [], tasks: [], workConditions: [] };
      }

      const data = await response.json();
      const bindings = data.results?.bindings || [];

      const capabilities: ProfileItem[] = [];
      const knowledge: ProfileItem[] = [];
      const tasks: ProfileItem[] = [];
      const workConditions: ProfileItem[] = [];

      const seenUris = new Set<string>();

      bindings.forEach((row: any) => {
        if (row.capability?.value && row.capLabel?.value && !seenUris.has(row.capability.value)) {
          capabilities.push({
            uri: row.capability.value,
            label: row.capLabel.value,
            type: 'skill',
            source: 'occupation'
          });
          seenUris.add(row.capability.value);
        }
        if (row.knowledge?.value && row.knowledgeLabel?.value && !seenUris.has(row.knowledge.value)) {
          knowledge.push({
            uri: row.knowledge.value,
            label: row.knowledgeLabel.value,
            type: 'knowledge',
            source: 'occupation'
          });
          seenUris.add(row.knowledge.value);
        }
        if (row.task?.value && row.taskLabel?.value && !seenUris.has(row.task.value)) {
          tasks.push({
            uri: row.task.value,
            label: row.taskLabel.value,
            type: 'task',
            source: 'occupation'
          });
          seenUris.add(row.task.value);
        }
        if (row.condition?.value && row.conditionLabel?.value && !seenUris.has(row.condition.value)) {
          workConditions.push({
            uri: row.condition.value,
            label: row.conditionLabel.value,
            type: 'workCondition',
            source: 'occupation'
          });
          seenUris.add(row.condition.value);
        }
      });

      return { capabilities, knowledge, tasks, workConditions };

    } catch (error) {
      console.warn(`Error fetching occupation profile:`, error);
      return { capabilities: [], knowledge: [], tasks: [], workConditions: [] };
    }
  }

  /**
   * Fetch education profile
   */
  private async fetchEducationProfile(educationUri: string): Promise<{
    capabilities: ProfileItem[];
    knowledge: ProfileItem[];
  }> {
    const endpoint = 'https://sparql.competentnl.nl';

    const query = `
      PREFIX cnlo: <https://linkeddata.competentnl.nl/def/competentnl#>
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

      SELECT DISTINCT ?capability ?capLabel ?knowledge ?knowledgeLabel WHERE {
        BIND(<${educationUri}> AS ?edu)
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
          FILTER(LANG(?capLabel) = "nl")
        }
        OPTIONAL {
          VALUES ?knowledgePred {
            cnlo:prescribesKnowledge
            cnlo:prescribesKnowledgeEssential
            cnlo:prescribesKnowledgeImportant
          }
          ?edu ?knowledgePred ?knowledge .
          ?knowledge a cnlo:KnowledgeArea ;
                    skos:prefLabel ?knowledgeLabel .
          FILTER(LANG(?knowledgeLabel) = "nl")
        }
      }
    `;

    try {
      const response = await fetch(`${this.backendUrl}/proxy/sparql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, endpoint })
      });

      if (!response.ok) {
        console.warn(`Failed to fetch education profile for ${educationUri}`);
        return { capabilities: [], knowledge: [] };
      }

      const data = await response.json();
      const bindings = data.results?.bindings || [];

      const capabilities: ProfileItem[] = [];
      const knowledge: ProfileItem[] = [];
      const seenUris = new Set<string>();

      bindings.forEach((row: any) => {
        if (row.capability?.value && row.capLabel?.value && !seenUris.has(row.capability.value)) {
          capabilities.push({
            uri: row.capability.value,
            label: row.capLabel.value,
            type: 'skill',
            source: 'education'
          });
          seenUris.add(row.capability.value);
        }
        if (row.knowledge?.value && row.knowledgeLabel?.value && !seenUris.has(row.knowledge.value)) {
          knowledge.push({
            uri: row.knowledge.value,
            label: row.knowledgeLabel.value,
            type: 'knowledge',
            source: 'education'
          });
          seenUris.add(row.knowledge.value);
        }
      });

      return { capabilities, knowledge };

    } catch (error) {
      console.warn(`Error fetching education profile:`, error);
      return { capabilities: [], knowledge: [] };
    }
  }

  /**
   * Merge items without duplicates
   */
  private mergeItems(target: ProfileItem[], source: ProfileItem[]): void {
    const existingUris = new Set(target.map(item => item.uri));

    for (const item of source) {
      if (!existingUris.has(item.uri)) {
        target.push(item);
        existingUris.add(item.uri);
      }
    }
  }

  /**
   * Calculate years between start and end dates
   */
  private calculateYears(startDate?: string, endDate?: string): number | undefined {
    if (!startDate) return undefined;

    const startYear = parseInt(startDate.substring(0, 4));
    const endYear = endDate
      ? (endDate.toLowerCase().includes('heden') || endDate.toLowerCase().includes('present')
          ? new Date().getFullYear()
          : parseInt(endDate.substring(0, 4)))
      : new Date().getFullYear();

    return isNaN(startYear) || isNaN(endYear) ? undefined : endYear - startYear;
  }

  /**
   * Infer education level from degree name
   */
  private inferEducationLevel(degree?: string): string | undefined {
    if (!degree) return undefined;

    const lower = degree.toLowerCase();

    if (lower.includes('phd') || lower.includes('doctor') || lower.includes('promotie')) return 'PhD';
    if (lower.includes('master') || lower.includes('msc') || lower.includes('ma ')) return 'Master';
    if (lower.includes('bachelor') || lower.includes('bsc') || lower.includes('ba ')) return 'Bachelor';
    if (lower.includes('hbo')) return 'HBO';
    if (lower.includes('mbo')) return 'MBO';
    if (lower.includes('vwo')) return 'VWO';
    if (lower.includes('havo')) return 'HAVO';
    if (lower.includes('vmbo')) return 'VMBO';

    return undefined;
  }
}

export default CVToProfileConverter;
