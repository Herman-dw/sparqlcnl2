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

      console.log(`\n📤 CV Upload Request:`);
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
      console.error('❌ CV upload error:', error);

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
          error_message
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

      const response: CVStatusResponse = {
        cvId: cv.id,
        status: cv.processing_status,
        progress,
        currentStep: cv.processing_status === 'processing' ? 'Analyzing CV...' : undefined,
        error: cv.error_message
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

      // Soft delete (GDPR compliant)
      await db.execute(
        `UPDATE user_cvs SET
          deleted_at = NOW(),
          original_text_encrypted = NULL,
          anonymized_text = NULL
        WHERE id = ?`,
        [cvId]
      );

      // Log deletion
      await privacyLogger.logEvent({
        cvId,
        eventType: 'user_consent_declined', // Using as deletion event
        consentText: 'User requested CV deletion (GDPR Right to Erasure)'
      });

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

      console.log(`\n📤 CV Wizard Start Request:`);
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
      console.error('❌ Wizard start error:', error);
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
        privacyLevel
      }: WizardStepConfirmRequest & { additionalPII?: PIIDetection[]; privacyLevel?: PrivacyLevel } = req.body;

      if (isNaN(cvId)) {
        return res.status(400).json({
          error: 'Invalid CV ID',
          code: 'INVALID_ID',
          message: 'CV ID must be a number',
          timestamp: new Date()
        } as ErrorResponse);
      }

      console.log(`✅ Confirming step for CV ${cvId}`);

      const result = await wizardService.confirmStepAndProceed(
        cvId,
        modifications,
        additionalPII,
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

      console.log(`⬅️ Going back to previous step for CV ${cvId}`);

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

  return router;
}

export default createCVRoutes;
