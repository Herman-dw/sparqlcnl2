/**
 * Risk Assessment Service
 * Evalueer re-identification risico's in CV data
 */

import { assessReIdentificationRisk, EmployerSequence } from './employerGeneralizer.js';

export interface PIIRisk {
  type: string;
  count: number;
  severity: 'low' | 'medium' | 'high';
}

export interface CVRiskAssessment {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number; // 0-100
  piiDetected: PIIRisk[];
  employerRisk: EmployerSequence;
  recommendation: string;
  allowExactDataSharing: boolean;
  requiresUserReview: boolean;
}

/**
 * PII severity mapping
 */
const PII_SEVERITY: Record<string, 'low' | 'medium' | 'high'> = {
  // High severity (direct identifiers)
  'person': 'high',
  'names': 'high',
  'email': 'high',
  'phone': 'high',
  'bsn': 'high',

  // Medium severity
  'address': 'medium',
  'date': 'medium',  // Kan geboortedatum zijn
  'postalcode': 'medium',

  // Low severity
  'organization': 'low',
  'location': 'low',
  'other': 'low'
};

/**
 * Assess volledig CV risico
 *
 * @param piiDetected - Gedetecteerde PII (uit GLiNER)
 * @param employers - Lijst van werkgevers
 * @returns Risico assessment
 */
export function assessCVRisk(
  piiDetected: Record<string, string[]>,
  employers: string[]
): CVRiskAssessment {

  // 1. PII Risk berekenen
  const piiRisks: PIIRisk[] = [];
  let piiRiskScore = 0;

  for (const [type, items] of Object.entries(piiDetected)) {
    if (items && items.length > 0) {
      const severity = PII_SEVERITY[type] || 'low';

      piiRisks.push({
        type,
        count: items.length,
        severity
      });

      // Add to risk score
      switch (severity) {
        case 'high':
          piiRiskScore += items.length * 30;
          break;
        case 'medium':
          piiRiskScore += items.length * 15;
          break;
        case 'low':
          piiRiskScore += items.length * 5;
          break;
      }
    }
  }

  // 2. Employer sequence risk
  const employerRisk = assessReIdentificationRisk(employers);
  const employerRiskScore = employerRisk.riskScore * 40; // Max 40 points

  // 3. Totale risk score (0-100)
  let totalRiskScore = Math.min(piiRiskScore + employerRiskScore, 100);

  // 4. Bepaal overall risk level
  let overallRisk: 'low' | 'medium' | 'high' | 'critical';

  if (totalRiskScore >= 80) {
    overallRisk = 'critical';
  } else if (totalRiskScore >= 60) {
    overallRisk = 'high';
  } else if (totalRiskScore >= 30) {
    overallRisk = 'medium';
  } else {
    overallRisk = 'low';
  }

  // 5. Aanbeveling
  let recommendation: string;
  let allowExactDataSharing: boolean;
  let requiresUserReview: boolean;

  switch (overallRisk) {
    case 'critical':
      recommendation = 'Dit CV bevat zeer identificerende informatie. ' +
        'We adviseren NIET om exacte werkgevers te delen. ' +
        'Alle data wordt automatisch gegeneraliseerd.';
      allowExactDataSharing = false;
      requiresUserReview = true;
      break;

    case 'high':
      recommendation = 'Dit CV bevat identificerende informatie. ' +
        'We raden aan om werkgevers te generaliseren naar sectoren. ' +
        'Je kunt alsnog kiezen voor exacte data met een privacy waarschuwing.';
      allowExactDataSharing = true; // Met expliciete consent
      requiresUserReview = true;
      break;

    case 'medium':
      recommendation = 'Dit CV bevat normale hoeveelheid persoonsgegevens. ' +
        'Standaard generalisatie wordt toegepast voor je privacy.';
      allowExactDataSharing = true;
      requiresUserReview = false;
      break;

    case 'low':
      recommendation = 'Dit CV bevat minimale identificerende informatie. ' +
        'Standaard privacy maatregelen zijn voldoende.';
      allowExactDataSharing = true;
      requiresUserReview = false;
      break;
  }

  return {
    overallRisk,
    riskScore: Math.round(totalRiskScore),
    piiDetected: piiRisks,
    employerRisk,
    recommendation,
    allowExactDataSharing,
    requiresUserReview
  };
}

/**
 * Generate privacy badge tekst voor UI
 */
export function generatePrivacyBadge(assessment: CVRiskAssessment): {
  icon: string;
  text: string;
  color: string;
} {
  switch (assessment.overallRisk) {
    case 'critical':
      return {
        icon: '🔴',
        text: 'Hoog privacy risico',
        color: 'red'
      };
    case 'high':
      return {
        icon: '🟠',
        text: 'Medium privacy risico',
        color: 'orange'
      };
    case 'medium':
      return {
        icon: '🟡',
        text: 'Normaal privacy risico',
        color: 'yellow'
      };
    case 'low':
      return {
        icon: '🟢',
        text: 'Laag privacy risico',
        color: 'green'
      };
  }
}

/**
 * Generate user-facing privacy summary
 */
export function generatePrivacySummary(
  piiDetected: Record<string, string[]>,
  employerRisk: EmployerSequence
): string {
  const piiTypes: string[] = [];

  // Groepeer PII types
  const highSeverity = Object.keys(piiDetected).filter(
    type => PII_SEVERITY[type] === 'high' && piiDetected[type].length > 0
  );

  if (highSeverity.length > 0) {
    piiTypes.push(...highSeverity);
  }

  // Summary
  let summary = '';

  if (piiTypes.length > 0) {
    summary += `We hebben ${piiTypes.length} type(s) persoonsgegevens gevonden en verwijderd: `;
    summary += piiTypes.map(type => {
      const count = piiDetected[type].length;
      return `${count} ${type}${count > 1 ? 's' : ''}`;
    }).join(', ');
    summary += '. ';
  }

  // Employer risk
  if (employerRisk.isIdentifying) {
    summary += `Je werkgever-combinatie kan identificerend zijn (risico: ${Math.round(employerRisk.riskScore * 100)}%). `;
    summary += `We hebben je werkgevers gegeneraliseerd naar sectoren.`;
  } else {
    summary += `Je werkgever-informatie is veilig gegeneraliseerd.`;
  }

  return summary;
}
