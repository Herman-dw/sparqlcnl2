/**
 * TypeScript Types voor CV Privacy Processing
 * Match met database schema en API contracts
 */

// ============================================================================
// Database Models
// ============================================================================

export interface UserCV {
  id: number;
  session_id: string;
  user_email?: string;
  file_name: string;
  file_size_kb: number;
  mime_type: string;
  upload_date: Date;

  // Text content
  original_text_encrypted?: Buffer;
  anonymized_text?: string;

  // PII tracking
  pii_detected?: string[];
  pii_count: number;

  // Processing status
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  processing_started_at?: Date;
  processing_completed_at?: Date;
  processing_duration_ms?: number;
  error_message?: string;

  // Privacy risk
  privacy_risk_score?: number;
  privacy_risk_level?: 'low' | 'medium' | 'high' | 'critical';
  allow_exact_data: boolean;

  // Relations
  created_profile_id?: number;

  // Audit
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

export interface CVExtraction {
  id: number;
  cv_id: number;
  section_type: 'experience' | 'education' | 'skill' | 'summary';

  // Content
  content: ExperienceContent | EducationContent | SkillContent;

  // Anonymization
  original_employer?: string;
  generalized_employer?: string;
  employer_sector?: string;
  employer_is_identifying: boolean;

  // Classification
  matched_cnl_uri?: string;
  matched_cnl_label?: string;
  confidence_score?: number;
  classification_method?: 'rules' | 'local_db' | 'llm' | 'manual';
  alternative_matches?: AlternativeMatch[];

  // Review flags
  needs_review: boolean;
  user_validated: boolean;
  user_correction?: any;

  // Audit
  created_at: Date;
  updated_at: Date;
}

export interface PrivacyConsentLog {
  id: number;
  cv_id: number;
  event_type: 'pii_detected' | 'pii_anonymized' | 'employer_generalized' |
               'user_consent_given' | 'user_consent_declined' |
               'llm_call_made' | 'exact_data_shared';

  // PII details
  pii_types?: string[];
  pii_count: number;

  // Employer details
  employers_original?: string[];
  employers_generalized?: string[];
  risk_score?: number;

  // Consent
  consent_given?: boolean;
  consent_text?: string;
  exact_data_shared: boolean;

  // LLM tracking
  llm_provider?: string;
  llm_data_sent?: any;
  llm_contained_pii: boolean;

  // Audit
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
}

// ============================================================================
// Content Types
// ============================================================================

export interface ExperienceContent {
  job_title: string;
  organization?: string;
  start_date?: string;
  end_date?: string;
  duration_years?: number;
  description?: string;
  extracted_skills: string[];
}

export interface EducationContent {
  degree: string;
  institution?: string;
  field_of_study?: string;
  start_year?: string;
  end_year?: string;
  description?: string;
}

export interface SkillContent {
  skill_name: string;
  skill_level?: string;
  years_experience?: number;
}

export interface AlternativeMatch {
  uri: string;
  label: string;
  score: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

// Upload
export interface CVUploadRequest {
  sessionId: string;
  file: File;
}

export interface CVUploadResponse {
  success: boolean;
  cvId: number;
  message: string;
  processingStatus: string;
}

// Status
export interface CVStatusResponse {
  cvId: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number; // 0-100
  currentStep?: string;
  error?: string;
}

// Extraction Results (voor review scherm)
export interface CVExtractionResponse {
  cvId: number;
  fileName: string;
  uploadDate: Date;

  // Privacy info
  privacyStatus: {
    piiDetected: string[];
    piiCount: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    riskScore: number;
    allowExactData: boolean;
    recommendation: string;
  };

  // Extracted sections
  sections: {
    experience: ExperienceExtraction[];
    education: EducationExtraction[];
    skills: SkillExtraction[];
    summary?: string;
  };

  // Overall quality
  overallConfidence: number;
  needsReview: boolean;
  itemsNeedingReview: number;
}

export interface ExperienceExtraction extends CVExtraction {
  content: ExperienceContent;
  displayEmployer: string; // Generalized or original based on privacy level
  privacyInfo: {
    wasGeneralized: boolean;
    originalEmployer?: string;
    generalizedEmployer?: string;
    isIdentifying: boolean;
  };
}

export interface EducationExtraction extends CVExtraction {
  content: EducationContent;
}

export interface SkillExtraction extends CVExtraction {
  content: SkillContent;
  inCNLDatabase: boolean;
}

// Privacy Consent
export interface PrivacyConsentRequest {
  cvId: number;
  consentGiven: boolean;
  useExactEmployers: boolean;
  consentText: string;
}

export interface PrivacyConsentResponse {
  success: boolean;
  message: string;
  allowedActions: string[];
}

// Classification
export interface ClassifyRequest {
  cvId: number;
  useExactEmployers?: boolean;
  forceReclassify?: boolean;
}

export interface ClassifyResponse {
  cvId: number;
  classifications: {
    experienceId: number;
    matched_cnl_uri: string;
    matched_cnl_label: string;
    confidence: number;
    alternatives: AlternativeMatch[];
  }[];
  processingTime: number;
  llmCallsMade: number;
}

// Update Extraction (user corrections)
export interface UpdateExtractionRequest {
  cvId: number;
  extractionId: number;
  correctedValue: {
    field: string;
    value: any;
  };
  feedbackType: 'correct' | 'incorrect' | 'missing' | 'duplicate';
  comment?: string;
}

export interface UpdateExtractionResponse {
  success: boolean;
  message: string;
  updatedExtraction: CVExtraction;
}

// Convert to Match Profile
export interface ConvertToProfileRequest {
  cvId: number;
  includeUnconfirmed?: boolean;
  privacyLevel?: 'low' | 'medium' | 'high';
}

export interface ConvertToProfileResponse {
  success: boolean;
  matchProfile: MatchProfile;
}

// ============================================================================
// Service Types
// ============================================================================

// GLiNER Service Response
export interface GLiNERDetectionResult {
  entities: Array<{
    label: string;
    text: string;
    start: number;
    end: number;
    score: number;
    source?: string;
  }>;
  categorized?: {
    names: string[];
    emails: string[];
    phones: string[];
    addresses: string[];
    dates: string[];
    organizations: string[];
    other: string[];
  };
  processing_time_ms: number;
  entity_count: number;
}

export interface GLiNERAnonymizeResult {
  anonymized_text: string;
  pii_detected: {
    names: string[];
    emails: string[];
    phones: string[];
    addresses: string[];
    dates: string[];
    organizations: string[];
  };
  entity_count: number;
  processing_time_ms: number;
}

// Employer Generalization
export interface GeneralizedEmployer {
  original: string;
  generalized: string;
  category: string;
  sector: string;
  isIdentifying: boolean;
  privacyLevel: 'low' | 'medium' | 'high';
}

export interface EmployerRiskAssessment {
  employers: string[];
  isIdentifying: boolean;
  riskScore: number;
  recommendation: 'safe' | 'generalize' | 'high_risk';
}

// CV Risk Assessment
export interface CVRiskAssessment {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  piiDetected: Array<{
    type: string;
    count: number;
    severity: 'low' | 'medium' | 'high';
  }>;
  employerRisk: EmployerRiskAssessment;
  recommendation: string;
  allowExactDataSharing: boolean;
  requiresUserReview: boolean;
}

// ============================================================================
// Match Profile (existing type - extend if needed)
// ============================================================================

export interface MatchProfile {
  capabilities: Array<{
    uri: string;
    label: string;
    source?: 'cv' | 'manual';
  }>;
  knowledge: Array<{
    uri: string;
    label: string;
  }>;
  tasks: Array<{
    uri: string;
    label: string;
  }>;
  occupationHistory?: Array<{
    occupationUri: string;
    occupationLabel: string;
    years: number;
    isMainOccupation?: boolean;
  }>;
  education?: Array<{
    educationUri: string;
    educationLabel: string;
    level: string;
    yearCompleted?: string;
  }>;
}

// ============================================================================
// Processing Pipeline Types
// ============================================================================

export interface CVProcessingPipeline {
  cvId: number;
  stages: {
    upload: PipelineStage;
    extract_text: PipelineStage;
    detect_pii: PipelineStage;
    anonymize: PipelineStage;
    parse_structure: PipelineStage;
    generalize_employers: PipelineStage;
    classify_cnl: PipelineStage;
    generate_profile: PipelineStage;
  };
  overallStatus: 'pending' | 'processing' | 'completed' | 'failed';
  totalDuration: number;
}

export interface PipelineStage {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  error?: string;
  metadata?: any;
}

// ============================================================================
// Error Types
// ============================================================================

export class CVProcessingError extends Error {
  code: string;
  cvId?: number;
  stage?: string;
  details?: any;

  constructor(
    message: string,
    code: string,
    cvId?: number,
    stage?: string,
    details?: any
  ) {
    super(message);
    this.name = 'CVProcessingError';
    this.code = code;
    this.cvId = cvId;
    this.stage = stage;
    this.details = details;
  }
}

export interface ErrorResponse {
  error: string;
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
}
