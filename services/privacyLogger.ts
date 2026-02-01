/**
 * Privacy Logging Service
 * Audit trail voor alle privacy-gerelateerde events
 * GDPR compliance: volledig traceerbaar wat er met PII is gebeurd
 */

import mysql from 'mysql2/promise';
import { PrivacyConsentLog } from '../types/cv.ts';

type Pool = mysql.Pool;
type RowDataPacket = mysql.RowDataPacket;

export interface LogPrivacyEventParams {
  cvId: number;
  eventType: 'pii_detected' | 'pii_anonymized' | 'employer_generalized' |
             'user_consent_given' | 'user_consent_declined' |
             'llm_call_made' | 'exact_data_shared';

  // PII details (optional)
  piiTypes?: string[];
  piiCount?: number;

  // Employer details (optional)
  employersOriginal?: string[];
  employersGeneralized?: string[];
  riskScore?: number;

  // Consent details (optional)
  consentGiven?: boolean;
  consentText?: string;
  exactDataShared?: boolean;

  // LLM tracking (optional)
  llmProvider?: string;
  llmDataSent?: any;
  llmContainedPII?: boolean;

  // Request context
  ipAddress?: string;
  userAgent?: string;
}

export class PrivacyLogger {
  private db: Pool;

  constructor(database: Pool) {
    this.db = database;
  }

  /**
   * Log een privacy event
   */
  async logEvent(params: LogPrivacyEventParams): Promise<number> {
    const {
      cvId,
      eventType,
      piiTypes,
      piiCount = 0,
      employersOriginal,
      employersGeneralized,
      riskScore,
      consentGiven,
      consentText,
      exactDataShared = false,
      llmProvider,
      llmDataSent,
      llmContainedPII = false,
      ipAddress,
      userAgent
    } = params;

    const [result] = await this.db.execute(
      `INSERT INTO privacy_consent_logs (
        cv_id,
        event_type,
        pii_types,
        pii_count,
        employers_original,
        employers_generalized,
        risk_score,
        consent_given,
        consent_text,
        exact_data_shared,
        llm_provider,
        llm_data_sent,
        llm_contained_pii,
        ip_address,
        user_agent,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        cvId,
        eventType,
        piiTypes ? JSON.stringify(piiTypes) : null,
        piiCount,
        employersOriginal ? JSON.stringify(employersOriginal) : null,
        employersGeneralized ? JSON.stringify(employersGeneralized) : null,
        riskScore ?? null,
        consentGiven ?? null,
        consentText ?? null,
        exactDataShared,
        llmProvider ?? null,
        llmDataSent ? JSON.stringify(llmDataSent) : null,
        llmContainedPII,
        ipAddress ?? null,
        userAgent ?? null
      ]
    );

    const insertResult = result as any;
    console.log(`✓ Privacy event logged: ${eventType} for CV ${cvId}`);

    return insertResult.insertId;
  }

  /**
   * Log PII detectie
   */
  async logPIIDetected(
    cvId: number,
    piiTypes: string[],
    piiCount: number
  ): Promise<void> {
    await this.logEvent({
      cvId,
      eventType: 'pii_detected',
      piiTypes,
      piiCount
    });
  }

  /**
   * Log PII anonimisering
   */
  async logPIIAnonymized(
    cvId: number,
    piiTypes: string[],
    piiCount: number
  ): Promise<void> {
    await this.logEvent({
      cvId,
      eventType: 'pii_anonymized',
      piiTypes,
      piiCount
    });
  }

  /**
   * Log employer generalisatie
   */
  async logEmployerGeneralized(
    cvId: number,
    employersOriginal: string[],
    employersGeneralized: string[],
    riskScore: number
  ): Promise<void> {
    await this.logEvent({
      cvId,
      eventType: 'employer_generalized',
      employersOriginal,
      employersGeneralized,
      riskScore
    });
  }

  /**
   * Log user consent
   */
  async logUserConsent(
    cvId: number,
    consentGiven: boolean,
    consentText: string,
    exactDataShared: boolean,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logEvent({
      cvId,
      eventType: consentGiven ? 'user_consent_given' : 'user_consent_declined',
      consentGiven,
      consentText,
      exactDataShared,
      ipAddress,
      userAgent
    });
  }

  /**
   * Log LLM call (KRITIEK voor audit!)
   */
  async logLLMCall(
    cvId: number,
    llmProvider: string,
    dataSent: any,
    containedPII: boolean = false
  ): Promise<void> {
    // WAARSCHUWING als PII werd verzonden (zou NOOIT moeten gebeuren!)
    if (containedPII) {
      console.error(`⚠️⚠️⚠️ WARNING: PII was sent to LLM for CV ${cvId}! This is a security incident!`);

      // Ook loggen in separate error log
      await this.logSecurityIncident(cvId, 'pii_sent_to_llm', {
        llmProvider,
        dataSent
      });
    }

    await this.logEvent({
      cvId,
      eventType: 'llm_call_made',
      llmProvider,
      llmDataSent: dataSent,
      llmContainedPII: containedPII
    });
  }

  /**
   * Log exact data sharing (na user opt-in)
   */
  async logExactDataShared(
    cvId: number,
    employersOriginal: string[]
  ): Promise<void> {
    await this.logEvent({
      cvId,
      eventType: 'exact_data_shared',
      employersOriginal,
      exactDataShared: true
    });
  }

  /**
   * Get privacy audit trail voor een CV
   */
  async getAuditTrail(cvId: number): Promise<PrivacyConsentLog[]> {
    const [rows] = await this.db.execute<RowDataPacket[]>(
      `SELECT
        id,
        cv_id,
        event_type,
        pii_types,
        pii_count,
        employers_original,
        employers_generalized,
        risk_score,
        consent_given,
        consent_text,
        exact_data_shared,
        llm_provider,
        llm_data_sent,
        llm_contained_pii,
        ip_address,
        user_agent,
        created_at
      FROM privacy_consent_logs
      WHERE cv_id = ?
      ORDER BY created_at DESC`,
      [cvId]
    );

    return rows.map(row => ({
      id: row.id,
      cv_id: row.cv_id,
      event_type: row.event_type,
      pii_types: row.pii_types ? JSON.parse(row.pii_types) : null,
      pii_count: row.pii_count,
      employers_original: row.employers_original ? JSON.parse(row.employers_original) : null,
      employers_generalized: row.employers_generalized ? JSON.parse(row.employers_generalized) : null,
      risk_score: row.risk_score,
      consent_given: row.consent_given,
      consent_text: row.consent_text,
      exact_data_shared: row.exact_data_shared,
      llm_provider: row.llm_provider,
      llm_data_sent: row.llm_data_sent ? JSON.parse(row.llm_data_sent) : null,
      llm_contained_pii: row.llm_contained_pii,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      created_at: row.created_at
    }));
  }

  /**
   * Check if PII was ever sent to LLM (security audit)
   */
  async checkPIILeakage(cvId?: number): Promise<Array<{
    cvId: number;
    llmProvider: string;
    timestamp: Date;
    dataSent: any;
  }>> {
    const query = cvId
      ? `SELECT cv_id, llm_provider, llm_data_sent, created_at
         FROM privacy_consent_logs
         WHERE cv_id = ? AND llm_contained_pii = TRUE`
      : `SELECT cv_id, llm_provider, llm_data_sent, created_at
         FROM privacy_consent_logs
         WHERE llm_contained_pii = TRUE`;

    const params = cvId ? [cvId] : [];

    const [rows] = await this.db.execute<RowDataPacket[]>(query, params);

    return rows.map(row => ({
      cvId: row.cv_id,
      llmProvider: row.llm_provider,
      timestamp: row.created_at,
      dataSent: row.llm_data_sent ? JSON.parse(row.llm_data_sent) : null
    }));
  }

  /**
   * Get privacy statistics (voor dashboard)
   */
  async getPrivacyStatistics(days: number = 30): Promise<{
    totalCVsProcessed: number;
    totalPIIDetected: number;
    totalEmployersGeneralized: number;
    consentGivenRate: number;
    exactDataSharedRate: number;
    llmCallsMade: number;
    piiLeakages: number;
  }> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [stats] = await this.db.execute<RowDataPacket[]>(
      `SELECT
        COUNT(DISTINCT cv_id) as total_cvs,
        SUM(CASE WHEN event_type = 'pii_detected' THEN pii_count ELSE 0 END) as total_pii,
        COUNT(CASE WHEN event_type = 'employer_generalized' THEN 1 END) as employers_generalized,
        COUNT(CASE WHEN event_type = 'user_consent_given' THEN 1 END) as consents_given,
        COUNT(CASE WHEN event_type = 'user_consent_declined' THEN 1 END) as consents_declined,
        COUNT(CASE WHEN event_type = 'exact_data_shared' THEN 1 END) as exact_shared,
        COUNT(CASE WHEN event_type = 'llm_call_made' THEN 1 END) as llm_calls,
        COUNT(CASE WHEN llm_contained_pii = TRUE THEN 1 END) as pii_leakages
      FROM privacy_consent_logs
      WHERE created_at >= ?`,
      [since]
    );

    const row = stats[0];

    const totalConsents = row.consents_given + row.consents_declined;
    const consentGivenRate = totalConsents > 0
      ? (row.consents_given / totalConsents) * 100
      : 0;

    const exactDataSharedRate = row.total_cvs > 0
      ? (row.exact_shared / row.total_cvs) * 100
      : 0;

    return {
      totalCVsProcessed: row.total_cvs,
      totalPIIDetected: row.total_pii,
      totalEmployersGeneralized: row.employers_generalized,
      consentGivenRate: Math.round(consentGivenRate * 10) / 10,
      exactDataSharedRate: Math.round(exactDataSharedRate * 10) / 10,
      llmCallsMade: row.llm_calls,
      piiLeakages: row.pii_leakages
    };
  }

  /**
   * Log security incident (PII leak, unauthorized access, etc.)
   */
  private async logSecurityIncident(
    cvId: number,
    incidentType: string,
    details: any
  ): Promise<void> {
    // Log naar apart security incident table (indien gewenst)
    // Of naar error logging systeem

    console.error(`
╔═══════════════════════════════════════════════════════════╗
║  🚨 SECURITY INCIDENT                                      ║
╠═══════════════════════════════════════════════════════════╣
║  Type: ${incidentType}
║  CV ID: ${cvId}
║  Details: ${JSON.stringify(details, null, 2)}
║  Timestamp: ${new Date().toISOString()}
╚═══════════════════════════════════════════════════════════╝
    `);

    // TODO: Send alert email/Slack notification
    // TODO: Write to security.log file
  }

  /**
   * Generate GDPR data export voor gebruiker
   */
  async generateGDPRExport(cvId: number): Promise<{
    cv: any;
    auditTrail: PrivacyConsentLog[];
    summary: string;
  }> {
    // Get CV info
    const [cvRows] = await this.db.execute<RowDataPacket[]>(
      `SELECT * FROM user_cvs WHERE id = ?`,
      [cvId]
    );

    if (cvRows.length === 0) {
      throw new Error(`CV ${cvId} not found`);
    }

    const cv = cvRows[0];

    // Get audit trail
    const auditTrail = await this.getAuditTrail(cvId);

    // Generate summary
    const piiDetectedEvents = auditTrail.filter(e => e.event_type === 'pii_detected');
    const consentEvents = auditTrail.filter(e =>
      e.event_type === 'user_consent_given' || e.event_type === 'user_consent_declined'
    );
    const llmEvents = auditTrail.filter(e => e.event_type === 'llm_call_made');

    const summary = `
GDPR Data Export voor CV ${cvId}
Upload datum: ${cv.upload_date}
Verwerking status: ${cv.processing_status}

Privacy Samenvatting:
- PII gedetecteerd: ${piiDetectedEvents.length > 0 ? piiDetectedEvents[0].pii_count : 0} items
- Consent gegeven: ${consentEvents.some(e => e.consent_given) ? 'Ja' : 'Nee'}
- LLM calls gemaakt: ${llmEvents.length}
- Exact data gedeeld: ${cv.allow_exact_data ? 'Ja' : 'Nee'}

Alle privacy events zijn gedocumenteerd in de audit trail.
    `.trim();

    return {
      cv: {
        id: cv.id,
        fileName: cv.file_name,
        uploadDate: cv.upload_date,
        privacyRiskLevel: cv.privacy_risk_level,
        allowExactData: cv.allow_exact_data
        // Exclude encrypted/sensitive fields
      },
      auditTrail,
      summary
    };
  }
}

export default PrivacyLogger;
