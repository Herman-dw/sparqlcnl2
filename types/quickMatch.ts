/**
 * TypeScript Types voor Quick Upload & Match Feature
 * Automatische CV verwerking met animatie feedback
 */

import { MatchResult } from './matching';
import { PIIDetection, ParsedExperience, ParsedEducation, ParsedSkill } from './cv';

// ============================================================================
// Quick Match State
// ============================================================================

export type QuickMatchPhase =
  | 'consent'       // Consent dialog
  | 'uploading'     // Fase 1: Document uploaden
  | 'anonymizing'   // Fase 2: PII detectie & vervanging
  | 'extracting'    // Fase 3: Tekst ontrafelen
  | 'categorizing'  // Fase 4: Categoriseren in vakjes
  | 'classifying'   // Fase 5: CNL classificatie + skills afleiden
  | 'matching'      // Fase 6: Matching uitvoeren
  | 'complete'      // Voltooid
  | 'error';        // Fout opgetreden

export interface QuickMatchState {
  phase: QuickMatchPhase;
  progress: number; // 0-100
  cvId: number | null;

  // Consent status
  consentGiven: boolean;
  consentTimestamp: string | null;

  // Anonimisatie data voor animatie
  anonymizationData: AnonymizationData | null;

  // Extractie data
  extractedData: QuickExtractedData | null;

  // Skills met bronnen
  aggregatedSkills: AggregatedSkills | null;

  // Match resultaten
  matchResults: MatchResult[] | null;

  // Error
  error: string | null;

  // Animatie metadata
  animationData: AnimationData;
}

// ============================================================================
// Anonymization Types
// ============================================================================

export type PIIType = 'NAME' | 'EMAIL' | 'PHONE' | 'ADDRESS' | 'BSN' | 'DATE' | 'OTHER';

export interface DetectedPII {
  id: string;
  original: string;      // Originele tekst (gemaskeerd voor display)
  replacement: string;   // Vervangende label [NAAM], [EMAIL], etc.
  type: PIIType;
  confidence: number;
}

export interface AnonymizationData {
  detectedPII: DetectedPII[];
  piiCount: number;
  piiByType: Record<PIIType, number>;
  processingTimeMs: number;
}

// ============================================================================
// Extracted Data Types
// ============================================================================

export interface QuickExtractedData {
  // Basis extracties
  workExperiences: QuickWorkExperience[];
  education: QuickEducation[];
  directSkills: string[];

  // CNL classificaties
  classifiedExperiences: ClassifiedExperience[];
  classifiedEducation: ClassifiedEducation[];

  // Metadata
  totalItems: number;
  processingTimeMs: number;
}

export interface QuickWorkExperience {
  id: string;
  jobTitle: string;
  organization?: string;
  generalizedOrganization?: string;
  startDate?: string;
  endDate?: string;
  duration?: number;
  extractedSkills: string[];
}

export interface QuickEducation {
  id: string;
  degree: string;
  institution?: string;
  year?: string;
  fieldOfStudy?: string;
}

// ============================================================================
// Classification Types
// ============================================================================

export interface CNLClassification {
  uri: string;
  prefLabel: string;
  confidence: number;
  method: 'exact' | 'fuzzy' | 'semantic' | 'llm';
}

export interface RelatedSkill {
  uri: string;
  label: string;
  relevance: number;
}

export interface ClassifiedExperience {
  experienceId: string;
  jobTitle: string;
  cnlClassification: CNLClassification | null;
  relatedSkills: RelatedSkill[];
}

export interface ClassifiedEducation {
  educationId: string;
  degree: string;
  cnlClassification: CNLClassification | null;
  relatedSkills: RelatedSkill[];
}

// ============================================================================
// Skills Aggregation Types
// ============================================================================

export type SkillSource = 'cv-direct' | 'education' | 'occupation';

export interface SkillWithSource {
  label: string;
  uri?: string;
  source: SkillSource;
  sourceLabel?: string;  // Bv. "HBO Informatica" of "Software Developer"
  confidence?: number;
}

export interface AggregatedSkills {
  direct: SkillWithSource[];        // Direct uit CV tekst
  fromEducation: SkillWithSource[]; // Via opleiding + CNL taxonomie
  fromOccupation: SkillWithSource[];// Via beroep + CNL taxonomie
  combined: string[];               // Alle unieke skills samengevoegd
  totalCount: number;
  bySource: {
    direct: number;
    education: number;
    occupation: number;
  };
}

// ============================================================================
// Animation Data Types
// ============================================================================

export interface AnimationData {
  // Fase 1: Upload
  uploadProgress: number;
  fileName?: string;
  fileSize?: number;

  // Fase 2: Anonimiseren
  piiItems: Array<{
    original: string;
    replacement: string;
    revealed: boolean;
  }>;

  // Fase 3: Ontrafelen
  extractedWords: string[];
  wordCount: number;

  // Fase 4: Categoriseren
  categorizedItems: Array<{
    type: 'work' | 'education' | 'skill';
    label: string;
    sorted: boolean;
  }>;

  // Fase 5: Classificeren
  classifiedItems: Array<{
    original: string;
    cnlLabel: string;
    derivedSkills: string[];
    classified: boolean;
  }>;

  // Fase 6: Matchen
  matchProgress: number;
  topMatches: Array<{
    label: string;
    score: number;
  }>;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface QuickProcessRequest {
  cvId: number;
  consentGiven: boolean;
  consentTimestamp: string;
  options?: QuickProcessOptions;
}

export interface QuickProcessOptions {
  autoAnonymize: boolean;
  piiReplacementFormat: string;  // '[TYPE]' format
  privacyLevel: 'low' | 'medium' | 'high';
  autoClassify: boolean;
  selectBestMatch: boolean;
  deriveSkillsFromTaxonomy: boolean;
  includeEducationSkills: boolean;
  includeOccupationSkills: boolean;
}

export interface QuickProcessResponse {
  success: boolean;
  cvId: number;
  phase: QuickMatchPhase;
  progress: number;
  message?: string;
  error?: string;
}

export interface QuickStatusResponse {
  cvId: number;
  phase: QuickMatchPhase;
  progress: number;

  // Phase-specific data
  anonymizationData?: AnonymizationData;
  extractedData?: QuickExtractedData;
  aggregatedSkills?: AggregatedSkills;

  // Animation data
  animationData?: Partial<AnimationData>;

  // Timing
  startedAt: string;
  estimatedCompletion?: string;
  processingTimeMs: number;

  // Error
  error?: string;
}

export interface QuickMatchResult {
  success: boolean;
  cvId: number;

  // Processing results
  anonymization: AnonymizationData;
  extraction: QuickExtractedData;
  skillSources: AggregatedSkills;

  // Match results
  matches: MatchResult[];
  matchCount: number;

  // Timing
  totalProcessingTimeMs: number;
  phaseTimings: Record<QuickMatchPhase, number>;
}

// ============================================================================
// Component Props Types
// ============================================================================

export interface QuickUploadMatchModalProps {
  isOpen: boolean;
  sessionId: string;
  onComplete: (results: QuickMatchResult) => void;
  onClose: () => void;
  onGoToWizard: () => void;
}

export interface QuickUploadConsentProps {
  onConsent: () => void;
  onCancel: () => void;
  onGoToWizard: () => void;
}

export interface QuickUploadAnimationProps {
  phase: QuickMatchPhase;
  progress: number;
  animationData: AnimationData;
  anonymizationData: AnonymizationData | null;
  extractedData: QuickExtractedData | null;
  aggregatedSkills: AggregatedSkills | null;
}

export interface PhaseComponentProps {
  isActive: boolean;
  isComplete: boolean;
  data: any;
  progress: number;
}

// ============================================================================
// Phase Configuration
// ============================================================================

export interface PhaseConfig {
  id: QuickMatchPhase;
  label: string;
  activeLabel: string;
  icon: string;
  duration: number; // Estimated duration in ms
  progressStart: number;
  progressEnd: number;
}

export const PHASE_CONFIG: PhaseConfig[] = [
  {
    id: 'uploading',
    label: 'Uploaden',
    activeLabel: 'CV uploaden...',
    icon: 'Upload',
    duration: 2000,
    progressStart: 0,
    progressEnd: 15
  },
  {
    id: 'anonymizing',
    label: 'Anonimiseren',
    activeLabel: 'Persoonsgegevens verwijderen...',
    icon: 'Shield',
    duration: 2000,
    progressStart: 15,
    progressEnd: 30
  },
  {
    id: 'extracting',
    label: 'Ontrafelen',
    activeLabel: 'Inhoud analyseren...',
    icon: 'FileText',
    duration: 3000,
    progressStart: 30,
    progressEnd: 50
  },
  {
    id: 'categorizing',
    label: 'Sorteren',
    activeLabel: 'Gegevens categoriseren...',
    icon: 'LayoutGrid',
    duration: 3000,
    progressStart: 50,
    progressEnd: 70
  },
  {
    id: 'classifying',
    label: 'Classificeren',
    activeLabel: 'Skills afleiden via CompetentNL...',
    icon: 'GitBranch',
    duration: 3000,
    progressStart: 70,
    progressEnd: 90
  },
  {
    id: 'matching',
    label: 'Matchen',
    activeLabel: 'Beste matches zoeken...',
    icon: 'Target',
    duration: 2000,
    progressStart: 90,
    progressEnd: 100
  }
];

// ============================================================================
// Utility Functions
// ============================================================================

export function getPhaseIndex(phase: QuickMatchPhase): number {
  const index = PHASE_CONFIG.findIndex(p => p.id === phase);
  return index >= 0 ? index : -1;
}

export function getPhaseConfig(phase: QuickMatchPhase): PhaseConfig | undefined {
  return PHASE_CONFIG.find(p => p.id === phase);
}

export function isPhaseComplete(currentPhase: QuickMatchPhase, checkPhase: QuickMatchPhase): boolean {
  const currentIndex = getPhaseIndex(currentPhase);
  const checkIndex = getPhaseIndex(checkPhase);
  return checkIndex < currentIndex || currentPhase === 'complete';
}

export function createInitialAnimationData(): AnimationData {
  return {
    uploadProgress: 0,
    piiItems: [],
    extractedWords: [],
    wordCount: 0,
    categorizedItems: [],
    classifiedItems: [],
    matchProgress: 0,
    topMatches: []
  };
}

export function createInitialState(): QuickMatchState {
  return {
    phase: 'consent',
    progress: 0,
    cvId: null,
    consentGiven: false,
    consentTimestamp: null,
    anonymizationData: null,
    extractedData: null,
    aggregatedSkills: null,
    matchResults: null,
    error: null,
    animationData: createInitialAnimationData()
  };
}
