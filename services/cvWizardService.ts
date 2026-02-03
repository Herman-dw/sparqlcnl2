/**
 * CV Wizard Service
 * Handles step-by-step CV processing with user confirmation at each step
 *
 * Wizard Steps:
 * 1. Tekst Extractie - Extract text from PDF/Word
 * 2. PII Detectie - Detect personal information with highlighting
 * 3. Anonimisering Preview - Side-by-side comparison before/after anonymization
 * 4. Structuur Parsing - Parse work experience, education, skills
 * 5. Privacy & Werkgevers - Choose privacy level and finalize
 */

import mysql from 'mysql2/promise';
import axios from 'axios';
import crypto from 'crypto';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

type Pool = mysql.Pool;
type RowDataPacket = mysql.RowDataPacket;
type ResultSetHeader = mysql.ResultSetHeader;

import type {
  Step1ExtractResponse,
  Step2PIIResponse,
  Step3AnonymizeResponse,
  Step4ParseResponse,
  Step5FinalizeResponse,
  Step6ClassifyResponse,
  PIIDetection,
  ParsedExperience,
  ParsedEducation,
  ParsedSkill,
  GeneralizedEmployerInfo,
  PrivacyLevel,
  WizardStepName,
  WizardStepStatus,
  WizardStatusResponse
} from '../types/cv.ts';
import { CVProcessingError } from '../types/cv.ts';

import { PrivacyLogger } from './privacyLogger.ts';
import {
  generalizeEmployer,
  generalizeEmployerSequence,
  assessReIdentificationRisk
} from './employerGeneralizer.ts';
import { assessCVRisk } from './riskAssessment.ts';
import { CNLClassificationService } from './cnlClassificationService.ts';

const GLINER_SERVICE_URL = process.env.GLINER_SERVICE_URL || 'http://localhost:8001';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';

interface StepInfo {
  stepNumber: 1 | 2 | 3 | 4 | 5 | 6;
  stepName: WizardStepName;
  label: string;
  labelNL: string;
}

const WIZARD_STEPS: StepInfo[] = [
  { stepNumber: 1, stepName: 'extract', label: 'Text Extraction', labelNL: 'Tekst Extractie' },
  { stepNumber: 2, stepName: 'detect_pii', label: 'PII Detection', labelNL: 'PII Detectie' },
  { stepNumber: 3, stepName: 'anonymize', label: 'Anonymization Preview', labelNL: 'Anonimisering Preview' },
  { stepNumber: 4, stepName: 'parse', label: 'Structure Parsing', labelNL: 'Structuur Parsing' },
  { stepNumber: 5, stepName: 'finalize', label: 'Privacy & Employers', labelNL: 'Privacy & Werkgevers' },
  { stepNumber: 6, stepName: 'classify', label: 'CNL Classification', labelNL: 'CNL Classificatie' }
];

export class CVWizardService {
  private db: Pool;
  private privacyLogger: PrivacyLogger;

  // In-memory storage for step data (between steps)
  private stepDataCache: Map<number, {
    rawText?: string;
    piiDetections?: PIIDetection[];
    anonymizedText?: string;
    parsedData?: any;
    fileBuffer?: Buffer;
    mimeType?: string;
  }> = new Map();

  constructor(database: Pool) {
    this.db = database;
    this.privacyLogger = new PrivacyLogger(database);
  }

  // ========================================================================
  // PUBLIC METHODS
  // ========================================================================

  /**
   * Start wizard processing for a new CV
   */
  async startWizard(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    sessionId: string
  ): Promise<{ cvId: number; step1: Step1ExtractResponse }> {
    // Create CV record in wizard mode
    const cvId = await this.createWizardCVRecord(fileName, fileBuffer.length, mimeType, sessionId);

    // Store file buffer in cache for later steps
    this.stepDataCache.set(cvId, { fileBuffer, mimeType });

    // Initialize all 5 step records
    await this.initializeStepRecords(cvId);

    // Execute step 1
    const step1 = await this.executeStep1(cvId, fileBuffer, mimeType);

    return { cvId, step1 };
  }

  /**
   * Confirm current step and proceed to next
   */
  async confirmStepAndProceed(
    cvId: number,
    modifications?: any,
    modifiedDetections?: PIIDetection[],
    privacyLevel?: PrivacyLevel
  ): Promise<{
    nextStep?: Step1ExtractResponse | Step2PIIResponse | Step3AnonymizeResponse | Step4ParseResponse | Step5FinalizeResponse | Step6ClassifyResponse;
    isComplete: boolean;
  }> {
    // Get current step
    const currentStep = await this.getCurrentStep(cvId);

    if (!currentStep) {
      throw new CVProcessingError('No active step found', 'NO_ACTIVE_STEP', cvId);
    }

    // Mark current step as confirmed
    await this.confirmStep(cvId, currentStep.stepNumber, modifications);

    // If confirming Step 2 with modified detections, store them in cache for Step 3
    if (currentStep.stepNumber === 2 && modifiedDetections && modifiedDetections.length > 0) {
      const cache = this.stepDataCache.get(cvId) || {};
      cache.piiDetections = modifiedDetections;
      this.stepDataCache.set(cvId, cache);
      console.log(`📝 Stored ${modifiedDetections.length} modified PII detections for CV ${cvId}`);
    }

    // If confirming Step 5, store extractions before proceeding to Step 6
    if (currentStep.stepNumber === 5) {
      await this.storeExtractionsBeforeClassification(cvId, privacyLevel || 'medium');
    }

    // If this was the last step (Step 6), complete the wizard
    if (currentStep.stepNumber === 6) {
      await this.completeWizard(cvId, privacyLevel || 'medium');
      return { isComplete: true };
    }

    // Execute next step
    const nextStepNumber = (currentStep.stepNumber + 1) as 1 | 2 | 3 | 4 | 5 | 6;
    const nextStep = await this.executeStep(cvId, nextStepNumber, modifiedDetections);

    return { nextStep, isComplete: false };
  }

  /**
   * Go back to previous step
   */
  async goToPreviousStep(cvId: number): Promise<{
    step: Step1ExtractResponse | Step2PIIResponse | Step3AnonymizeResponse | Step4ParseResponse | Step5FinalizeResponse;
    stepNumber: number;
  }> {
    const currentStep = await this.getCurrentStep(cvId);

    if (!currentStep || currentStep.stepNumber === 1) {
      throw new CVProcessingError('Cannot go back from first step', 'CANNOT_GO_BACK', cvId);
    }

    const previousStepNumber = (currentStep.stepNumber - 1) as 1 | 2 | 3 | 4 | 5;

    // Get previous step data from database
    const stepData = await this.getStepData(cvId, previousStepNumber);

    // Update current wizard step
    await this.db.execute(
      `UPDATE user_cvs SET current_wizard_step = ? WHERE id = ?`,
      [previousStepNumber, cvId]
    );

    return {
      step: stepData,
      stepNumber: previousStepNumber
    };
  }

  /**
   * Get wizard status
   */
  async getWizardStatus(cvId: number): Promise<WizardStatusResponse> {
    const [cvRows] = await this.db.execute<RowDataPacket[]>(
      `SELECT id, wizard_mode, current_wizard_step FROM user_cvs WHERE id = ?`,
      [cvId]
    );

    if (cvRows.length === 0) {
      throw new CVProcessingError('CV not found', 'NOT_FOUND', cvId);
    }

    const cv = cvRows[0];

    const [stepRows] = await this.db.execute<RowDataPacket[]>(
      `SELECT step_number, step_name, status, user_confirmed
       FROM cv_processing_steps
       WHERE cv_id = ?
       ORDER BY step_number`,
      [cvId]
    );

    const currentStep = cv.current_wizard_step || 1;

    return {
      cvId,
      wizardMode: cv.wizard_mode,
      currentStep,
      steps: stepRows.map(row => ({
        stepNumber: row.step_number,
        stepName: row.step_name,
        status: row.status,
        userConfirmed: row.user_confirmed
      })),
      canGoBack: currentStep > 1,
      canGoForward: stepRows.some(r => r.step_number === currentStep && (r.status === 'completed' || r.status === 'confirmed'))
    };
  }

  /**
   * Get current step data
   */
  async getCurrentStepData(cvId: number): Promise<{
    stepNumber: number;
    stepData: any;
  }> {
    const currentStep = await this.getCurrentStep(cvId);

    if (!currentStep) {
      throw new CVProcessingError('No active step found', 'NO_ACTIVE_STEP', cvId);
    }

    const stepData = await this.getStepData(cvId, currentStep.stepNumber as 1 | 2 | 3 | 4 | 5);

    return {
      stepNumber: currentStep.stepNumber,
      stepData
    };
  }

  // ========================================================================
  // STEP EXECUTION METHODS
  // ========================================================================

  private async executeStep(
    cvId: number,
    stepNumber: 1 | 2 | 3 | 4 | 5 | 6,
    modifiedDetections?: PIIDetection[]
  ): Promise<Step1ExtractResponse | Step2PIIResponse | Step3AnonymizeResponse | Step4ParseResponse | Step5FinalizeResponse | Step6ClassifyResponse> {
    switch (stepNumber) {
      case 1:
        const cache = this.stepDataCache.get(cvId);
        if (!cache?.fileBuffer || !cache?.mimeType) {
          throw new CVProcessingError('File data not found in cache', 'CACHE_MISS', cvId);
        }
        return this.executeStep1(cvId, cache.fileBuffer, cache.mimeType);
      case 2:
        return this.executeStep2(cvId);
      case 3:
        return this.executeStep3(cvId, modifiedDetections);
      case 4:
        return this.executeStep4(cvId);
      case 5:
        return this.executeStep5(cvId);
      case 6:
        return this.executeStep6(cvId);
      default:
        throw new CVProcessingError(`Invalid step number: ${stepNumber}`, 'INVALID_STEP', cvId);
    }
  }

  /**
   * Step 1: Text Extraction
   */
  private async executeStep1(
    cvId: number,
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<Step1ExtractResponse> {
    const startTime = Date.now();

    // Update step status
    await this.updateStepStatus(cvId, 1, 'processing');

    try {
      // Extract text
      let extractedText: string;
      let sourceFormat: 'pdf' | 'docx' | 'doc';

      if (mimeType === 'application/pdf') {
        const pdfData = await pdfParse(fileBuffer);
        extractedText = pdfData.text;
        sourceFormat = 'pdf';
      } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        extractedText = result.value;
        sourceFormat = 'docx';
      } else if (mimeType === 'application/msword') {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        extractedText = result.value;
        sourceFormat = 'doc';
      } else {
        throw new CVProcessingError(`Unsupported file type: ${mimeType}`, 'UNSUPPORTED_FORMAT', cvId);
      }

      if (!extractedText || extractedText.trim().length === 0) {
        throw new CVProcessingError('No text could be extracted from document', 'EMPTY_DOCUMENT', cvId);
      }

      const processingTimeMs = Date.now() - startTime;

      // Store in cache
      const cache = this.stepDataCache.get(cvId) || {};
      cache.rawText = extractedText;
      this.stepDataCache.set(cvId, cache);

      const result: Step1ExtractResponse = {
        stepNumber: 1,
        stepName: 'extract',
        extractedText,
        characterCount: extractedText.length,
        wordCount: extractedText.split(/\s+/).filter(w => w.length > 0).length,
        sourceFormat,
        processingTimeMs
      };

      // Update step with output
      await this.updateStepOutput(cvId, 1, result);
      await this.updateStepStatus(cvId, 1, 'completed', processingTimeMs);

      // Update current step
      await this.db.execute(
        `UPDATE user_cvs SET current_wizard_step = 1 WHERE id = ?`,
        [cvId]
      );

      return result;

    } catch (error) {
      await this.updateStepStatus(cvId, 1, 'failed', Date.now() - startTime,
        error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Step 2: PII Detection
   */
  private async executeStep2(cvId: number): Promise<Step2PIIResponse> {
    const startTime = Date.now();
    await this.updateStepStatus(cvId, 2, 'processing');

    try {
      // Get raw text from cache or database
      let cache = this.stepDataCache.get(cvId);
      let rawText = cache?.rawText;

      if (!rawText) {
        // Try to get from step 1 output
        const step1Data = await this.getStepOutputFromDB(cvId, 1);
        rawText = step1Data?.extractedText;

        // Rehydrate cache with data from DB if cache was empty
        if (!cache && rawText) {
          cache = { rawText };
          this.stepDataCache.set(cvId, cache);
        }
      }

      if (!rawText) {
        throw new CVProcessingError('No text available for PII detection', 'NO_TEXT', cvId);
      }

      // Call GLiNER for detection
      const response = await axios.post(
        `${GLINER_SERVICE_URL}/detect`,
        {
          text: rawText,
          threshold: 0.3,
          max_length: 512
        },
        { timeout: 30000 }
      );

      const entities = response.data.entities || [];

      // Convert to PIIDetection format with semantic replacements
      const detections: PIIDetection[] = [];
      for (let index = 0; index < entities.length; index++) {
        const entity = entities[index];
        const type = this.mapEntityType(entity.label);
        const detection: PIIDetection = {
          id: index + 1,
          type,
          text: entity.text,
          startPosition: entity.start,
          endPosition: entity.end,
          confidence: entity.score,
          replacementText: this.getSemanticReplacementText(type, entity.text, detections),
          userApproved: true,
          userAdded: false
        };
        detections.push(detection);
      }

      // Create text with highlights (HTML-safe)
      const textWithHighlights = this.createHighlightedText(rawText, detections);

      // Count by type
      const byType: Record<string, number> = {};
      detections.forEach(d => {
        byType[d.type] = (byType[d.type] || 0) + 1;
      });

      const processingTimeMs = Date.now() - startTime;

      // Store detections in cache (cache is guaranteed to exist after rehydration above)
      if (cache) {
        cache.piiDetections = detections;
        this.stepDataCache.set(cvId, cache);
      }

      const result: Step2PIIResponse = {
        stepNumber: 2,
        stepName: 'detect_pii',
        detections,
        rawText,
        textWithHighlights,
        summary: {
          totalDetections: detections.length,
          byType
        },
        processingTimeMs
      };

      // Log PII detection
      await this.privacyLogger.logPIIDetected(
        cvId,
        Object.keys(byType),
        detections.length
      );

      await this.updateStepOutput(cvId, 2, result);
      await this.updateStepStatus(cvId, 2, 'completed', processingTimeMs);
      await this.db.execute(`UPDATE user_cvs SET current_wizard_step = 2 WHERE id = ?`, [cvId]);

      return result;

    } catch (error) {
      await this.updateStepStatus(cvId, 2, 'failed', Date.now() - startTime,
        error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Step 3: Anonymization Preview
   */
  private async executeStep3(
    cvId: number,
    modifiedDetections?: PIIDetection[]
  ): Promise<Step3AnonymizeResponse> {
    const startTime = Date.now();
    await this.updateStepStatus(cvId, 3, 'processing');

    try {
      let cache = this.stepDataCache.get(cvId);
      let rawText = cache?.rawText;

      // Use modified detections from cache (set by confirmStepAndProceed when Step 2 is confirmed)
      // This includes user edits to replacement text, deletions, and additions
      let detections = cache?.piiDetections || [];

      if (!rawText) {
        const step1Data = await this.getStepOutputFromDB(cvId, 1);
        rawText = step1Data?.extractedText;

        // Rehydrate cache if empty
        if (!cache && rawText) {
          cache = { rawText };
          this.stepDataCache.set(cvId, cache);
        }
      }

      // Try to get PII detections from DB if not in cache (fallback for backwards compatibility)
      if (detections.length === 0) {
        const step2Data = await this.getStepOutputFromDB(cvId, 2);
        detections = step2Data?.detections || [];
        if (cache) {
          cache.piiDetections = detections;
        }
      }

      if (!rawText) {
        throw new CVProcessingError('No text available for anonymization', 'NO_TEXT', cvId);
      }

      // If modifiedDetections are explicitly passed (legacy support), use those instead
      if (modifiedDetections && modifiedDetections.length > 0) {
        detections = modifiedDetections;
      }

      // Sort detections by position (descending for replacement)
      const sortedDetections = [...detections]
        .filter(d => d.userApproved !== false)
        .sort((a, b) => b.startPosition - a.startPosition);

      // Create anonymized text
      let anonymizedText = rawText;
      const replacements: Array<{
        original: string;
        replacement: string;
        type: string;
        position: { start: number; end: number };
      }> = [];

      for (const detection of sortedDetections) {
        const replacement = detection.replacementText || this.getReplacementText(detection.type);
        replacements.push({
          original: detection.text,
          replacement,
          type: detection.type,
          position: { start: detection.startPosition, end: detection.endPosition }
        });
        anonymizedText =
          anonymizedText.substring(0, detection.startPosition) +
          replacement +
          anonymizedText.substring(detection.endPosition);
      }

      // Create comparison view (line by line)
      const originalLines = rawText.split('\n');
      const anonymizedLines = anonymizedText.split('\n');
      const diffPositions: number[] = [];

      for (let i = 0; i < Math.max(originalLines.length, anonymizedLines.length); i++) {
        if (originalLines[i] !== anonymizedLines[i]) {
          diffPositions.push(i);
        }
      }

      const processingTimeMs = Date.now() - startTime;

      // Store in cache (cache is guaranteed to exist after rehydration above)
      if (cache) {
        cache.anonymizedText = anonymizedText;
        this.stepDataCache.set(cvId, cache);
      }

      const result: Step3AnonymizeResponse = {
        stepNumber: 3,
        stepName: 'anonymize',
        originalText: rawText,
        anonymizedText,
        replacements: replacements.reverse(), // Restore original order
        comparisonView: {
          original: originalLines,
          anonymized: anonymizedLines,
          diffPositions
        },
        processingTimeMs
      };

      // Log anonymization
      await this.privacyLogger.logPIIAnonymized(
        cvId,
        [...new Set(detections.map(d => d.type))],
        detections.length
      );

      await this.updateStepOutput(cvId, 3, result);
      await this.updateStepStatus(cvId, 3, 'completed', processingTimeMs);
      await this.db.execute(`UPDATE user_cvs SET current_wizard_step = 3 WHERE id = ?`, [cvId]);

      return result;

    } catch (error) {
      await this.updateStepStatus(cvId, 3, 'failed', Date.now() - startTime,
        error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Step 4: Structure Parsing
   */
  private async executeStep4(cvId: number): Promise<Step4ParseResponse> {
    const startTime = Date.now();
    await this.updateStepStatus(cvId, 4, 'processing');

    try {
      let cache = this.stepDataCache.get(cvId);
      let anonymizedText = cache?.anonymizedText;

      if (!anonymizedText) {
        const step3Data = await this.getStepOutputFromDB(cvId, 3);
        anonymizedText = step3Data?.anonymizedText;

        // Rehydrate cache if empty
        if (!cache && anonymizedText) {
          cache = { anonymizedText };
          this.stepDataCache.set(cvId, cache);
        }
      }

      if (!anonymizedText) {
        throw new CVProcessingError('No anonymized text available for parsing', 'NO_TEXT', cvId);
      }

      // Parse structure
      const parsed = await this.parseStructure(anonymizedText);

      const processingTimeMs = Date.now() - startTime;

      // Calculate overall confidence
      const allConfidences = [
        ...parsed.experience.map(e => e.confidence),
        ...parsed.education.map(e => e.confidence),
        ...parsed.skills.map(s => s.confidence)
      ];
      const overallConfidence = allConfidences.length > 0
        ? allConfidences.reduce((sum, c) => sum + c, 0) / allConfidences.length
        : 0;

      const itemsNeedingReview = [
        ...parsed.experience.filter(e => e.needsReview),
        ...parsed.education.filter(e => e.needsReview)
      ].length;

      // Store in cache (cache is guaranteed to exist after rehydration above)
      if (cache) {
        cache.parsedData = parsed;
        this.stepDataCache.set(cvId, cache);
      }

      const result: Step4ParseResponse = {
        stepNumber: 4,
        stepName: 'parse',
        experience: parsed.experience,
        education: parsed.education,
        skills: parsed.skills,
        overallConfidence,
        itemsNeedingReview,
        processingTimeMs
      };

      await this.updateStepOutput(cvId, 4, result);
      await this.updateStepStatus(cvId, 4, 'completed', processingTimeMs);
      await this.db.execute(`UPDATE user_cvs SET current_wizard_step = 4 WHERE id = ?`, [cvId]);

      return result;

    } catch (error) {
      await this.updateStepStatus(cvId, 4, 'failed', Date.now() - startTime,
        error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Step 5: Privacy & Employers
   */
  private async executeStep5(cvId: number): Promise<Step5FinalizeResponse> {
    const startTime = Date.now();
    await this.updateStepStatus(cvId, 5, 'processing');

    try {
      let cache = this.stepDataCache.get(cvId);
      let parsedData = cache?.parsedData;

      if (!parsedData) {
        const step4Data = await this.getStepOutputFromDB(cvId, 4);
        parsedData = step4Data;

        // Rehydrate cache if empty
        if (!cache && parsedData) {
          cache = { parsedData };
          this.stepDataCache.set(cvId, cache);
        }
      }

      if (!parsedData) {
        throw new CVProcessingError('No parsed data available for finalization', 'NO_DATA', cvId);
      }

      // Extract employers
      const employers = parsedData.experience
        .map((e: any) => e.organization)
        .filter((org: any) => org && org.length > 0);

      const jobTitles = parsedData.experience.map((e: any) => e.jobTitle);

      // Generalize employers at different privacy levels
      const generalizedLow = generalizeEmployerSequence(employers, jobTitles, 'low');
      const generalizedMedium = generalizeEmployerSequence(employers, jobTitles, 'medium');
      const generalizedHigh = generalizeEmployerSequence(employers, jobTitles, 'high');

      // Create employer info for display
      const employerInfos: GeneralizedEmployerInfo[] = employers.map((emp: string, i: number) => ({
        original: emp,
        generalized: generalizedMedium[i]?.generalized || emp,
        sector: generalizedMedium[i]?.sector || 'Unknown',
        isIdentifying: generalizedMedium[i]?.isIdentifying || false,
        privacyLevel: 'medium' as PrivacyLevel
      }));

      // Assess risk - try to get PII detections from cache or DB
      let piiDetections = cache?.piiDetections || [];
      if (piiDetections.length === 0) {
        const step2Data = await this.getStepOutputFromDB(cvId, 2);
        piiDetections = step2Data?.detections || [];
      }
      const piiByType: Record<string, string[]> = {};
      piiDetections.forEach((d: PIIDetection) => {
        if (!piiByType[d.type]) piiByType[d.type] = [];
        piiByType[d.type].push(d.text);
      });

      const riskAssessment = assessCVRisk(piiByType, employers);

      const processingTimeMs = Date.now() - startTime;

      const result: Step5FinalizeResponse = {
        stepNumber: 5,
        stepName: 'finalize',
        employers: employerInfos,
        riskAssessment: {
          overallRisk: riskAssessment.overallRisk,
          riskScore: riskAssessment.riskScore,
          recommendation: riskAssessment.recommendation
        },
        privacyOptions: {
          currentLevel: 'medium',
          available: [
            {
              level: 'low',
              label: 'Laag',
              description: 'Exacte werkgeversnamen worden gedeeld',
              employerPreview: generalizedLow.map(g => g.generalized)
            },
            {
              level: 'medium',
              label: 'Medium',
              description: 'Identificerende werkgevers worden gegeneraliseerd naar sector',
              employerPreview: generalizedMedium.map(g => g.generalized)
            },
            {
              level: 'high',
              label: 'Hoog',
              description: 'Alle werkgevers worden gegeneraliseerd',
              employerPreview: generalizedHigh.map(g => g.generalized)
            }
          ]
        },
        processingTimeMs
      };

      // Log employer generalization
      if (employers.length > 0) {
        await this.privacyLogger.logEmployerGeneralized(
          cvId,
          employers,
          generalizedMedium.map((g: any) => g.generalized),
          riskAssessment.riskScore / 100
        );
      }

      await this.updateStepOutput(cvId, 5, result);
      await this.updateStepStatus(cvId, 5, 'completed', processingTimeMs);
      await this.db.execute(`UPDATE user_cvs SET current_wizard_step = 5 WHERE id = ?`, [cvId]);

      return result;

    } catch (error) {
      await this.updateStepStatus(cvId, 5, 'failed', Date.now() - startTime,
        error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Step 6: CNL Taxonomie Classificatie
   */
  private async executeStep6(cvId: number): Promise<Step6ClassifyResponse> {
    const startTime = Date.now();
    await this.updateStepStatus(cvId, 6, 'processing');

    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Step 6: CNL Classification for CV ${cvId}`);
      console.log(`${'='.repeat(60)}\n`);

      // Initialize classification service
      const classificationService = new CNLClassificationService(this.db);

      // Run classification
      const result = await classificationService.classifyCV(cvId, {
        useSemanticMatching: false, // Disable semantic for now, can be enabled later
        useLLMFallback: false
      });

      const processingTimeMs = Date.now() - startTime;

      // Update result with processing time
      const finalResult: Step6ClassifyResponse = {
        ...result,
        processingTimeMs
      };

      await this.updateStepOutput(cvId, 6, finalResult);
      await this.updateStepStatus(cvId, 6, 'completed', processingTimeMs);
      await this.db.execute(`UPDATE user_cvs SET current_wizard_step = 6 WHERE id = ?`, [cvId]);

      console.log(`✅ Step 6 completed: ${result.summary.classified}/${result.summary.total} classified`);

      return finalResult;

    } catch (error) {
      await this.updateStepStatus(cvId, 6, 'failed', Date.now() - startTime,
        error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Store extractions before classification (called after Step 5 confirmation)
   */
  private async storeExtractionsBeforeClassification(cvId: number, privacyLevel: PrivacyLevel): Promise<void> {
    const cache = this.stepDataCache.get(cvId);
    if (!cache?.parsedData) {
      console.warn(`No parsed data in cache for CV ${cvId}`);
      return;
    }

    // Check if extractions already exist
    const [existing] = await this.db.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM cv_extractions WHERE cv_id = ?`,
      [cvId]
    );

    if (existing[0].count > 0) {
      console.log(`Extractions already exist for CV ${cvId}, skipping`);
      return;
    }

    await this.storeExtractions(cvId, cache.parsedData, privacyLevel);
    console.log(`✅ Stored extractions for CV ${cvId} before classification`);
  }

  // ========================================================================
  // HELPER METHODS
  // ========================================================================

  private async createWizardCVRecord(
    fileName: string,
    fileSizeBytes: number,
    mimeType: string,
    sessionId: string
  ): Promise<number> {
    const [result] = await this.db.execute<ResultSetHeader>(
      `INSERT INTO user_cvs (
        session_id, file_name, file_size_kb, mime_type,
        processing_status, wizard_mode, wizard_started_at
      ) VALUES (?, ?, ?, ?, 'processing', TRUE, NOW())`,
      [sessionId, fileName, Math.round(fileSizeBytes / 1024), mimeType]
    );

    return result.insertId;
  }

  private async initializeStepRecords(cvId: number): Promise<void> {
    for (const step of WIZARD_STEPS) {
      await this.db.execute(
        `INSERT INTO cv_processing_steps (cv_id, step_number, step_name, status)
         VALUES (?, ?, ?, 'pending')
         ON DUPLICATE KEY UPDATE status = 'pending'`,
        [cvId, step.stepNumber, step.stepName]
      );
    }
  }

  private async getCurrentStep(cvId: number): Promise<{ stepNumber: number; stepName: WizardStepName } | null> {
    const [rows] = await this.db.execute<RowDataPacket[]>(
      `SELECT current_wizard_step FROM user_cvs WHERE id = ?`,
      [cvId]
    );

    if (rows.length === 0 || !rows[0].current_wizard_step) {
      return null;
    }

    const stepNumber = rows[0].current_wizard_step;
    const stepInfo = WIZARD_STEPS.find(s => s.stepNumber === stepNumber);

    return stepInfo ? { stepNumber, stepName: stepInfo.stepName } : null;
  }

  private async updateStepStatus(
    cvId: number,
    stepNumber: number,
    status: WizardStepStatus,
    durationMs?: number,
    errorMessage?: string
  ): Promise<void> {
    if (status === 'processing') {
      await this.db.execute(
        `UPDATE cv_processing_steps SET status = ?, started_at = NOW() WHERE cv_id = ? AND step_number = ?`,
        [status, cvId, stepNumber]
      );
    } else if (status === 'completed') {
      await this.db.execute(
        `UPDATE cv_processing_steps SET status = ?, completed_at = NOW(), duration_ms = ? WHERE cv_id = ? AND step_number = ?`,
        [status, durationMs || null, cvId, stepNumber]
      );
    } else if (status === 'failed') {
      await this.db.execute(
        `UPDATE cv_processing_steps SET status = ?, error_message = ?, duration_ms = ? WHERE cv_id = ? AND step_number = ?`,
        [status, errorMessage, durationMs || null, cvId, stepNumber]
      );
    } else {
      await this.db.execute(
        `UPDATE cv_processing_steps SET status = ? WHERE cv_id = ? AND step_number = ?`,
        [status, cvId, stepNumber]
      );
    }
  }

  private async updateStepOutput(cvId: number, stepNumber: number, outputData: any): Promise<void> {
    await this.db.execute(
      `UPDATE cv_processing_steps SET output_data = ? WHERE cv_id = ? AND step_number = ?`,
      [JSON.stringify(outputData), cvId, stepNumber]
    );
  }

  private async confirmStep(cvId: number, stepNumber: number, modifications?: any): Promise<void> {
    await this.db.execute(
      `UPDATE cv_processing_steps SET
        status = 'confirmed',
        confirmed_at = NOW(),
        user_confirmed = TRUE,
        user_modifications = ?
       WHERE cv_id = ? AND step_number = ?`,
      [modifications ? JSON.stringify(modifications) : null, cvId, stepNumber]
    );
  }

  private async getStepOutputFromDB(cvId: number, stepNumber: number): Promise<any> {
    const [rows] = await this.db.execute<RowDataPacket[]>(
      `SELECT output_data FROM cv_processing_steps WHERE cv_id = ? AND step_number = ?`,
      [cvId, stepNumber]
    );

    if (rows.length === 0 || !rows[0].output_data) {
      return null;
    }

    return JSON.parse(rows[0].output_data);
  }

  private async getStepData(cvId: number, stepNumber: 1 | 2 | 3 | 4 | 5): Promise<any> {
    return this.getStepOutputFromDB(cvId, stepNumber);
  }

  private async completeWizard(cvId: number, privacyLevel: PrivacyLevel): Promise<void> {
    // Get all cached data
    const cache = this.stepDataCache.get(cvId);

    // Store encrypted original and anonymized text
    if (cache?.rawText && cache?.anonymizedText) {
      const encrypted = this.encrypt(cache.rawText);
      const piiDetections = cache.piiDetections || [];
      const piiTypes = [...new Set(piiDetections.map(d => d.type))];

      await this.db.execute(
        `UPDATE user_cvs SET
          original_text_encrypted = ?,
          anonymized_text = ?,
          pii_detected = ?,
          pii_count = ?,
          processing_status = 'completed',
          processing_completed_at = NOW()
         WHERE id = ?`,
        [
          encrypted,
          cache.anonymizedText,
          JSON.stringify(piiTypes),
          piiDetections.length,
          cvId
        ]
      );
    }

    // Store extractions
    if (cache?.parsedData) {
      await this.storeExtractions(cvId, cache.parsedData, privacyLevel);
    }

    // Assess and store privacy risk
    const piiByType: Record<string, string[]> = {};
    (cache?.piiDetections || []).forEach((d: PIIDetection) => {
      if (!piiByType[d.type]) piiByType[d.type] = [];
      piiByType[d.type].push(d.text);
    });

    const employers = (cache?.parsedData?.experience || [])
      .map((e: any) => e.organization)
      .filter(Boolean);

    const riskAssessment = assessCVRisk(piiByType, employers);

    await this.db.execute(
      `UPDATE user_cvs SET
        privacy_risk_score = ?,
        privacy_risk_level = ?,
        allow_exact_data = ?
       WHERE id = ?`,
      [riskAssessment.riskScore, riskAssessment.overallRisk, privacyLevel === 'low', cvId]
    );

    // Clean up cache
    this.stepDataCache.delete(cvId);

    console.log(`✅ Wizard completed for CV ${cvId} with privacy level: ${privacyLevel}`);
  }

  private async storeExtractions(cvId: number, parsed: any, privacyLevel: PrivacyLevel): Promise<void> {
    const employers = parsed.experience.map((e: any) => e.organization).filter(Boolean);
    const jobTitles = parsed.experience.map((e: any) => e.jobTitle);
    const generalizedEmployers = generalizeEmployerSequence(employers, jobTitles, privacyLevel);

    // Store experience
    for (let i = 0; i < parsed.experience.length; i++) {
      const exp = parsed.experience[i];
      const genEmp = generalizedEmployers[i];

      await this.db.execute(
        `INSERT INTO cv_extractions (
          cv_id, section_type, content,
          original_employer, generalized_employer,
          employer_sector, employer_is_identifying,
          needs_review, confidence_score
        ) VALUES (?, 'experience', ?, ?, ?, ?, ?, ?, ?)`,
        [
          cvId,
          JSON.stringify({
            job_title: exp.jobTitle,
            organization: exp.organization,
            start_date: exp.startDate,
            end_date: exp.endDate,
            duration_years: exp.duration,
            description: exp.description,
            extracted_skills: exp.skills
          }),
          genEmp?.original || null,
          genEmp?.generalized || null,
          genEmp?.sector || null,
          genEmp?.isIdentifying || false,
          exp.needsReview ?? false,
          exp.confidence ?? 0.8
        ]
      );
    }

    // Store education
    for (const edu of parsed.education) {
      await this.db.execute(
        `INSERT INTO cv_extractions (
          cv_id, section_type, content,
          needs_review, confidence_score
        ) VALUES (?, 'education', ?, ?, ?)`,
        [
          cvId,
          JSON.stringify({
            degree: edu.degree,
            institution: edu.institution,
            field_of_study: edu.fieldOfStudy,
            start_year: edu.startYear,
            end_year: edu.year
          }),
          edu.needsReview ?? false,
          edu.confidence ?? 0.8
        ]
      );
    }

    // Store skills
    for (const skill of parsed.skills) {
      await this.db.execute(
        `INSERT INTO cv_extractions (
          cv_id, section_type, content,
          needs_review, confidence_score
        ) VALUES (?, 'skill', ?, ?, ?)`,
        [
          cvId,
          JSON.stringify({ skill_name: skill.skillName }),
          false,
          skill.confidence ?? 0.7
        ]
      );
    }
  }

  private mapEntityType(label: string): PIIDetection['type'] {
    const mapping: Record<string, PIIDetection['type']> = {
      'person': 'name',
      'name': 'name',
      'email': 'email',
      'phone': 'phone',
      'telephone': 'phone',
      'address': 'address',
      'location': 'address',
      'date': 'date',
      'organization': 'organization',
      'company': 'organization',
      'org': 'organization'
    };

    return mapping[label.toLowerCase()] || 'other';
  }

  private getSemanticReplacementText(type: string, text: string, existingDetections: PIIDetection[]): string {
    // Count existing items of same type to create unique labels
    const sameTypeCount = existingDetections.filter(d => d.type === type).length;
    const suffix = sameTypeCount > 0 ? ` ${sameTypeCount + 1}` : '';

    // Generate semantic replacement suggestions based on type and text content
    switch (type) {
      case 'name':
        // Try to detect if it's a first name, last name, or full name
        const nameParts = text.trim().split(/\s+/);
        if (nameParts.length === 1) {
          // Single word - could be first or last name
          const isLikelyLastName = /^[A-Z][a-z]+$/.test(text) && text.length > 6;
          return isLikelyLastName ? `[Achternaam${suffix}]` : `[Voornaam${suffix}]`;
        } else if (nameParts.length === 2) {
          return `[Volledige Naam${suffix}]`;
        }
        return `[Naam${suffix}]`;

      case 'email':
        return `[E-mailadres${suffix}]`;

      case 'phone':
        return `[Telefoonnummer${suffix}]`;

      case 'address':
        // Try to detect address components
        if (/\d{4}\s*[A-Z]{2}/.test(text)) {
          return `[Postcode${suffix}]`;
        } else if (/^\d+/.test(text) || /straat|weg|laan|plein/i.test(text)) {
          return `[Straatnaam${suffix}]`;
        } else if (/^[A-Z][a-z]+$/.test(text) && text.length < 15) {
          return `[Plaatsnaam${suffix}]`;
        }
        return `[Adres${suffix}]`;

      case 'date':
        // Keep dates somewhat meaningful
        if (/^\d{4}$/.test(text)) {
          return `[Jaar${suffix}]`;
        } else if (/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(text)) {
          return `[Datum${suffix}]`;
        } else if (/\d{4}\s*[-–]\s*\d{4}/.test(text) || /\d{4}\s*[-–]\s*(heden|nu|present)/i.test(text)) {
          return `[Periode${suffix}]`;
        }
        return `[Datum${suffix}]`;

      case 'organization':
        // Try to categorize organization type
        const lowerText = text.toLowerCase();
        if (/universiteit|hogeschool|school|college|academy|academie|opleiding/i.test(lowerText)) {
          return `[Onderwijsinstelling${suffix}]`;
        } else if (/gemeente|provincie|rijk|overheid|ministerie/i.test(lowerText)) {
          return `[Overheidsinstantie${suffix}]`;
        } else if (/ziekenhuis|kliniek|huisarts|apotheek|zorg/i.test(lowerText)) {
          return `[Zorginstelling${suffix}]`;
        } else if (/bank|verzeker|financ/i.test(lowerText)) {
          return `[Financiële Instelling${suffix}]`;
        } else if (/transport|vervoer|logistiek|bus|trein|vlieg/i.test(lowerText)) {
          return `[Vervoersbedrijf${suffix}]`;
        } else if (/tech|software|it |ict|digital/i.test(lowerText)) {
          return `[Techbedrijf${suffix}]`;
        } else if (/winkel|retail|supermarkt|horeca|restaurant|café/i.test(lowerText)) {
          return `[Retailbedrijf${suffix}]`;
        }
        return `[Werkgever${suffix}]`;

      default:
        return `[Verwijderd${suffix}]`;
    }
  }

  // Legacy method for backwards compatibility
  private getReplacementText(type: string): string {
    const replacements: Record<string, string> = {
      'name': '[Naam]',
      'email': '[E-mailadres]',
      'phone': '[Telefoonnummer]',
      'address': '[Adres]',
      'date': '[Datum]',
      'organization': '[Werkgever]',
      'other': '[Verwijderd]'
    };

    return replacements[type] || '[Verwijderd]';
  }

  private createHighlightedText(text: string, detections: PIIDetection[]): string {
    // Sort by position descending
    const sorted = [...detections].sort((a, b) => b.startPosition - a.startPosition);

    let result = text;
    for (const detection of sorted) {
      const before = result.substring(0, detection.startPosition);
      const highlighted = `<mark class="pii-${detection.type}" data-type="${detection.type}">${detection.text}</mark>`;
      const after = result.substring(detection.endPosition);
      result = before + highlighted + after;
    }

    // Escape HTML except our marks
    return result
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/&lt;mark/g, '<mark')
      .replace(/&lt;\/mark&gt;/g, '</mark>');
  }

  private async parseStructure(anonymizedText: string): Promise<{
    experience: ParsedExperience[];
    education: ParsedEducation[];
    skills: ParsedSkill[];
  }> {
    const result = {
      experience: [] as ParsedExperience[],
      education: [] as ParsedEducation[],
      skills: [] as ParsedSkill[]
    };

    // Split into sections
    const sections = this.identifySections(anonymizedText);

    // Parse experience
    if (sections.experience) {
      result.experience = this.parseExperienceSection(sections.experience);
    }

    // Parse education
    if (sections.education) {
      result.education = this.parseEducationSection(sections.education);
    }

    // Parse skills
    result.skills = this.extractSkills(anonymizedText, sections.skills);

    return result;
  }

  private identifySections(text: string): { experience?: string; education?: string; skills?: string } {
    const sections: any = {};
    const experienceHeaders = /(werkervaring|work experience|ervaring|professional experience|employment)/i;
    const educationHeaders = /(opleiding|education|studie|studies|academic)/i;
    const skillHeaders = /(vaardigheden|skills|competenties|competencies)/i;

    const lines = text.split('\n');
    let currentSection: string | null = null;
    let sectionContent: string[] = [];

    for (const line of lines) {
      if (experienceHeaders.test(line)) {
        if (currentSection && sectionContent.length > 0) {
          sections[currentSection] = sectionContent.join('\n');
        }
        currentSection = 'experience';
        sectionContent = [];
      } else if (educationHeaders.test(line)) {
        if (currentSection && sectionContent.length > 0) {
          sections[currentSection] = sectionContent.join('\n');
        }
        currentSection = 'education';
        sectionContent = [];
      } else if (skillHeaders.test(line)) {
        if (currentSection && sectionContent.length > 0) {
          sections[currentSection] = sectionContent.join('\n');
        }
        currentSection = 'skills';
        sectionContent = [];
      } else if (currentSection) {
        sectionContent.push(line);
      }
    }

    if (currentSection && sectionContent.length > 0) {
      sections[currentSection] = sectionContent.join('\n');
    }

    return sections;
  }

  private parseExperienceSection(text: string): ParsedExperience[] {
    const experiences: ParsedExperience[] = [];
    let idCounter = 1;

    // Pattern: Job title bij Organization (year-year)
    const pattern = /([A-Z][^\n]+?)\s+(?:bij|at)\s+([^\n(]+?)\s*\((\d{4})\s*[-–]\s*(\d{4}|heden|present)\)/gi;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      const [_, jobTitle, organization, startYear, endYear] = match;
      const duration = endYear.match(/\d{4}/)
        ? parseInt(endYear) - parseInt(startYear)
        : new Date().getFullYear() - parseInt(startYear);

      experiences.push({
        id: `exp-${idCounter++}`,
        jobTitle: jobTitle.trim(),
        organization: organization.trim(),
        startDate: startYear,
        endDate: endYear === 'heden' || endYear === 'present' ? null : endYear,
        duration,
        description: '',
        skills: [],
        needsReview: false,
        confidence: 0.85
      });
    }

    if (experiences.length > 0) return experiences;

    // Fallback pattern
    const fallbackPattern = /(.+?)\s+(\d{4})\s*[-–]\s*(\d{4}|heden|present)/gi;
    let fallbackMatch;
    while ((fallbackMatch = fallbackPattern.exec(text)) !== null) {
      const [_, title, startYear, endYear] = fallbackMatch;
      const duration = endYear.match(/\d{4}/)
        ? parseInt(endYear) - parseInt(startYear)
        : new Date().getFullYear() - parseInt(startYear);

      experiences.push({
        id: `exp-${idCounter++}`,
        jobTitle: title.trim(),
        startDate: startYear,
        endDate: endYear === 'heden' || endYear === 'present' ? null : endYear,
        duration,
        description: '',
        skills: [],
        needsReview: true,
        confidence: 0.5
      });
    }

    return experiences;
  }

  private parseEducationSection(text: string): ParsedEducation[] {
    const education: ParsedEducation[] = [];
    let idCounter = 1;

    // Pattern: Degree, Institution (year)
    const pattern = /([^\n,]+?),\s*([^\n(]+?)\s*\((\d{4})\)/gi;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      const [_, degree, institution, year] = match;

      education.push({
        id: `edu-${idCounter++}`,
        degree: degree.trim(),
        institution: institution.trim(),
        year,
        fieldOfStudy: '',
        needsReview: false,
        confidence: 0.85
      });
    }

    if (education.length > 0) return education;

    // Fallback
    const fallbackPattern = /(.+?)\s*\((\d{4})\)/gi;
    let fallbackMatch;
    while ((fallbackMatch = fallbackPattern.exec(text)) !== null) {
      const [_, degree, year] = fallbackMatch;
      education.push({
        id: `edu-${idCounter++}`,
        degree: degree.trim(),
        year,
        fieldOfStudy: '',
        needsReview: true,
        confidence: 0.5
      });
    }

    return education;
  }

  private extractSkills(text: string, skillSection?: string): ParsedSkill[] {
    const skillPatterns = [
      /\b(Python|Java|JavaScript|TypeScript|C\#|C\+\+|Ruby|PHP|Go|Rust|Swift|Kotlin)\b/gi,
      /\b(React|Vue|Angular|Node\.js|Express|Django|Flask|Spring|Laravel)\b/gi,
      /\b(SQL|MySQL|PostgreSQL|MongoDB|Redis|Elasticsearch)\b/gi,
      /\b(AWS|Azure|GCP|Docker|Kubernetes|Jenkins|GitLab|GitHub)\b/gi,
      /\b(Agile|Scrum|Kanban|DevOps|CI\/CD|TDD|BDD)\b/gi
    ];

    const skills: Set<string> = new Set();

    for (const pattern of skillPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        skills.add(match[1]);
      }
    }

    if (skillSection) {
      const sectionSkills = skillSection
        .split(/[,;\n•]+/)
        .map(skill => skill.trim())
        .filter(skill => skill.length > 1);
      for (const skill of sectionSkills) {
        skills.add(skill);
      }
    }

    return Array.from(skills).map((skillName, i) => ({
      id: `skill-${i + 1}`,
      skillName,
      confidence: 0.75
    }));
  }

  private encrypt(text: string): Buffer {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return Buffer.from(iv.toString('hex') + ':' + encrypted, 'utf8');
  }
}

export default CVWizardService;
