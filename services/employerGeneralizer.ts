/**
 * Employer Generalisatie Service
 * Generaliseert werkgevers naar categorieën voor privacy-bescherming
 */

import { EMPLOYER_CATEGORIES, JOB_TITLE_TO_SECTOR, EmployerCategory } from './employerCategories.js';

export type PrivacyLevel = 'low' | 'medium' | 'high';

export interface GeneralizedEmployer {
  original: string;
  generalized: string;
  category: string;
  sector: string;
  isIdentifying: boolean;
  privacyLevel: PrivacyLevel;
}

export interface EmployerSequence {
  employers: string[];
  isIdentifying: boolean;
  riskScore: number; // 0-1
  recommendation: 'safe' | 'generalize' | 'high_risk';
}

/**
 * Generaliseer een werkgever naam naar categorie
 *
 * @param employerName - Originele werkgever naam
 * @param jobTitle - Functietitel (voor sector inference)
 * @param privacyLevel - Gewenst privacy niveau
 * @returns Gegeneraliseerde werkgever info
 */
export function generalizeEmployer(
  employerName: string,
  jobTitle?: string,
  privacyLevel: PrivacyLevel = 'medium'
): GeneralizedEmployer {

  if (!employerName || employerName.trim() === '') {
    return {
      original: '',
      generalized: 'Werkgever',
      category: 'Onbekend',
      sector: 'Diverse',
      isIdentifying: false,
      privacyLevel
    };
  }

  // Zoek matching categorie
  const match = findEmployerCategory(employerName);

  // Bepaal generalisatie niveau obv privacy level
  let generalized: string;

  switch (privacyLevel) {
    case 'low':
      // Lage privacy: return exact (user heeft ingestemd)
      generalized = employerName;
      break;

    case 'medium':
      // Medium privacy: return categorie
      generalized = match.category;
      break;

    case 'high':
      // Hoge privacy: volledig generiek
      if (match.sector && match.sector !== 'Diverse') {
        generalized = `Bedrijf in ${match.sector}`;
      } else if (jobTitle) {
        const sector = inferSectorFromJobTitle(jobTitle);
        generalized = `Bedrijf in ${sector}`;
      } else {
        generalized = 'Werkgever';
      }
      break;

    default:
      generalized = match.category;
  }

  return {
    original: employerName,
    generalized,
    category: match.category,
    sector: match.sector,
    isIdentifying: match.isIdentifying,
    privacyLevel
  };
}

/**
 * Vind matching employer category
 */
function findEmployerCategory(employerName: string): EmployerCategory {
  for (const category of EMPLOYER_CATEGORIES) {
    if (category.pattern.test(employerName)) {
      return category;
    }
  }

  // Fallback (should never reach here due to catch-all pattern)
  return EMPLOYER_CATEGORIES[EMPLOYER_CATEGORIES.length - 1];
}

/**
 * Leid sector af van functietitel
 */
export function inferSectorFromJobTitle(jobTitle: string): string {
  for (const mapping of JOB_TITLE_TO_SECTOR) {
    if (mapping.pattern.test(jobTitle)) {
      return mapping.sector;
    }
  }
  return 'Diverse';
}

/**
 * Assess re-identification risk voor een werkgever sequentie
 *
 * @param employers - Lijst van werkgevers in chronologische volgorde
 * @returns Risk assessment
 */
export function assessReIdentificationRisk(employers: string[]): EmployerSequence {

  if (!employers || employers.length === 0) {
    return {
      employers: [],
      isIdentifying: false,
      riskScore: 0,
      recommendation: 'safe'
    };
  }

  // Tel aantal "famous" (identifying) employers
  let identifyingCount = 0;
  let totalRisk = 0;

  for (const employer of employers) {
    const match = findEmployerCategory(employer);

    if (match.isIdentifying) {
      identifyingCount++;
      totalRisk += 0.4; // Base risk per identifying employer
    } else {
      totalRisk += 0.1; // Base risk per generic employer
    }
  }

  // Sequence length multiplier
  // Langere sequenties zijn meer identificerend
  if (employers.length >= 3) {
    totalRisk *= 1.5;
  }

  // Specifieke high-risk combinaties
  const employerSet = new Set(employers.map(e => e.toLowerCase()));

  // Tech giants combinaties
  const techGiants = ['google', 'microsoft', 'apple', 'meta', 'amazon', 'netflix'];
  const techGiantCount = techGiants.filter(tg =>
    Array.from(employerSet).some(e => e.includes(tg))
  ).length;

  if (techGiantCount >= 2) {
    totalRisk += 0.3; // Extra risk voor multiple tech giants
  }

  // AI companies combinaties
  const aiCompanies = ['openai', 'anthropic', 'deepmind', 'hugging face'];
  const aiCompanyCount = aiCompanies.filter(ai =>
    Array.from(employerSet).some(e => e.includes(ai))
  ).length;

  if (aiCompanyCount >= 1 && techGiantCount >= 1) {
    totalRisk += 0.4; // Zeer specifieke combinatie
  }

  // Normalize risk score (0-1)
  const riskScore = Math.min(totalRisk, 1.0);

  // Bepaal recommendation
  let recommendation: 'safe' | 'generalize' | 'high_risk';
  let isIdentifying: boolean;

  if (riskScore >= 0.7) {
    recommendation = 'high_risk';
    isIdentifying = true;
  } else if (riskScore >= 0.4) {
    recommendation = 'generalize';
    isIdentifying = true;
  } else {
    recommendation = 'safe';
    isIdentifying = false;
  }

  return {
    employers,
    isIdentifying,
    riskScore: Math.round(riskScore * 100) / 100, // Round to 2 decimals
    recommendation
  };
}

/**
 * Generaliseer een volledige werkgever sequentie
 *
 * @param employers - Lijst van werkgevers
 * @param jobTitles - Corresponderende functietitels
 * @param forcePrivacyLevel - Forceer specifiek privacy niveau
 * @returns Gegeneraliseerde werkgevers
 */
export function generalizeEmployerSequence(
  employers: string[],
  jobTitles?: string[],
  forcePrivacyLevel?: PrivacyLevel
): GeneralizedEmployer[] {

  // Assess overall risk
  const riskAssessment = assessReIdentificationRisk(employers);

  // Bepaal privacy level obv risk (tenzij geforceerd)
  let privacyLevel: PrivacyLevel;

  if (forcePrivacyLevel) {
    privacyLevel = forcePrivacyLevel;
  } else {
    switch (riskAssessment.recommendation) {
      case 'high_risk':
        privacyLevel = 'high'; // Meest restrictief
        break;
      case 'generalize':
        privacyLevel = 'medium'; // Standaard generalisatie
        break;
      case 'safe':
        privacyLevel = 'medium'; // Standaard (voorzichtig)
        break;
    }
  }

  // Generaliseer elke werkgever
  return employers.map((employer, index) => {
    const jobTitle = jobTitles && jobTitles[index] ? jobTitles[index] : undefined;
    return generalizeEmployer(employer, jobTitle, privacyLevel);
  });
}

/**
 * Check of een werkgever naam "famous" is (i.e., identificerend)
 */
export function isFamousEmployer(employerName: string): boolean {
  const match = findEmployerCategory(employerName);
  return match.isIdentifying;
}

/**
 * Get sector voor een werkgever
 */
export function getEmployerSector(employerName: string): string {
  const match = findEmployerCategory(employerName);
  return match.sector;
}
