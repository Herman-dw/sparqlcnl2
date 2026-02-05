/**
 * CV Pipeline - Gedeelde verwerkingslogica
 *
 * Deze module bevat alle gedeelde CV-verwerkingsstappen die door zowel
 * de stap-voor-stap wizard als de snelle upload & match flow worden gebruikt.
 *
 * Door deze logica te centraliseren voorkomen we duplicatie en zorgen we
 * ervoor dat beide flows dezelfde kwaliteit resultaten produceren.
 */

import mysql from 'mysql2/promise';
import crypto from 'crypto';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import WordExtractor from 'word-extractor';
import { GoogleGenAI } from '@google/genai';

import {
  generalizeEmployerSequence,
  assessReIdentificationRisk
} from './employerGeneralizer.ts';
import { assessCVRisk } from './riskAssessment.ts';
import {
  getGeminiSingleton,
  generateContentWithRetry as geminiRetry
} from './geminiSingleton.ts';

type Pool = mysql.Pool;

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ParsedExperience {
  id: string;
  jobTitle: string;
  organization?: string;
  startDate?: string;
  endDate?: string | null;
  duration?: number;
  description?: string;
  skills: string[];
  needsReview: boolean;
  confidence: number;
}

export interface ParsedEducation {
  id: string;
  degree: string;
  institution?: string;
  year?: string;
  fieldOfStudy?: string;
  needsReview: boolean;
  confidence: number;
}

export interface ParsedSkill {
  id: string;
  skillName: string;
  category?: string;
  confidence: number;
}

export interface ParsedStructure {
  experience: ParsedExperience[];
  education: ParsedEducation[];
  skills: ParsedSkill[];
}

export type PrivacyLevel = 'low' | 'medium' | 'high';

// ============================================================================
// TEXT EXTRACTION
// ============================================================================

export async function extractText(fileBuffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    const pdfData = await pdfParse(fileBuffer);
    return pdfData.text;
  } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    // .docx (Office Open XML) - use mammoth
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value;
  } else if (mimeType === 'application/msword') {
    // .doc (old binary format) - try mammoth first, fall back to word-extractor
    try {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      if (result.value && result.value.trim().length > 0) {
        return result.value;
      }
    } catch {
      // mammoth can't handle old binary .doc format - this is expected
    }
    // Fall back to word-extractor for old binary .doc files
    console.log('  [extractText] Using word-extractor for binary .doc format');
    const extractor = new WordExtractor();
    const doc = await extractor.extract(fileBuffer);
    const text = doc.getBody();
    if (!text || text.trim().length === 0) {
      throw new Error('Could not extract text from .doc file');
    }
    return text;
  } else {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }
}

// ============================================================================
// STRUCTURE PARSING (Gemini LLM + Regex fallback)
// ============================================================================

export async function parseStructure(anonymizedText: string): Promise<ParsedStructure> {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      const parsed = await parseStructureWithGemini(anonymizedText, apiKey);
      if (parsed) return parsed;
    } catch (error) {
      console.error('Gemini parsing failed, falling back to regex:', error);
    }
  } else {
    console.warn('No Gemini API key found, using regex parsing');
  }

  return parseStructureWithRegex(anonymizedText);
}

async function parseStructureWithGemini(
  anonymizedText: string,
  apiKey: string
): Promise<ParsedStructure | null> {
  // Initialize singleton if needed
  const singleton = getGeminiSingleton();
  if (!singleton.isAvailable()) {
    singleton.initialize(apiKey);
  }

  const prompt = `Analyseer het volgende geanonimiseerde CV en extraheer de structuur.
Let op: persoonlijke gegevens zijn al vervangen door placeholders zoals [Naam], [Werkgever], [Adres] etc.

CV TEKST:
${anonymizedText}

Geef je antwoord ALLEEN als valid JSON in exact dit formaat (geen markdown, geen uitleg):
{
  "experience": [
    {
      "jobTitle": "functietitel",
      "organization": "organisatie naam of [Werkgever] placeholder",
      "startDate": "YYYY",
      "endDate": "YYYY of null als huidig",
      "description": "korte beschrijving van taken/verantwoordelijkheden",
      "skills": ["skill1", "skill2"]
    }
  ],
  "education": [
    {
      "degree": "diploma/opleiding naam",
      "institution": "instelling naam of [Onderwijsinstelling] placeholder",
      "year": "YYYY",
      "fieldOfStudy": "studierichting indien bekend"
    }
  ],
  "skills": [
    {
      "skillName": "vaardigheid naam",
      "category": "technical|soft|language|other"
    }
  ]
}

Belangrijke instructies:
- Behoud de [placeholder] teksten zoals ze zijn - vervang ze NIET
- Geef alleen JSON terug, geen andere tekst
- Als iets niet duidelijk is, laat het veld leeg of gebruik null
- Sorteer ervaring van nieuwste naar oudste
- Wees grondig: extraheer ALLE genoemde ervaringen, opleidingen en vaardigheden
- Elke ervaring MOET een niet-lege jobTitle hebben. Als de titel onduidelijk is, gebruik de beschrijving om een passende titel te bepalen`;

  // Use singleton with automatic retry on 429 errors
  const { text: response, retryCount } = await geminiRetry({
    model: 'gemini-2.0-flash',
    contents: prompt,
    config: { temperature: 0.1, maxOutputTokens: 4000 }
  });

  if (retryCount > 0) {
    console.log(`  [Gemini] CV parsing succeeded after ${retryCount} retries`);
  }

  let jsonStr = response;
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  jsonStr = jsonStr.trim();
  if (jsonStr.startsWith('{') && jsonStr.endsWith('}')) {
    const parsed = JSON.parse(jsonStr);

    // Filter out entries with empty jobTitles (Gemini sometimes returns empty titles)
    const rawExperience = (parsed.experience || []).filter((exp: any) =>
      exp.jobTitle && exp.jobTitle.trim().length > 0
    );
    const experience: ParsedExperience[] = rawExperience.map((exp: any, i: number) => ({
      id: `exp-${i + 1}`,
      jobTitle: exp.jobTitle.trim(),
      organization: exp.organization,
      startDate: exp.startDate,
      endDate: exp.endDate,
      duration: calculateDuration(exp.startDate, exp.endDate),
      description: exp.description || '',
      skills: exp.skills || [],
      needsReview: false,
      confidence: 0.9
    }));

    if (rawExperience.length < (parsed.experience || []).length) {
      const skipped = (parsed.experience || []).length - rawExperience.length;
      console.log(`  [Gemini] Filtered out ${skipped} experience entries with empty jobTitle`);
    }

    // Filter out entries with empty degrees
    const rawEducation = (parsed.education || []).filter((edu: any) =>
      edu.degree && edu.degree.trim().length > 0
    );
    const education: ParsedEducation[] = rawEducation.map((edu: any, i: number) => ({
      id: `edu-${i + 1}`,
      degree: edu.degree.trim(),
      institution: edu.institution,
      year: edu.year,
      fieldOfStudy: edu.fieldOfStudy || '',
      needsReview: false,
      confidence: 0.9
    }));

    const skills: ParsedSkill[] = (parsed.skills || []).map((skill: any, i: number) => ({
      id: `skill-${i + 1}`,
      skillName: typeof skill === 'string' ? skill : skill.skillName,
      category: typeof skill === 'string' ? 'other' : skill.category,
      confidence: 0.85
    }));

    console.log(`  [Gemini] Parsed CV: ${experience.length} experiences, ${education.length} education, ${skills.length} skills`);

    return { experience, education, skills };
  }

  console.warn('  [Gemini] Invalid JSON response, falling back to regex');
  return null;
}

function parseStructureWithRegex(anonymizedText: string): ParsedStructure {
  const sections = identifySections(anonymizedText);

  const experience: ParsedExperience[] = [];
  const education: ParsedEducation[] = [];
  const skills: ParsedSkill[] = [];

  if (sections.experience) {
    experience.push(...parseExperienceSection(sections.experience));
  }

  if (sections.education) {
    education.push(...parseEducationSection(sections.education));
  }

  const extractedSkills = extractSkillsFromText(anonymizedText, sections.skills);
  skills.push(...extractedSkills.map((s, i) => ({
    id: `skill-${i + 1}`,
    skillName: s,
    category: 'other' as const,
    confidence: 0.7
  })));

  return { experience, education, skills };
}

function identifySections(text: string): {
  experience?: string;
  education?: string;
  skills?: string;
} {
  const sections: Record<string, string> = {};

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

function parseExperienceSection(text: string): ParsedExperience[] {
  const experiences: ParsedExperience[] = [];
  let idCounter = 1;

  // Pattern: Functietitel bij Bedrijf (jaar-jaar)
  const pattern = /([A-Z][^\n]+?)\s+(?:bij|at)\s+([^\n(]+?)\s*\((\d{4})\s*[-–]\s*(\d{4}|heden|present)\)/gi;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const [_, jobTitle, organization, startYear, endYear] = match;
    experiences.push({
      id: `exp-${idCounter++}`,
      jobTitle: jobTitle.trim(),
      organization: organization.trim(),
      startDate: startYear,
      endDate: endYear === 'heden' || endYear === 'present' ? null : endYear,
      duration: calculateDuration(startYear, endYear === 'heden' || endYear === 'present' ? null : endYear),
      description: '',
      skills: [],
      needsReview: false,
      confidence: 0.8
    });
  }

  if (experiences.length > 0) return experiences;

  // Fallback: lines with year ranges
  const fallbackPattern = /(.+?)\s+(\d{4})\s*[-–]\s*(\d{4}|heden|present)/gi;
  let fallbackMatch;
  while ((fallbackMatch = fallbackPattern.exec(text)) !== null) {
    const [_, title, startYear, endYear] = fallbackMatch;
    experiences.push({
      id: `exp-${idCounter++}`,
      jobTitle: title.trim(),
      startDate: startYear,
      endDate: endYear === 'heden' || endYear === 'present' ? null : endYear,
      duration: calculateDuration(startYear, endYear === 'heden' || endYear === 'present' ? null : endYear),
      description: '',
      skills: [],
      needsReview: true,
      confidence: 0.4
    });
  }

  return experiences;
}

function parseEducationSection(text: string): ParsedEducation[] {
  const education: ParsedEducation[] = [];
  let idCounter = 1;

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
      confidence: 0.8
    });
  }

  if (education.length > 0) return education;

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
      confidence: 0.4
    });
  }

  return education;
}

function extractSkillsFromText(text: string, skillSection?: string): string[] {
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

  return Array.from(skills);
}

// ============================================================================
// DATABASE STORAGE
// ============================================================================

export async function storeExtractions(
  db: Pool,
  cvId: number,
  parsed: ParsedStructure,
  privacyLevel: PrivacyLevel = 'medium'
): Promise<void> {
  const employers = parsed.experience.map(e => e.organization).filter(Boolean) as string[];
  const jobTitles = parsed.experience.map(e => e.jobTitle);
  const generalizedEmployers = generalizeEmployerSequence(employers, jobTitles, privacyLevel);

  // Store experience
  for (let i = 0; i < parsed.experience.length; i++) {
    const exp = parsed.experience[i];
    const genEmp = generalizedEmployers[i];

    await db.execute(
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
    await db.execute(
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
          end_year: edu.year
        }),
        edu.needsReview ?? false,
        edu.confidence ?? 0.8
      ]
    );
  }

  // Store skills
  for (const skill of parsed.skills) {
    await db.execute(
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

export async function storeCVText(
  db: Pool,
  cvId: number,
  originalText: string,
  anonymizedText: string,
  piiDetected: Record<string, string[]>,
  encryptionKey: string = ENCRYPTION_KEY
): Promise<void> {
  const encrypted = encrypt(originalText, encryptionKey);
  const piiTypes = Object.keys(piiDetected).filter(k => piiDetected[k].length > 0);
  const piiCount = Object.values(piiDetected).reduce((sum, arr) => sum + arr.length, 0);

  await db.execute(
    `UPDATE user_cvs SET
      original_text_encrypted = ?,
      anonymized_text = ?,
      pii_detected = ?,
      pii_count = ?
     WHERE id = ?`,
    [encrypted, anonymizedText, JSON.stringify(piiTypes), piiCount, cvId]
  );
}

export async function updatePrivacyRisk(
  db: Pool,
  cvId: number,
  riskAssessment: { riskScore: number; overallRisk: string },
  privacyLevel: PrivacyLevel = 'medium'
): Promise<void> {
  await db.execute(
    `UPDATE user_cvs SET
      privacy_risk_score = ?,
      privacy_risk_level = ?,
      allow_exact_data = ?
     WHERE id = ?`,
    [riskAssessment.riskScore, riskAssessment.overallRisk, privacyLevel === 'low', cvId]
  );
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function calculateDuration(startDate: string | null, endDate: string | null): number {
  if (!startDate) return 0;
  const start = parseInt(startDate);
  const end = endDate ? parseInt(endDate) : new Date().getFullYear();
  return isNaN(start) || isNaN(end) ? 0 : end - start;
}

export function encrypt(text: string, encryptionKey: string = ENCRYPTION_KEY): Buffer {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(encryptionKey, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return Buffer.from(iv.toString('hex') + ':' + encrypted, 'utf8');
}

export function decrypt(encryptedBuffer: Buffer, encryptionKey: string = ENCRYPTION_KEY): string {
  const encryptedStr = encryptedBuffer.toString('utf8');
  const [ivHex, encrypted] = encryptedStr.split(':');

  const key = crypto.scryptSync(encryptionKey, 'salt', 32);
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
