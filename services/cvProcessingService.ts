/**
 * CV Processing Service
 * Orchestrator voor complete CV privacy-first processing pipeline
 *
 * Pipeline:
 * 1. Upload → 2. Extract Text → 3. Detect PII (GLiNER) → 4. Anonymize →
 * 5. Parse Structure → 6. Generalize Employers → 7. Store → 8. Ready for Classification
 */

import mysql from 'mysql2/promise';
import axios from 'axios';

import {
  parseStructure as pipelineParseStructure,
  storeExtractions as pipelineStoreExtractions,
  storeCVText as pipelineStoreCVText,
  updatePrivacyRisk as pipelineUpdatePrivacyRisk,
  extractText as pipelineExtractText,
  encrypt as pipelineEncrypt,
  decrypt as pipelineDecrypt,
  calculateDuration as pipelineCalculateDuration,
  type ParsedStructure,
  type PrivacyLevel
} from './cvPipeline.ts';

type Pool = mysql.Pool;
type RowDataPacket = mysql.RowDataPacket;
type ResultSetHeader = mysql.ResultSetHeader;

import type {
  UserCV,
  CVExtraction,
  CVExtractionResponse,
  ExperienceExtraction,
  EducationExtraction,
  SkillExtraction,
  GLiNERAnonymizeResult
} from '../types/cv.ts';
import { CVProcessingError } from '../types/cv.ts';

import { PrivacyLogger } from './privacyLogger.ts';
import {
  generalizeEmployerSequence,
  assessReIdentificationRisk
} from './employerGeneralizer.ts';
import { assessCVRisk } from './riskAssessment.ts';
import { CNLClassificationService } from './cnlClassificationService.ts';

const GLINER_SERVICE_URL = process.env.GLINER_SERVICE_URL || 'http://localhost:8001';

// Error codes for status endpoint
export const CV_ERROR_CODES = {
  GLINER_SERVICE_UNAVAILABLE: 'GLINER_SERVICE_UNAVAILABLE',
  PII_DETECTION_FAILED: 'PII_DETECTION_FAILED',
  TEXT_EXTRACTION_FAILED: 'TEXT_EXTRACTION_FAILED',
  EMPTY_DOCUMENT: 'EMPTY_DOCUMENT',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  PROCESSING_TIMEOUT: 'PROCESSING_TIMEOUT',
  MAX_RETRIES_EXCEEDED: 'MAX_RETRIES_EXCEEDED'
} as const;

export class CVProcessingService {
  private db: Pool;
  private privacyLogger: PrivacyLogger;

  constructor(database: Pool) {
    this.db = database;
    this.privacyLogger = new PrivacyLogger(database);
  }

  /**
   * Check if GLiNER service is available
   * Useful for pre-check before upload or for health monitoring
   */
  async checkGLiNERHealth(): Promise<{
    available: boolean;
    responseTimeMs?: number;
    error?: string;
  }> {
    const startTime = Date.now();
    try {
      const response = await axios.get(`${GLINER_SERVICE_URL}/health`, {
        timeout: 5000
      });
      const responseTimeMs = Date.now() - startTime;

      return {
        available: response.data?.status === 'healthy',
        responseTimeMs
      };
    } catch (error) {
      return {
        available: false,
        error: axios.isAxiosError(error) && error.code === 'ECONNREFUSED'
          ? 'GLiNER service is not running'
          : error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Main processing pipeline
   */
  async processCV(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    sessionId: string
  ): Promise<number> {
    const cvId = await this.createCVRecord(fileName, fileBuffer.length, mimeType, sessionId);

    await this.updateCVStatus(cvId, 'processing');
    await this.processCVRecord(cvId, fileBuffer, fileName, mimeType, sessionId);

    return cvId;
  }

  /**
   * Start processing asynchronously and return the CV id immediately.
   * Processing runs in background; status can be polled via /status endpoint.
   * If processing fails, job worker will retry with exponential backoff.
   */
  async enqueueProcessCV(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    sessionId: string
  ): Promise<number> {
    const cvId = await this.createCVRecord(fileName, fileBuffer.length, mimeType, sessionId);

    // Zet processing_started_at meteen bij enqueue (niet pas bij daadwerkelijke verwerking)
    await this.db.execute(
      `UPDATE user_cvs SET
        processing_status = 'processing',
        processing_started_at = NOW()
      WHERE id = ?`,
      [cvId]
    );

    // Start background processing
    void this.processCVRecord(cvId, fileBuffer, fileName, mimeType, sessionId).catch((error) => {
      // Log error - status wordt al geupdate in processCVRecord
      console.error(`[CVProcessingService] Background processing failed for CV ${cvId}:`, error);
      // Job worker zal failed jobs oppikken voor retry
    });

    return cvId;
  }

  private async processCVRecord(
    cvId: number,
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    sessionId: string
  ): Promise<void> {

    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Starting CV Processing Pipeline`);
      console.log(`File: ${fileName} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
      console.log(`Session: ${sessionId}`);
      console.log(`${'='.repeat(60)}\n`);

      console.log(`[OK] STAP 1: CV record created (ID: ${cvId})`);

      // STAP 2: Extract text from PDF/Word
      const startExtract = Date.now();
      const rawText = await this.extractText(fileBuffer, mimeType);
      const extractDuration = Date.now() - startExtract;

      console.log(`[OK] STAP 2: Text extracted (${rawText.length} chars, ${extractDuration}ms)`);

      if (!rawText || rawText.trim().length === 0) {
        throw new CVProcessingError(
          'No text could be extracted from document',
          'EMPTY_DOCUMENT',
          cvId,
          'extract_text'
        );
      }

      // STAP 3: Detect PII with GLiNER (lokaal!)
      const startPII = Date.now();
      const piiResult = await this.detectAndAnonymizePII(rawText);
      const piiDuration = Date.now() - startPII;

      console.log(`[OK] STAP 3: PII detected (${piiResult.entity_count} items, ${piiDuration}ms)`);
      console.log(`  Types: ${Object.keys(piiResult.pii_detected).filter(k => piiResult.pii_detected[k].length > 0).join(', ')}`);

      // Log PII detectie
      await this.privacyLogger.logPIIDetected(
        cvId,
        Object.keys(piiResult.pii_detected).filter(k => piiResult.pii_detected[k].length > 0),
        piiResult.entity_count
      );

      // STAP 4: Store encrypted original + anonymized
      await this.storeCVText(
        cvId,
        rawText,
        piiResult.anonymized_text,
        piiResult.pii_detected
      );

      console.log(`[OK] STAP 4: Text stored (original encrypted, anonymized plain)`);

      // Log anonimisering
      await this.privacyLogger.logPIIAnonymized(
        cvId,
        Object.keys(piiResult.pii_detected).filter(k => piiResult.pii_detected[k].length > 0),
        piiResult.entity_count
      );

      // STAP 5: Parse structure uit anonymized text
      const startParse = Date.now();
      const parsed = await this.parseStructure(piiResult.anonymized_text);
      const parseDuration = Date.now() - startParse;

      console.log(`[OK] STAP 5: Structure parsed (${parseDuration}ms)`);
      console.log(`  Experience: ${parsed.experience.length}, Education: ${parsed.education.length}, Skills: ${parsed.skills.length}`);

      // STAP 6: Generalize employers (for logging)
      const employers = parsed.experience.map(e => e.organization).filter(Boolean) as string[];
      const jobTitles = parsed.experience.map(e => e.jobTitle);

      const generalizedEmployers = generalizeEmployerSequence(
        employers,
        jobTitles,
        'medium'
      );

      console.log(`[OK] STAP 6: Employers generalized`);
      generalizedEmployers.forEach((ge, i) => {
        if (ge.original !== ge.generalized) {
          console.log(`  "${ge.original}" → "${ge.generalized}"`);
        }
      });

      // Log employer generalisatie
      if (employers.length > 0) {
        const employerRiskAssessment = assessReIdentificationRisk(employers);
        await this.privacyLogger.logEmployerGeneralized(
          cvId,
          employers,
          generalizedEmployers.map(ge => ge.generalized),
          employerRiskAssessment.riskScore
        );
      }

      // STAP 7: Assess privacy risk
      const riskAssessment = assessCVRisk(piiResult.pii_detected, employers);

      console.log(`[OK] STAP 7: Privacy risk assessed`);
      console.log(`  Overall Risk: ${riskAssessment.overallRisk} (score: ${riskAssessment.riskScore}/100)`);
      console.log(`  Recommendation: ${riskAssessment.recommendation}`);

      // Update CV with risk assessment
      await pipelineUpdatePrivacyRisk(this.db, cvId, riskAssessment);

      // STAP 8: Store extractions (uses shared pipeline with Gemini-parsed data)
      await pipelineStoreExtractions(this.db, cvId, parsed);

      console.log(`[OK] STAP 8: Extractions stored in database`);

      // STAP 9: Complete
      const totalDuration = Date.now() - startExtract;
      await this.updateCVStatus(cvId, 'completed', totalDuration);

      console.log(`\n${'='.repeat(60)}`);
      console.log(`[SUCCESS] CV Processing Complete`);
      console.log(`Total duration: ${totalDuration}ms`);
      console.log(`${'='.repeat(60)}\n`);

    } catch (error) {
      console.error(`[ERROR] CV Processing Failed:`, error);

      await this.updateCVStatus(
        cvId,
        'failed',
        undefined,
        error instanceof Error ? error.message : String(error)
      );

      throw error;
    }
  }

  /**
   * Extract text from PDF or Word - delegates to shared pipeline
   */
  private async extractText(buffer: Buffer, mimeType: string): Promise<string> {
    try {
      return await pipelineExtractText(buffer, mimeType);
    } catch (error) {
      throw new CVProcessingError(
        `Failed to extract text: ${error instanceof Error ? error.message : String(error)}`,
        'TEXT_EXTRACTION_FAILED',
        undefined,
        'extract_text',
        { mimeType, error }
      );
    }
  }

  /**
   * Detect and anonymize PII using GLiNER service
   */
  private async detectAndAnonymizePII(text: string): Promise<GLiNERAnonymizeResult> {
    try {
      const response = await axios.post(
        `${GLINER_SERVICE_URL}/anonymize`,
        {
          text,
          threshold: 0.3,
          max_length: 512
        },
        {
          timeout: 30000 // 30 sec timeout
        }
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          throw new CVProcessingError(
            'GLiNER service is not available. Please start the service with: cd services/python && source venv/bin/activate && python3 gliner_service.py',
            'GLINER_SERVICE_UNAVAILABLE',
            undefined,
            'detect_pii',
            { url: GLINER_SERVICE_URL }
          );
        }
      }

      throw new CVProcessingError(
        `PII detection failed: ${error instanceof Error ? error.message : String(error)}`,
        'PII_DETECTION_FAILED',
        undefined,
        'detect_pii',
        { error }
      );
    }
  }

  /**
   * Parse CV structure - delegates to shared pipeline (Gemini LLM + regex fallback)
   */
  private async parseStructure(anonymizedText: string): Promise<ParsedStructure> {
    return pipelineParseStructure(anonymizedText);
  }

  /**
   * Database operations
   */

  private async createCVRecord(
    fileName: string,
    fileSizeBytes: number,
    mimeType: string,
    sessionId: string
  ): Promise<number> {
    const [result] = await this.db.execute<ResultSetHeader>(
      `INSERT INTO user_cvs (
        session_id, file_name, file_size_kb, mime_type,
        processing_status, processing_started_at
      ) VALUES (?, ?, ?, ?, 'pending', NOW())`,
      [sessionId, fileName, Math.round(fileSizeBytes / 1024), mimeType]
    );

    return result.insertId;
  }

  private async updateCVStatus(
    cvId: number,
    status: 'pending' | 'processing' | 'completed' | 'failed',
    duration?: number,
    errorMessage?: string
  ): Promise<void> {
    if (status === 'completed') {
      await this.db.execute(
        `UPDATE user_cvs SET
          processing_status = ?,
          processing_completed_at = NOW(),
          processing_duration_ms = ?
        WHERE id = ?`,
        [status, duration || null, cvId]
      );
    } else if (status === 'failed') {
      await this.db.execute(
        `UPDATE user_cvs SET
          processing_status = ?,
          error_message = ?
        WHERE id = ?`,
        [status, errorMessage, cvId]
      );
    } else {
      await this.db.execute(
        `UPDATE user_cvs SET processing_status = ? WHERE id = ?`,
        [status, cvId]
      );
    }
  }

  private async storeCVText(
    cvId: number,
    originalText: string,
    anonymizedText: string,
    piiDetected: any
  ): Promise<void> {
    await pipelineStoreCVText(this.db, cvId, originalText, anonymizedText, piiDetected);
  }

  /**
   * Get CV extraction for review screen
   */
  async getCVExtraction(cvId: number): Promise<CVExtractionResponse | null> {
    // Get CV
    const [cvRows] = await this.db.execute<RowDataPacket[]>(
      `SELECT * FROM user_cvs WHERE id = ? AND deleted_at IS NULL`,
      [cvId]
    );

    if (cvRows.length === 0) {
      return null;
    }

    const cv = cvRows[0];

    // Get extractions
    const [extractionRows] = await this.db.execute<RowDataPacket[]>(
      `SELECT * FROM cv_extractions WHERE cv_id = ? ORDER BY section_type, id`,
      [cvId]
    );

    // Group by type
    const experience: ExperienceExtraction[] = [];
    const education: EducationExtraction[] = [];
    const skills: SkillExtraction[] = [];

    for (const row of extractionRows) {
      const content = JSON.parse(row.content);

      if (row.section_type === 'experience') {
        experience.push({
          ...row,
          content,
          displayEmployer: row.generalized_employer || row.original_employer || '',
          privacyInfo: {
            wasGeneralized: !!row.generalized_employer,
            originalEmployer: row.original_employer,
            generalizedEmployer: row.generalized_employer,
            isIdentifying: row.employer_is_identifying
          }
        } as ExperienceExtraction);
      } else if (row.section_type === 'education') {
        education.push({ ...row, content } as EducationExtraction);
      } else if (row.section_type === 'skill') {
        skills.push({
          ...row,
          content,
          inCNLDatabase: false // TODO: Check tegen CNL database
        } as SkillExtraction);
      }
    }

    // Calculate overall confidence
    const allConfidences = extractionRows
      .map(r => r.confidence_score)
      .filter(c => c != null);
    const overallConfidence = allConfidences.length > 0
      ? allConfidences.reduce((sum, c) => sum + c, 0) / allConfidences.length
      : 0;

    const itemsNeedingReview = extractionRows.filter(r => r.needs_review).length;

    const piiDetected = cv.pii_detected ? JSON.parse(cv.pii_detected) : [];

    return {
      cvId: cv.id,
      fileName: cv.file_name,
      uploadDate: cv.upload_date,
      privacyStatus: {
        piiDetected,
        piiCount: cv.pii_count,
        riskLevel: cv.privacy_risk_level,
        riskScore: cv.privacy_risk_score,
        allowExactData: cv.allow_exact_data,
        recommendation: '' // TODO: Get from risk assessment
      },
      sections: {
        experience,
        education,
        skills
      },
      overallConfidence,
      needsReview: itemsNeedingReview > 0,
      itemsNeedingReview
    };
  }

  /**
   * Quick Process - Automatic processing for "Snelle Upload & Match"
   * Uses medium privacy settings and auto-selects best classifications
   * Note: Progress tracking is done via elapsed time in quick-status endpoint
   */
  async quickProcess(cvId: number, options?: {
    autoAnonymize?: boolean;
    piiReplacementFormat?: string;
    privacyLevel?: 'low' | 'medium' | 'high';
    autoClassify?: boolean;
    selectBestMatch?: boolean;
    deriveSkillsFromTaxonomy?: boolean;
    includeEducationSkills?: boolean;
    includeOccupationSkills?: boolean;
  }): Promise<void> {
    console.log(`\n⚡ Starting Quick Process for CV ${cvId}`);
    console.log(`  Options:`, options);

    try {
      // The CV should already be uploaded and processing started
      // Wait for the regular processing to complete
      let attempts = 0;
      const maxAttempts = 120; // 60 seconds max (500ms * 120)

      while (attempts < maxAttempts) {
        const [rows] = await this.db.execute<any[]>(
          `SELECT processing_status, error_message FROM user_cvs WHERE id = ?`,
          [cvId]
        );

        if (rows.length === 0) {
          throw new Error('CV not found');
        }

        const status = rows[0].processing_status;
        const errorMsg = rows[0].error_message;

        if (status === 'completed') {
          console.log(`  ✓ CV ${cvId} processing completed`);
          break;
        } else if (status === 'failed') {
          throw new Error(errorMsg || 'CV processing failed');
        }

        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;

        // Log progress every 10 attempts
        if (attempts % 10 === 0) {
          console.log(`  ... waiting for CV ${cvId} (attempt ${attempts}/${maxAttempts})`);
        }
      }

      if (attempts >= maxAttempts) {
        throw new Error('Processing timeout - CV verwerking duurt te lang');
      }

      // Apply medium privacy settings (generalize employers)
      if (options?.privacyLevel === 'medium' || !options?.privacyLevel) {
        await this.db.execute(
          `UPDATE user_cvs SET allow_exact_data = FALSE WHERE id = ?`,
          [cvId]
        );
      }

      // STAP 2: Run CNL classification to match extractions against taxonomy
      if (options?.autoClassify !== false) {
        console.log(`  🔄 Starting CNL classification for CV ${cvId}...`);

        const classificationService = new CNLClassificationService(this.db);
        const classifyResult = await classificationService.classifyCV(cvId, {
          useSemanticMatching: true,
          useLLMFallback: true
        });

        console.log(`  ✓ CNL classification completed:`);
        console.log(`    - Items classified: ${classifyResult.summary?.classified || 0}/${classifyResult.summary?.total || 0}`);
        console.log(`    - Needs review: ${classifyResult.summary?.needsReview || 0}`);
        console.log(`    - Avg confidence: ${((classifyResult.summary?.averageConfidence || 0) * 100).toFixed(1)}%`);

        // Auto-select best matches for all items (including needsReview)
        if (options?.selectBestMatch !== false) {
          console.log(`  🔄 Auto-selecting best matches...`);
          let confirmed = 0;
          let autoSelected = 0;
          let skippedLowConfidence = 0;
          const AUTO_SELECT_MIN_CONFIDENCE = 0.60; // Minimaal 60% voor auto-select

          const allClassifications = [
            ...(classifyResult.classifications?.experience || []),
            ...(classifyResult.classifications?.education || []),
            ...(classifyResult.classifications?.skills || [])
          ];

          for (const item of allClassifications) {
            const cls = item.classification;

            if (cls.found && cls.match) {
              // Confident match - auto-confirm
              await this.db.execute(
                `UPDATE cv_extractions SET classification_confirmed = TRUE WHERE id = ?`,
                [item.extractionId]
              );
              confirmed++;
            } else if (cls.needsReview && cls.alternatives && cls.alternatives.length > 0) {
              // No confident match, but alternatives exist - select best IF above threshold
              const bestAlt = cls.alternatives[0]; // Already sorted by confidence

              if (bestAlt.confidence >= AUTO_SELECT_MIN_CONFIDENCE) {
                await this.db.execute(
                  `UPDATE cv_extractions SET
                    matched_cnl_uri = ?,
                    matched_cnl_label = ?,
                    confidence_score = ?,
                    classification_method = 'auto_selected',
                    classification_confirmed = TRUE,
                    classified_at = NOW(),
                    needs_review = FALSE,
                    updated_at = NOW()
                  WHERE id = ?`,
                  [bestAlt.uri, bestAlt.prefLabel, bestAlt.confidence, item.extractionId]
                );
                autoSelected++;
                console.log(`    Auto-selected: "${bestAlt.prefLabel}" (${(bestAlt.confidence * 100).toFixed(0)}%) for extraction ${item.extractionId}`);
              } else {
                skippedLowConfidence++;
              }
            }
          }

          console.log(`  ✓ Confirmed: ${confirmed}, Auto-selected: ${autoSelected}, Skipped (low confidence): ${skippedLowConfidence}`);
        }
      }

      console.log(`✅ Quick Process completed for CV ${cvId}`);

    } catch (error) {
      console.error(`❌ Quick Process error for CV ${cvId}:`, error);
      throw error;
    }
  }
}

export default CVProcessingService;
