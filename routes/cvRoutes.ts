/**
 * CV Processing API Routes
 * RESTful endpoints voor CV upload, processing, review, en classificatie
 */

import express from 'express';
import type { Request, Response, Router } from 'express';
import multer from 'multer';
import mysql from 'mysql2/promise';
import axios from 'axios';

type Pool = mysql.Pool;

import CVProcessingService from '../services/cvProcessingService.ts';
import CVWizardService from '../services/cvWizardService.ts';
import PrivacyLogger from '../services/privacyLogger.ts';
import { CNLClassificationService } from '../services/cnlClassificationService.ts';
import { CVToProfileConverter } from '../services/cvToProfileConverter.ts';
import type {
  CVUploadResponse,
  CVStatusResponse,
  CVExtractionResponse,
  PrivacyConsentRequest,
  ErrorResponse,
  WizardStepConfirmRequest,
  PIIDetection,
  PrivacyLevel
} from '../types/cv.ts';

// Multer configuratie voor file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Only PDF and Word documents are allowed.`));
    }
  }
});

export function createCVRoutes(db: Pool): Router {
  const router = express.Router();
  const cvService = new CVProcessingService(db);
  const wizardService = new CVWizardService(db);
  const privacyLogger = new PrivacyLogger(db);

  // ========================================================================
  // POST /api/cv/upload
  // Upload CV en start processing pipeline
  // ========================================================================
  router.post('/upload', upload.single('cv'), async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.body;

      // Validatie
      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded',
          code: 'NO_FILE',
          message: 'Please select a CV file to upload',
          timestamp: new Date()
        } as ErrorResponse);
      }

      if (!sessionId) {
        return res.status(400).json({
          error: 'Session ID required',
          code: 'NO_SESSION',
          message: 'Session ID is required',
          timestamp: new Date()
        } as ErrorResponse);
      }

      console.log(`\n[UPLOAD] CV Upload Request:`);
      console.log(`  File: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`);
      console.log(`  Type: ${req.file.mimetype}`);
      console.log(`  Session: ${sessionId}`);

      // Start processing (async)
      const cvId = await cvService.enqueueProcessCV(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        sessionId
      );

      const response: CVUploadResponse = {
        success: true,
        cvId,
        message: 'CV uploaded and processing started',
        processingStatus: 'processing'
      };

      res.status(202).json(response);

    } catch (error) {
      console.error('[ERROR] CV upload error:', error);

      res.status(500).json({
        error: 'Upload failed',
        code: 'UPLOAD_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date()
      } as ErrorResponse);
    }
  });

  // ========================================================================
  // GET /api/cv/:cvId/status
  // Get CV processing status (voor polling tijdens processing)
  // ========================================================================
  router.get('/:cvId/status', async (req: Request, res: Response) => {
    try {
      const cvId = parseInt(req.params.cvId);

      if (isNaN(cvId)) {
        return res.status(400).json({
          error: 'Invalid CV ID',
          code: 'INVALID_ID',
          message: 'CV ID must be a number',
          timestamp: new Date()
        } as ErrorResponse);
      }

      const [rows] = await db.execute<any[]>(
        `SELECT
          id,
          processing_status,
          processing_started_at,
          processing_completed_at,
          processing_duration_ms,
          error_message,
          retry_count
        FROM user_cvs
        WHERE id = ? AND deleted_at IS NULL`,
        [cvId]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          error: 'CV not found',
          code: 'NOT_FOUND',
          message: `CV with ID ${cvId} not found`,
          timestamp: new Date()
        } as ErrorResponse);
      }

      const cv = rows[0];

      // Calculate progress (rough estimate)
      let progress = 0;
      if (cv.processing_status === 'completed') {
        progress = 100;
      } else if (cv.processing_status === 'processing') {
        // Estimate based on elapsed time (assume 20 sec average)
        const elapsed = Date.now() - new Date(cv.processing_started_at).getTime();
        progress = Math.min(Math.round((elapsed / 20000) * 100), 95);
      }

      // Parse error code from error message if present
      let errorCode: string | undefined;
      if (cv.error_message) {
        // Check for known error codes in the message
        if (cv.error_message.includes('GLiNER') || cv.error_message.includes('GLINER')) {
          errorCode = 'GLINER_SERVICE_UNAVAILABLE';
        } else if (cv.error_message.includes('Max retries')) {
          errorCode = 'MAX_RETRIES_EXCEEDED';
        } else if (cv.error_message.includes('extract')) {
          errorCode = 'TEXT_EXTRACTION_FAILED';
        } else if (cv.error_message.includes('empty') || cv.error_message.includes('Empty')) {
          errorCode = 'EMPTY_DOCUMENT';
        }
      }

      const response: CVStatusResponse & { errorCode?: string; retryCount?: number } = {
        cvId: cv.id,
        status: cv.processing_status,
        progress,
        currentStep: cv.processing_status === 'processing' ? 'Analyzing CV...' : undefined,
        error: cv.error_message,
        errorCode,
        retryCount: cv.retry_count || 0
      };

      res.json(response);

    } catch (error) {
      console.error('Status check error:', error);
      res.status(500).json({
        error: 'Status check failed',
        code: 'STATUS_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      } as ErrorResponse);
    }
  });

  // ========================================================================
  // GET /api/cv/:cvId/extraction
  // Get extraction results voor review scherm
  // ========================================================================
  router.get('/:cvId/extraction', async (req: Request, res: Response) => {
    try {
      const cvId = parseInt(req.params.cvId);

      if (isNaN(cvId)) {
        return res.status(400).json({
          error: 'Invalid CV ID',
          code: 'INVALID_ID',
          message: 'CV ID must be a number',
          timestamp: new Date()
        } as ErrorResponse);
      }

      const extraction = await cvService.getCVExtraction(cvId);

      if (!extraction) {
        return res.status(404).json({
          error: 'CV not found',
          code: 'NOT_FOUND',
          message: `CV with ID ${cvId} not found`,
          timestamp: new Date()
        } as ErrorResponse);
      }

      res.json(extraction);

    } catch (error) {
      console.error('Get extraction error:', error);
      res.status(500).json({
        error: 'Failed to get extraction',
        code: 'EXTRACTION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      } as ErrorResponse);
    }
  });

  // ========================================================================
  // POST /api/cv/:cvId/privacy-consent
  // Save user privacy consent choice
  // ========================================================================
  router.post('/:cvId/privacy-consent', async (req: Request, res: Response) => {
    try {
      const cvId = parseInt(req.params.cvId);
      const {
        consentGiven,
        useExactEmployers,
        consentText
      }: PrivacyConsentRequest = req.body;

      if (isNaN(cvId)) {
        return res.status(400).json({
          error: 'Invalid CV ID',
          code: 'INVALID_ID',
          message: 'CV ID must be a number',
          timestamp: new Date()
        } as ErrorResponse);
      }

      // Get IP en User-Agent voor audit
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      // Log consent
      await privacyLogger.logUserConsent(
        cvId,
        consentGiven,
        consentText,
        useExactEmployers,
        ipAddress,
        userAgent
      );

      // Update CV record
      await db.execute(
        `UPDATE user_cvs SET allow_exact_data = ? WHERE id = ?`,
        [useExactEmployers, cvId]
      );

      // If user opted in voor exact data, log dat ook
      if (useExactEmployers) {
        // Get original employers
        const [extRows] = await db.execute<any[]>(
          `SELECT original_employer FROM cv_extractions
           WHERE cv_id = ? AND original_employer IS NOT NULL`,
          [cvId]
        );

        const employers = extRows.map(r => r.original_employer);
        await privacyLogger.logExactDataShared(cvId, employers);
      }

      res.json({
        success: true,
        message: 'Privacy consent saved',
        allowedActions: useExactEmployers
          ? ['classify_with_exact_data', 'view_original_employers']
          : ['classify_with_generalized_data']
      });

    } catch (error) {
      console.error('Privacy consent error:', error);
      res.status(500).json({
        error: 'Failed to save consent',
        code: 'CONSENT_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      } as ErrorResponse);
    }
  });

  // ========================================================================
  // PATCH /api/cv/:cvId/extraction/:extractionId
  // Update extraction (user corrections)
  // ========================================================================
  router.patch('/:cvId/extraction/:extractionId', async (req: Request, res: Response) => {
    try {
      const cvId = parseInt(req.params.cvId);
      const extractionId = parseInt(req.params.extractionId);
      const { correctedValue, feedbackType, comment } = req.body;

      if (isNaN(cvId) || isNaN(extractionId)) {
        return res.status(400).json({
          error: 'Invalid ID',
          code: 'INVALID_ID',
          message: 'CV ID and Extraction ID must be numbers',
          timestamp: new Date()
        } as ErrorResponse);
      }

      // Get current extraction
      const [rows] = await db.execute<any[]>(
        `SELECT * FROM cv_extractions WHERE id = ? AND cv_id = ?`,
        [extractionId, cvId]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          error: 'Extraction not found',
          code: 'NOT_FOUND',
          message: 'Extraction not found',
          timestamp: new Date()
        } as ErrorResponse);
      }

      const extraction = rows[0];
      const originalContent = JSON.parse(extraction.content);

      // Update extraction
      await db.execute(
        `UPDATE cv_extractions SET
          user_correction = ?,
          user_validated = TRUE,
          updated_at = NOW()
        WHERE id = ?`,
        [JSON.stringify(correctedValue), extractionId]
      );

      // Log feedback
      await db.execute(
        `INSERT INTO cv_extraction_feedback (
          cv_id, extraction_id, feedback_type,
          original_value, corrected_value, user_comment
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          cvId,
          extractionId,
          feedbackType,
          JSON.stringify(originalContent),
          JSON.stringify(correctedValue),
          comment || null
        ]
      );

      res.json({
        success: true,
        message: 'Extraction updated',
        updatedExtraction: { ...extraction, user_correction: correctedValue }
      });

    } catch (error) {
      console.error('Update extraction error:', error);
      res.status(500).json({
        error: 'Update failed',
        code: 'UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      } as ErrorResponse);
    }
  });

  // ========================================================================
  // GET /api/cv/:cvId/privacy-audit
  // Get volledig privacy audit trail (voor transparency)
  // ========================================================================
  router.get('/:cvId/privacy-audit', async (req: Request, res: Response) => {
    try {
      const cvId = parseInt(req.params.cvId);

      if (isNaN(cvId)) {
        return res.status(400).json({
          error: 'Invalid CV ID',
          code: 'INVALID_ID',
          message: 'CV ID must be a number',
          timestamp: new Date()
        } as ErrorResponse);
      }

      const auditTrail = await privacyLogger.getAuditTrail(cvId);

      res.json({
        cvId,
        events: auditTrail,
        eventCount: auditTrail.length
      });

    } catch (error) {
      console.error('Privacy audit error:', error);
      res.status(500).json({
        error: 'Audit trail failed',
        code: 'AUDIT_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      } as ErrorResponse);
    }
  });

  // ========================================================================
  // GET /api/cv/:cvId/gdpr-export
  // GDPR data export (Right to Access)
  // ========================================================================
  router.get('/:cvId/gdpr-export', async (req: Request, res: Response) => {
    try {
      const cvId = parseInt(req.params.cvId);

      if (isNaN(cvId)) {
        return res.status(400).json({
          error: 'Invalid CV ID',
          code: 'INVALID_ID',
          message: 'CV ID must be a number',
          timestamp: new Date()
        } as ErrorResponse);
      }

      // Get request metadata for audit
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      // Generate GDPR export (this also logs the export request)
      const exportData = await privacyLogger.generateGDPRExport(
        cvId,
        ipAddress,
        userAgent
      );

      res.json({
        success: true,
        cvId,
        exportDate: new Date(),
        data: exportData.cv,
        auditTrail: exportData.auditTrail,
        summary: exportData.summary,
        notice: 'This export is provided in compliance with GDPR Article 15 (Right of Access).'
      });

    } catch (error) {
      console.error('GDPR export error:', error);
      res.status(500).json({
        error: 'GDPR export failed',
        code: 'GDPR_EXPORT_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      } as ErrorResponse);
    }
  });

  // ========================================================================
  // DELETE /api/cv/:cvId
  // Delete CV (GDPR compliance)
  // ========================================================================
  router.delete('/:cvId', async (req: Request, res: Response) => {
    try {
      const cvId = parseInt(req.params.cvId);

      if (isNaN(cvId)) {
        return res.status(400).json({
          error: 'Invalid CV ID',
          code: 'INVALID_ID',
          message: 'CV ID must be a number',
          timestamp: new Date()
        } as ErrorResponse);
      }

      // Get request metadata for audit
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      // Soft delete (GDPR compliant)
      await db.execute(
        `UPDATE user_cvs SET
          deleted_at = NOW(),
          original_text_encrypted = NULL,
          anonymized_text = NULL
        WHERE id = ?`,
        [cvId]
      );

      // Log deletion with proper event type
      await privacyLogger.logCVDeleted(
        cvId,
        'User requested CV deletion (GDPR Right to Erasure)',
        ipAddress,
        userAgent
      );

      res.json({
        success: true,
        message: 'CV successfully deleted'
      });

    } catch (error) {
      console.error('Delete CV error:', error);
      res.status(500).json({
        error: 'Deletion failed',
        code: 'DELETE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      } as ErrorResponse);
    }
  });

  // ========================================================================
  // GET /api/cv/health
  // Health check endpoint
  // ========================================================================
  router.get('/health', async (req: Request, res: Response) => {
    try {
      // Check database
      await db.execute('SELECT 1');

      // Check GLiNER service
      const glinerUrl = process.env.GLINER_SERVICE_URL || 'http://localhost:8001';

      let glinerHealthy = false;
      try {
        const response = await axios.get(`${glinerUrl}/health`, { timeout: 5000 });
        glinerHealthy = response.data.status === 'healthy';
      } catch (error) {
        glinerHealthy = false;
      }

      res.json({
        status: glinerHealthy ? 'healthy' : 'degraded',
        services: {
          database: 'healthy',
          gliner: glinerHealthy ? 'healthy' : 'unavailable'
        },
        timestamp: new Date()
      });

    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });
    }
  });

  // ========================================================================
  // WIZARD ROUTES
  // ========================================================================

  // ========================================================================
  // POST /api/cv/wizard/start
  // Start wizard processing for a new CV
  // ========================================================================
  router.post('/wizard/start', upload.single('cv'), async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.body;

      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded',
          code: 'NO_FILE',
          message: 'Please select a CV file to upload',
          timestamp: new Date()
        } as ErrorResponse);
      }

      if (!sessionId) {
        return res.status(400).json({
          error: 'Session ID required',
          code: 'NO_SESSION',
          message: 'Session ID is required',
          timestamp: new Date()
        } as ErrorResponse);
      }

      console.log(`\n[UPLOAD] CV Wizard Start Request:`);
      console.log(`  File: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`);
      console.log(`  Type: ${req.file.mimetype}`);
      console.log(`  Session: ${sessionId}`);

      const { cvId, step1 } = await wizardService.startWizard(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        sessionId
      );

      res.status(201).json({
        success: true,
        cvId,
        message: 'CV wizard started successfully',
        firstStep: step1
      });

    } catch (error) {
      console.error('[ERROR] Wizard start error:', error);
      res.status(500).json({
        error: 'Wizard start failed',
        code: 'WIZARD_START_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date()
      } as ErrorResponse);
    }
  });

  // ========================================================================
  // POST /api/cv/:cvId/step/confirm
  // Confirm current step and proceed to next
  // ========================================================================
  router.post('/:cvId/step/confirm', async (req: Request, res: Response) => {
    try {
      const cvId = parseInt(req.params.cvId);
      const {
        modifications,
        additionalPII,
        detections,
        deletedIds,
        privacyLevel
      }: WizardStepConfirmRequest & {
        additionalPII?: PIIDetection[];
        detections?: PIIDetection[];
        deletedIds?: number[];
        privacyLevel?: PrivacyLevel
      } = req.body;

      if (isNaN(cvId)) {
        return res.status(400).json({
          error: 'Invalid CV ID',
          code: 'INVALID_ID',
          message: 'CV ID must be a number',
          timestamp: new Date()
        } as ErrorResponse);
      }

      console.log(`[OK] Confirming step for CV ${cvId}`);

      const result = await wizardService.confirmStepAndProceed(
        cvId,
        modifications,
        detections || additionalPII, // Use modified detections if provided, else additionalPII for backwards compat
        privacyLevel
      );

      res.json({
        success: true,
        message: result.isComplete ? 'Wizard completed' : 'Step confirmed',
        nextStep: result.nextStep,
        isComplete: result.isComplete,
        completedCvId: result.isComplete ? cvId : undefined
      });

    } catch (error) {
      console.error('Step confirm error:', error);
      res.status(500).json({
        error: 'Step confirmation failed',
        code: 'STEP_CONFIRM_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      } as ErrorResponse);
    }
  });

  // ========================================================================
  // POST /api/cv/:cvId/step/back
  // Go back to previous step
  // ========================================================================
  router.post('/:cvId/step/back', async (req: Request, res: Response) => {
    try {
      const cvId = parseInt(req.params.cvId);

      if (isNaN(cvId)) {
        return res.status(400).json({
          error: 'Invalid CV ID',
          code: 'INVALID_ID',
          message: 'CV ID must be a number',
          timestamp: new Date()
        } as ErrorResponse);
      }

      console.log(`[BACK] Going back to previous step for CV ${cvId}`);

      const result = await wizardService.goToPreviousStep(cvId);

      res.json({
        success: true,
        message: `Returned to step ${result.stepNumber}`,
        step: result.step,
        stepNumber: result.stepNumber
      });

    } catch (error) {
      console.error('Step back error:', error);
      res.status(500).json({
        error: 'Step back failed',
        code: 'STEP_BACK_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      } as ErrorResponse);
    }
  });

  // ========================================================================
  // GET /api/cv/:cvId/wizard/status
  // Get wizard status
  // ========================================================================
  router.get('/:cvId/wizard/status', async (req: Request, res: Response) => {
    try {
      const cvId = parseInt(req.params.cvId);

      if (isNaN(cvId)) {
        return res.status(400).json({
          error: 'Invalid CV ID',
          code: 'INVALID_ID',
          message: 'CV ID must be a number',
          timestamp: new Date()
        } as ErrorResponse);
      }

      const status = await wizardService.getWizardStatus(cvId);
      res.json(status);

    } catch (error) {
      console.error('Wizard status error:', error);
      res.status(500).json({
        error: 'Failed to get wizard status',
        code: 'STATUS_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      } as ErrorResponse);
    }
  });

  // ========================================================================
  // GET /api/cv/:cvId/step/current
  // Get current step data
  // ========================================================================
  router.get('/:cvId/step/current', async (req: Request, res: Response) => {
    try {
      const cvId = parseInt(req.params.cvId);

      if (isNaN(cvId)) {
        return res.status(400).json({
          error: 'Invalid CV ID',
          code: 'INVALID_ID',
          message: 'CV ID must be a number',
          timestamp: new Date()
        } as ErrorResponse);
      }

      const { stepNumber, stepData } = await wizardService.getCurrentStepData(cvId);

      res.json({
        success: true,
        stepNumber,
        stepData
      });

    } catch (error) {
      console.error('Get current step error:', error);
      res.status(500).json({
        error: 'Failed to get current step',
        code: 'GET_STEP_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      } as ErrorResponse);
    }
  });

  // ========================================================================
  // CNL CLASSIFICATION ROUTES
  // ========================================================================

  // ========================================================================
  // GET /api/cv/:cvId/classifications
  // Get classification results for a CV
  // ========================================================================
  router.get('/:cvId/classifications', async (req: Request, res: Response) => {
    try {
      const cvId = parseInt(req.params.cvId);

      if (isNaN(cvId)) {
        return res.status(400).json({
          error: 'Invalid CV ID',
          code: 'INVALID_ID',
          message: 'CV ID must be a number',
          timestamp: new Date()
        } as ErrorResponse);
      }

      const [rows] = await db.execute<any[]>(
        `SELECT
          id,
          section_type,
          content,
          matched_cnl_uri,
          matched_cnl_label,
          confidence_score,
          classification_method,
          alternative_matches,
          classification_confirmed,
          needs_review
        FROM cv_extractions
        WHERE cv_id = ?
        ORDER BY section_type, id`,
        [cvId]
      );

      // Group by section type
      const classifications = {
        experience: [] as any[],
        education: [] as any[],
        skills: [] as any[]
      };

      for (const row of rows) {
        const content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
        const alternatives = row.alternative_matches
          ? (typeof row.alternative_matches === 'string' ? JSON.parse(row.alternative_matches) : row.alternative_matches)
          : [];

        const item = {
          extractionId: row.id,
          content,
          classification: {
            found: !!row.matched_cnl_uri,
            confidence: row.confidence_score || 0,
            method: row.classification_method || 'pending',
            match: row.matched_cnl_uri ? {
              uri: row.matched_cnl_uri,
              prefLabel: row.matched_cnl_label
            } : undefined,
            alternatives,
            needsReview: row.needs_review || false,
            confirmed: row.classification_confirmed || false
          }
        };

        if (row.section_type === 'experience') {
          classifications.experience.push({
            ...item,
            jobTitle: content.job_title || content.jobTitle,
            organization: content.organization
          });
        } else if (row.section_type === 'education') {
          classifications.education.push({
            ...item,
            degree: content.degree,
            institution: content.institution
          });
        } else if (row.section_type === 'skill') {
          classifications.skills.push({
            ...item,
            skillName: content.skill_name || content.skillName
          });
        }
      }

      // Calculate summary
      const total = rows.length;
      const classified = rows.filter(r => r.matched_cnl_uri).length;
      const needsReview = rows.filter(r => r.needs_review).length;
      const confirmed = rows.filter(r => r.classification_confirmed).length;

      res.json({
        cvId,
        classifications,
        summary: {
          total,
          classified,
          needsReview,
          confirmed,
          completionRate: total > 0 ? Math.round((classified / total) * 100) : 0
        }
      });

    } catch (error) {
      console.error('Get classifications error:', error);
      res.status(500).json({
        error: 'Failed to get classifications',
        code: 'GET_CLASSIFICATIONS_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      } as ErrorResponse);
    }
  });

  // ========================================================================
  // PUT /api/cv/extraction/:extractionId/classification
  // Update classification (user selection from alternatives)
  // ========================================================================
  router.put('/extraction/:extractionId/classification', async (req: Request, res: Response) => {
    try {
      const extractionId = parseInt(req.params.extractionId);
      const { uri, label, confirmed } = req.body;

      if (isNaN(extractionId)) {
        return res.status(400).json({
          error: 'Invalid Extraction ID',
          code: 'INVALID_ID',
          message: 'Extraction ID must be a number',
          timestamp: new Date()
        } as ErrorResponse);
      }

      if (!uri || !label) {
        return res.status(400).json({
          error: 'Missing required fields',
          code: 'MISSING_FIELDS',
          message: 'URI and label are required',
          timestamp: new Date()
        } as ErrorResponse);
      }

      const classificationService = new CNLClassificationService(db);
      await classificationService.updateClassification(
        extractionId,
        uri,
        label,
        'manual'
      );

      // If confirmed, also mark as confirmed
      if (confirmed) {
        await db.execute(
          `UPDATE cv_extractions SET classification_confirmed = TRUE WHERE id = ?`,
          [extractionId]
        );
      }

      res.json({
        success: true,
        message: 'Classification updated',
        extractionId,
        classification: { uri, label, method: 'manual', confirmed: !!confirmed }
      });

    } catch (error) {
      console.error('Update classification error:', error);
      res.status(500).json({
        error: 'Update failed',
        code: 'UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      } as ErrorResponse);
    }
  });

  // ========================================================================
  // POST /api/cv/extraction/:extractionId/confirm
  // Confirm a classification without changing it
  // ========================================================================
  router.post('/extraction/:extractionId/confirm', async (req: Request, res: Response) => {
    try {
      const extractionId = parseInt(req.params.extractionId);

      if (isNaN(extractionId)) {
        return res.status(400).json({
          error: 'Invalid Extraction ID',
          code: 'INVALID_ID',
          message: 'Extraction ID must be a number',
          timestamp: new Date()
        } as ErrorResponse);
      }

      await db.execute(
        `UPDATE cv_extractions SET
          classification_confirmed = TRUE,
          needs_review = FALSE,
          updated_at = NOW()
        WHERE id = ?`,
        [extractionId]
      );

      res.json({
        success: true,
        message: 'Classification confirmed',
        extractionId
      });

    } catch (error) {
      console.error('Confirm classification error:', error);
      res.status(500).json({
        error: 'Confirmation failed',
        code: 'CONFIRM_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      } as ErrorResponse);
    }
  });

  // ========================================================================
  // QUICK UPLOAD & MATCH ROUTES
  // ========================================================================

  // ========================================================================
  // POST /api/cv/quick-process
  // Start quick processing (automatic anonymization, classification, matching)
  // ========================================================================
  router.post('/quick-process', async (req: Request, res: Response) => {
    try {
      const {
        cvId,
        consentGiven,
        consentTimestamp,
        options
      } = req.body;

      if (!cvId || isNaN(parseInt(cvId))) {
        return res.status(400).json({
          error: 'Invalid CV ID',
          code: 'INVALID_ID',
          message: 'CV ID is required and must be a number',
          timestamp: new Date()
        } as ErrorResponse);
      }

      if (!consentGiven) {
        return res.status(400).json({
          error: 'Consent required',
          code: 'NO_CONSENT',
          message: 'User consent is required for quick processing',
          timestamp: new Date()
        } as ErrorResponse);
      }

      const cvIdNum = parseInt(cvId);

      // Log consent for audit trail
      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      await privacyLogger.logEvent({
        cvId: cvIdNum,
        eventType: 'user_consent_given',
        consentGiven: true,
        consentText: `Quick process consent given at ${consentTimestamp}. Options: autoAnonymize=${options?.autoAnonymize}, privacyLevel=${options?.privacyLevel}`,
        ipAddress,
        userAgent
      });

      console.log(`\n⚡ Quick Process Request:`);
      console.log(`  CV ID: ${cvIdNum}`);
      console.log(`  Consent: ${consentGiven}`);
      console.log(`  Options:`, options);

      // Start quick processing (async)
      // The processing will update the cv record with progress
      cvService.quickProcess(cvIdNum, options).catch(error => {
        console.error(`Quick process error for CV ${cvIdNum}:`, error);
      });

      res.status(202).json({
        success: true,
        cvId: cvIdNum,
        phase: 'anonymizing',
        progress: 20,
        message: 'Quick processing started'
      });

    } catch (error) {
      console.error('❌ Quick process error:', error);
      res.status(500).json({
        error: 'Quick process failed',
        code: 'QUICK_PROCESS_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: new Date()
      } as ErrorResponse);
    }
  });

  // ========================================================================
  // GET /api/cv/:cvId/quick-status
  // Get quick processing status with animation data
  // ========================================================================
  router.get('/:cvId/quick-status', async (req: Request, res: Response) => {
    try {
      const cvId = parseInt(req.params.cvId);

      if (isNaN(cvId)) {
        return res.status(400).json({
          error: 'Invalid CV ID',
          code: 'INVALID_ID',
          message: 'CV ID must be a number',
          timestamp: new Date()
        } as ErrorResponse);
      }

      // Get CV status - use only existing columns
      const [cvRows] = await db.execute<any[]>(
        `SELECT
          id,
          processing_status,
          processing_started_at,
          pii_detected,
          pii_count,
          error_message
        FROM user_cvs
        WHERE id = ? AND deleted_at IS NULL`,
        [cvId]
      );

      if (cvRows.length === 0) {
        return res.status(404).json({
          error: 'CV not found',
          code: 'NOT_FOUND',
          message: `CV with ID ${cvId} not found`,
          timestamp: new Date()
        } as ErrorResponse);
      }

      const cv = cvRows[0];

      // Check classification progress (classified_at is set when classification attempted)
      const [classificationStats] = await db.execute<any[]>(
        `SELECT
           COUNT(*) as total_count,
           SUM(CASE WHEN classified_at IS NOT NULL THEN 1 ELSE 0 END) as classified_count
         FROM cv_extractions
         WHERE cv_id = ?`,
        [cvId]
      );
      const totalExtractions = classificationStats[0]?.total_count || 0;
      const classifiedCount = classificationStats[0]?.classified_count || 0;

      // Derive phase from processing status and classification progress
      let phase = 'extracting';
      let progress = 30;

      if (cv.processing_status === 'completed') {
        // Check if classification has completed (all items have been attempted)
        if (totalExtractions > 0 && classifiedCount >= totalExtractions) {
          phase = 'complete';
          progress = 100;
        } else if (classifiedCount > 0) {
          // Classification in progress
          phase = 'classifying';
          progress = 85 + Math.floor((classifiedCount / totalExtractions) * 10);
        } else {
          // Still waiting for classification to start
          phase = 'classifying';
          progress = 85;
        }
      } else if (cv.processing_status === 'failed') {
        phase = 'error';
        progress = 0;
      } else if (cv.processing_status === 'processing' && cv.processing_started_at) {
        // Estimate phase based on elapsed time
        const elapsed = Date.now() - new Date(cv.processing_started_at).getTime();
        if (elapsed < 2000) {
          phase = 'anonymizing';
          progress = 25;
        } else if (elapsed < 5000) {
          phase = 'extracting';
          progress = 40;
        } else if (elapsed < 10000) {
          phase = 'categorizing';
          progress = 60;
        } else {
          phase = 'classifying';
          progress = 75;
        }
      }

      // Get anonymization data if available
      let anonymizationData = null;
      if (cv.pii_detected) {
        const piiTypes = typeof cv.pii_detected === 'string'
          ? JSON.parse(cv.pii_detected)
          : cv.pii_detected;

        anonymizationData = {
          detectedPII: piiTypes.map((type: string, idx: number) => ({
            id: String(idx),
            original: `[${type.substring(0, 3)}***]`,
            replacement: `[${type.toUpperCase()}]`,
            type: type.toUpperCase(),
            confidence: 0.9
          })),
          piiCount: cv.pii_count || piiTypes.length,
          piiByType: piiTypes.reduce((acc: any, type: string) => {
            acc[type.toUpperCase()] = (acc[type.toUpperCase()] || 0) + 1;
            return acc;
          }, {}),
          processingTimeMs: 500
        };
      }

      // Get extracted data if processing is complete
      let extractedData = null;
      let aggregatedSkills = null;

      if (cv.processing_status === 'completed') {
        const [extRows] = await db.execute<any[]>(
          `SELECT
            section_type,
            content,
            matched_cnl_uri,
            matched_cnl_label
          FROM cv_extractions
          WHERE cv_id = ?`,
          [cvId]
        );

        const workExperiences: any[] = [];
        const education: any[] = [];
        const directSkills: string[] = [];

        for (const row of extRows) {
          const content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;

          if (row.section_type === 'experience') {
            workExperiences.push({
              id: String(row.id),
              jobTitle: content.job_title || content.jobTitle,
              organization: content.organization,
              extractedSkills: content.extracted_skills || content.extractedSkills || []
            });
            // Add extracted skills from work experience
            (content.extracted_skills || content.extractedSkills || []).forEach((skill: string) => {
              if (!directSkills.includes(skill)) {
                directSkills.push(skill);
              }
            });
          } else if (row.section_type === 'education') {
            education.push({
              id: String(row.id),
              degree: content.degree,
              institution: content.institution,
              year: content.end_year || content.year
            });
          } else if (row.section_type === 'skill') {
            const skillName = content.skill_name || content.skillName;
            if (skillName && !directSkills.includes(skillName)) {
              directSkills.push(skillName);
            }
          }
        }

        extractedData = {
          workExperiences,
          education,
          directSkills,
          classifiedExperiences: [],
          classifiedEducation: [],
          totalItems: extRows.length,
          processingTimeMs: 1000
        };

        // Build aggregated skills
        aggregatedSkills = {
          direct: directSkills.map(skill => ({
            label: skill,
            source: 'cv-direct' as const
          })),
          fromEducation: [],
          fromOccupation: [],
          combined: directSkills,
          totalCount: directSkills.length,
          bySource: {
            direct: directSkills.length,
            education: 0,
            occupation: 0
          }
        };
      }

      res.json({
        cvId,
        phase,
        progress,
        anonymizationData,
        extractedData,
        aggregatedSkills,
        animationData: {
          wordCount: 1200 // Estimate
        },
        startedAt: cv.processing_started_at,
        processingTimeMs: cv.processing_started_at
          ? Date.now() - new Date(cv.processing_started_at).getTime()
          : 0,
        error: cv.error_message
      });

    } catch (error) {
      console.error('Quick status error:', error);
      res.status(500).json({
        error: 'Status check failed',
        code: 'STATUS_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      } as ErrorResponse);
    }
  });

  // ========================================================================
  // GET /api/cv/cnl/search
  // Search CNL concepts for manual selection
  // ========================================================================
  router.get('/cnl/search', async (req: Request, res: Response) => {
    try {
      const { q, type, limit } = req.query;

      if (!q || typeof q !== 'string') {
        return res.status(400).json({
          error: 'Missing search query',
          code: 'MISSING_QUERY',
          message: 'Search query (q) is required',
          timestamp: new Date()
        } as ErrorResponse);
      }

      const conceptType = (type as string) || 'occupation';
      const searchLimit = parseInt(limit as string) || 10;

      const classificationService = new CNLClassificationService(db);
      const results = await classificationService.searchConcepts(
        q,
        conceptType as any,
        searchLimit
      );

      res.json({
        query: q,
        conceptType,
        results,
        count: results.length
      });

    } catch (error) {
      console.error('CNL search error:', error);
      res.status(500).json({
        error: 'Search failed',
        code: 'SEARCH_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      } as ErrorResponse);
    }
  });

  // ========================================================================
  // POST /api/cv/:cvId/match
  // Convert CV to profile and run occupation matching
  // ========================================================================
  router.post('/:cvId/match', async (req: Request, res: Response) => {
    try {
      const cvId = parseInt(req.params.cvId);

      if (isNaN(cvId)) {
        return res.status(400).json({
          error: 'Invalid CV ID',
          code: 'INVALID_CV_ID',
          message: 'CV ID must be a number',
          timestamp: new Date()
        } as ErrorResponse);
      }

      // Options from request body
      const { limit = 20, minScore = 0.1, includeGaps = false } = req.body;

      console.log(`[CV Match] Starting profile matching for CV ${cvId}`);

      // Initialize converter with backend URL for internal API calls
      const backendUrl = `http://localhost:${process.env.PORT || 3001}`;
      const converter = new CVToProfileConverter(db, backendUrl);

      // Convert CV to profile and match against occupations
      const result = await converter.matchProfileToOccupations(cvId, {
        limit,
        minScore,
        includeGaps
      });

      console.log(`[CV Match] Found ${result.matchResults?.matches?.length || 0} occupation matches`);

      res.json({
        success: true,
        cvId,
        profile: {
          occupationHistory: result.profile.occupationHistory,
          education: result.profile.education,
          capabilities: result.profile.capabilities.length,
          knowledge: result.profile.knowledge.length,
          tasks: result.profile.tasks.length,
          meta: result.profile.meta
        },
        matches: result.matchResults?.matches || [],
        matchCount: result.matchResults?.matches?.length || 0,
        timestamp: result.timestamp
      });

    } catch (error) {
      console.error('CV matching error:', error);
      res.status(500).json({
        error: 'Matching failed',
        code: 'MATCHING_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      } as ErrorResponse);
    }
  });

  return router;
}

export default createCVRoutes;
