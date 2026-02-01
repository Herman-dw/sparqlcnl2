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
import crypto from 'crypto';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

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
  generalizeEmployer,
  generalizeEmployerSequence,
  inferSectorFromJobTitle
} from './employerGeneralizer.ts';
import { assessCVRisk, generatePrivacySummary } from './riskAssessment.ts';

const GLINER_SERVICE_URL = process.env.GLINER_SERVICE_URL || 'http://localhost:8001';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';

export class CVProcessingService {
  private db: Pool;
  private privacyLogger: PrivacyLogger;

  constructor(database: Pool) {
    this.db = database;
    this.privacyLogger = new PrivacyLogger(database);
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
    let cvId: number | null = null;

    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Starting CV Processing Pipeline`);
      console.log(`File: ${fileName} (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
      console.log(`Session: ${sessionId}`);
      console.log(`${'='.repeat(60)}\n`);

      // STAP 1: Create CV record
      cvId = await this.createCVRecord(fileName, fileBuffer.length, mimeType, sessionId);
      console.log(`✓ STAP 1: CV record created (ID: ${cvId})`);

      await this.updateCVStatus(cvId, 'processing');

      // STAP 2: Extract text from PDF/Word
      const startExtract = Date.now();
      const rawText = await this.extractText(fileBuffer, mimeType);
      const extractDuration = Date.now() - startExtract;

      console.log(`✓ STAP 2: Text extracted (${rawText.length} chars, ${extractDuration}ms)`);

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

      console.log(`✓ STAP 3: PII detected (${piiResult.entity_count} items, ${piiDuration}ms)`);
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

      console.log(`✓ STAP 4: Text stored (original encrypted, anonymized plain)`);

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

      console.log(`✓ STAP 5: Structure parsed (${parseDuration}ms)`);
      console.log(`  Experience: ${parsed.experience.length}, Education: ${parsed.education.length}, Skills: ${parsed.skills.length}`);

      // STAP 6: Generalize employers
      const employers = parsed.experience.map(e => e.organization).filter(Boolean) as string[];
      const jobTitles = parsed.experience.map(e => e.jobTitle);

      const generalizedEmployers = generalizeEmployerSequence(
        employers,
        jobTitles,
        'medium' // Default privacy level
      );

      console.log(`✓ STAP 6: Employers generalized`);
      generalizedEmployers.forEach((ge, i) => {
        if (ge.original !== ge.generalized) {
          console.log(`  "${ge.original}" → "${ge.generalized}"`);
        }
      });

      // Log employer generalisatie
      if (employers.length > 0) {
        const riskAssessment = require('./employerGeneralizer').assessReIdentificationRisk(employers);
        await this.privacyLogger.logEmployerGeneralized(
          cvId,
          employers,
          generalizedEmployers.map(ge => ge.generalized),
          riskAssessment.riskScore
        );
      }

      // STAP 7: Assess privacy risk
      const riskAssessment = assessCVRisk(piiResult.pii_detected, employers);

      console.log(`✓ STAP 7: Privacy risk assessed`);
      console.log(`  Overall Risk: ${riskAssessment.overallRisk} (score: ${riskAssessment.riskScore}/100)`);
      console.log(`  Recommendation: ${riskAssessment.recommendation}`);

      // Update CV with risk assessment
      await this.updatePrivacyRisk(cvId, riskAssessment);

      // STAP 8: Store extractions
      await this.storeExtractions(cvId, parsed, generalizedEmployers);

      console.log(`✓ STAP 8: Extractions stored in database`);

      // STAP 9: Complete
      const totalDuration = Date.now() - startExtract;
      await this.updateCVStatus(cvId, 'completed', totalDuration);

      console.log(`\n${'='.repeat(60)}`);
      console.log(`✅ CV Processing Complete`);
      console.log(`Total duration: ${totalDuration}ms`);
      console.log(`${'='.repeat(60)}\n`);

      return cvId;

    } catch (error) {
      console.error(`❌ CV Processing Failed:`, error);

      if (cvId) {
        await this.updateCVStatus(
          cvId,
          'failed',
          undefined,
          error instanceof Error ? error.message : String(error)
        );
      }

      throw error;
    }
  }

  /**
   * Extract text from PDF or Word
   */
  private async extractText(buffer: Buffer, mimeType: string): Promise<string> {
    try {
      if (mimeType === 'application/pdf') {
        const pdfData = await pdfParse(buffer);
        return pdfData.text;
      } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword'
      ) {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
      } else {
        throw new Error(`Unsupported file type: ${mimeType}`);
      }
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
   * Parse CV structure from anonymized text
   * Uses rule-based parsing (kan later uitgebreid met lokaal LLM)
   */
  private async parseStructure(anonymizedText: string): Promise<{
    experience: Array<{
      jobTitle: string;
      organization?: string;
      startDate?: string;
      endDate?: string;
      duration?: number;
      description?: string;
      skills: string[];
    }>;
    education: Array<{
      degree: string;
      institution?: string;
      year?: string;
      fieldOfStudy?: string;
    }>;
    skills: string[];
  }> {
    // Simpele regex-based parsing
    // TODO: Upgrade naar lokaal LLM parsing voor betere kwaliteit

    const result = {
      experience: [] as any[],
      education: [] as any[],
      skills: [] as string[]
    };

    // Split in secties
    const sections = this.identifySections(anonymizedText);

    // Parse experience section
    if (sections.experience) {
      result.experience = this.parseExperienceSection(sections.experience);
    }

    // Parse education section
    if (sections.education) {
      result.education = this.parseEducationSection(sections.education);
    }

    // Parse skills (kan overal in CV staan)
    result.skills = this.extractSkills(anonymizedText);

    return result;
  }

  /**
   * Identify CV sections
   */
  private identifySections(text: string): {
    experience?: string;
    education?: string;
    skills?: string;
  } {
    const sections: any = {};

    // Headers voor werkervaring
    const experienceHeaders = /(werkervaring|work experience|ervaring|professional experience|employment)/i;
    // Headers voor opleiding
    const educationHeaders = /(opleiding|education|studie|studies|academic)/i;
    // Headers voor vaardigheden
    const skillHeaders = /(vaardigheden|skills|competenties|competencies)/i;

    const lines = text.split('\n');

    let currentSection: string | null = null;
    let sectionContent: string[] = [];

    for (const line of lines) {
      // Check for section headers
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

    // Add last section
    if (currentSection && sectionContent.length > 0) {
      sections[currentSection] = sectionContent.join('\n');
    }

    return sections;
  }

  /**
   * Parse experience section
   */
  private parseExperienceSection(text: string): any[] {
    const experiences: any[] = [];

    // Pattern: Functietitel bij Bedrijf (jaar-jaar)
    const pattern = /([A-Z][^\n]+?)\s+(?:bij|at)\s+([^\n(]+?)\s*\((\d{4})\s*[-–]\s*(\d{4}|heden|present)\)/gi;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      const [_, jobTitle, organization, startYear, endYear] = match;

      const duration = endYear.match(/\d{4}/)
        ? parseInt(endYear) - parseInt(startYear)
        : new Date().getFullYear() - parseInt(startYear);

      experiences.push({
        jobTitle: jobTitle.trim(),
        organization: organization.trim(),
        startDate: startYear,
        endDate: endYear === 'heden' || endYear === 'present' ? null : endYear,
        duration,
        description: '',
        skills: []
      });
    }

    return experiences;
  }

  /**
   * Parse education section
   */
  private parseEducationSection(text: string): any[] {
    const education: any[] = [];

    // Pattern: Degree, Institution (jaar)
    const pattern = /([^\n,]+?),\s*([^\n(]+?)\s*\((\d{4})\)/gi;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      const [_, degree, institution, year] = match;

      education.push({
        degree: degree.trim(),
        institution: institution.trim(),
        year: year,
        fieldOfStudy: ''
      });
    }

    return education;
  }

  /**
   * Extract skills from text
   */
  private extractSkills(text: string): string[] {
    // Common technical skills
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

    return Array.from(skills);
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
    // Encrypt original text
    const encrypted = this.encrypt(originalText);

    // Count PII
    const piiTypes = Object.keys(piiDetected).filter(k => piiDetected[k].length > 0);
    const piiCount = Object.values(piiDetected).reduce((sum: number, arr: any) => sum + arr.length, 0);

    await this.db.execute(
      `UPDATE user_cvs SET
        original_text_encrypted = ?,
        anonymized_text = ?,
        pii_detected = ?,
        pii_count = ?
      WHERE id = ?`,
      [
        encrypted,
        anonymizedText,
        JSON.stringify(piiTypes),
        piiCount,
        cvId
      ]
    );
  }

  private async updatePrivacyRisk(cvId: number, riskAssessment: any): Promise<void> {
    await this.db.execute(
      `UPDATE user_cvs SET
        privacy_risk_score = ?,
        privacy_risk_level = ?,
        allow_exact_data = ?
      WHERE id = ?`,
      [
        riskAssessment.riskScore,
        riskAssessment.overallRisk,
        riskAssessment.allowExactDataSharing,
        cvId
      ]
    );
  }

  private async storeExtractions(
    cvId: number,
    parsed: any,
    generalizedEmployers: any[]
  ): Promise<void> {
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
          JSON.stringify(exp),
          genEmp?.original || null,
          genEmp?.generalized || null,
          genEmp?.sector || null,
          genEmp?.isIdentifying || false,
          false, // needs_review
          0.8 // confidence_score (rules-based)
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
        [cvId, JSON.stringify(edu), false, 0.8]
      );
    }

    // Store skills
    for (const skill of parsed.skills) {
      await this.db.execute(
        `INSERT INTO cv_extractions (
          cv_id, section_type, content,
          needs_review, confidence_score
        ) VALUES (?, 'skill', ?, ?, ?)`,
        [cvId, JSON.stringify({ skill_name: skill }), false, 0.7]
      );
    }
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
   * Encryption helpers
   */
  private encrypt(text: string): Buffer {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Prepend IV for decryption
    return Buffer.from(iv.toString('hex') + ':' + encrypted, 'utf8');
  }

  private decrypt(buffer: Buffer): string {
    const text = buffer.toString('utf8');
    const [ivHex, encrypted] = text.split(':');

    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

export default CVProcessingService;
