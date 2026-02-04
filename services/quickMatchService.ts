/**
 * Quick Match Service
 * Service voor snelle upload en match flow
 */

import {
  QuickMatchPhase,
  QuickMatchResult,
  QuickStatusResponse,
  AnonymizationData,
  QuickExtractedData,
  AggregatedSkills,
  AnimationData
} from '../types/quickMatch';
import { MatchResult } from '../types/matching';

// Backend URL
const getBackendUrl = () => {
  return localStorage.getItem('local_backend_url') || 'http://localhost:3001';
};

// Delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Progress callback type
type ProgressCallback = (
  phase: QuickMatchPhase,
  progress: number,
  data?: Partial<{
    anonymizationData: AnonymizationData;
    extractedData: QuickExtractedData;
    aggregatedSkills: AggregatedSkills;
    animationData: Partial<AnimationData>;
  }>
) => void;

/**
 * Execute the full quick upload and match flow
 */
export async function executeQuickMatch(
  file: File,
  sessionId: string,
  consentTimestamp: string,
  onProgress: ProgressCallback,
  signal?: AbortSignal
): Promise<QuickMatchResult> {
  const backendUrl = getBackendUrl();
  const startTime = Date.now();
  const phaseTimings: Record<QuickMatchPhase, number> = {} as any;

  let cvId: number | null = null;
  let anonymizationData: AnonymizationData | null = null;
  let extractedData: QuickExtractedData | null = null;
  let aggregatedSkills: AggregatedSkills | null = null;
  let matches: MatchResult[] = [];

  try {
    // =========================================
    // FASE 1: UPLOADEN
    // =========================================
    const uploadStart = Date.now();
    onProgress('uploading', 5, {
      animationData: { fileName: file.name, fileSize: file.size }
    });

    // Upload the file
    const formData = new FormData();
    formData.append('cv', file);  // Backend expects 'cv' field name
    formData.append('sessionId', sessionId);

    const uploadResponse = await fetch(`${backendUrl}/api/cv/upload`, {
      method: 'POST',
      body: formData,
      signal
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.json().catch(() => ({}));
      throw new Error(error.error || 'Upload mislukt');
    }

    const uploadResult = await uploadResponse.json();
    cvId = uploadResult.cvId;

    onProgress('uploading', 15);
    phaseTimings.uploading = Date.now() - uploadStart;

    // =========================================
    // FASE 2-5: QUICK PROCESS (Backend handles all steps)
    // =========================================
    const processStart = Date.now();
    onProgress('anonymizing', 20);

    // Start quick processing
    const processResponse = await fetch(`${backendUrl}/api/cv/quick-process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cvId,
        consentGiven: true,
        consentTimestamp,
        options: {
          autoAnonymize: true,
          piiReplacementFormat: '[TYPE]',
          privacyLevel: 'medium',
          autoClassify: true,
          selectBestMatch: true,
          deriveSkillsFromTaxonomy: true,
          includeEducationSkills: true,
          includeOccupationSkills: true
        }
      }),
      signal
    });

    if (!processResponse.ok) {
      const error = await processResponse.json().catch(() => ({}));
      throw new Error(error.error || 'Verwerking mislukt');
    }

    // Poll for status updates
    let status: QuickStatusResponse;
    let pollCount = 0;
    const maxPolls = 120; // Max 2 minutes

    do {
      if (signal?.aborted) {
        throw new Error('Geannuleerd');
      }

      await delay(500);
      pollCount++;

      const statusResponse = await fetch(`${backendUrl}/api/cv/${cvId}/quick-status`, {
        signal
      });

      if (!statusResponse.ok) {
        const error = await statusResponse.json().catch(() => ({}));
        throw new Error(error.error || 'Status ophalen mislukt');
      }

      status = await statusResponse.json();

      // Update progress based on current phase
      const progressData: any = {};

      if (status.anonymizationData) {
        anonymizationData = status.anonymizationData;
        progressData.anonymizationData = anonymizationData;
        phaseTimings.anonymizing = Date.now() - processStart;
      }

      if (status.extractedData) {
        extractedData = status.extractedData;
        progressData.extractedData = extractedData;
      }

      if (status.aggregatedSkills) {
        aggregatedSkills = status.aggregatedSkills;
        progressData.aggregatedSkills = aggregatedSkills;
      }

      if (status.animationData) {
        progressData.animationData = status.animationData;
      }

      onProgress(status.phase, status.progress, progressData);

      if (status.phase === 'error') {
        throw new Error(status.error || 'Verwerking mislukt');
      }

    } while (
      status.phase !== 'complete' &&
      status.phase !== 'classifying' && // Stop polling when classification is done
      pollCount < maxPolls
    );

    // If we stopped at classifying, wait for it to complete
    if (status.phase === 'classifying') {
      // Wait a bit more for classification to complete
      await delay(1000);

      const finalStatusResponse = await fetch(`${backendUrl}/api/cv/${cvId}/quick-status`, {
        signal
      });

      if (finalStatusResponse.ok) {
        const finalStatus = await finalStatusResponse.json();
        if (finalStatus.aggregatedSkills) {
          aggregatedSkills = finalStatus.aggregatedSkills;
        }
        if (finalStatus.extractedData) {
          extractedData = finalStatus.extractedData;
        }
      }
    }

    phaseTimings.extracting = Date.now() - processStart - (phaseTimings.anonymizing || 0);
    phaseTimings.categorizing = 0;
    phaseTimings.classifying = 0;

    // =========================================
    // FASE 6: MATCHEN
    // =========================================
    const matchStart = Date.now();
    onProgress('matching', 90);

    // Use the new CV match endpoint which handles profile conversion internally
    const matchResponse = await fetch(`${backendUrl}/api/cv/${cvId}/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 20,
        minScore: 0.01,
        includeGaps: true
      }),
      signal
    });

    if (!matchResponse.ok) {
      const error = await matchResponse.json().catch(() => ({}));
      throw new Error(error.message || error.error || 'Matching mislukt');
    }

    const matchResult = await matchResponse.json();
    matches = matchResult.matches || [];

    if (matches.length === 0) {
      // If no matches, show a helpful message instead of throwing
      console.warn('No matches found for CV', cvId);
    }

    phaseTimings.matching = Date.now() - matchStart;

    // Update with top matches for animation
    const topMatches = matches.slice(0, 5).map((m: any) => ({
      label: m.occupation?.label || m.label || 'Onbekend',
      score: Math.round((m.score || 0) * 100)
    }));

    onProgress('matching', 98, {
      animationData: { topMatches }
    });

    await delay(500);
    onProgress('complete', 100);

    // Build aggregated skills from match result profile
    const profileData = matchResult.profile || {};
    aggregatedSkills = {
      direct: [],
      fromEducation: [],
      fromOccupation: (profileData.occupationHistory || []).map((occ: any) => ({
        label: occ.occupationLabel || occ.jobTitle,
        source: 'occupation' as const,
        sourceLabel: occ.occupationLabel
      })),
      combined: [],
      totalCount: (profileData.capabilities || 0) + (profileData.knowledge || 0) + (profileData.tasks || 0),
      bySource: {
        direct: 0,
        education: 0,
        occupation: profileData.occupationHistory?.length || 0
      }
    };

    // =========================================
    // RETURN RESULTS
    // =========================================
    return {
      success: true,
      cvId: cvId!,
      anonymization: anonymizationData || {
        detectedPII: [],
        piiCount: 0,
        piiByType: {} as any,
        processingTimeMs: 0
      },
      extraction: extractedData || {
        workExperiences: [],
        education: [],
        directSkills: [],
        classifiedExperiences: [],
        classifiedEducation: [],
        totalItems: 0,
        processingTimeMs: 0
      },
      skillSources: aggregatedSkills || {
        direct: [],
        fromEducation: [],
        fromOccupation: [],
        combined: [],
        totalCount: 0,
        bySource: { direct: 0, education: 0, occupation: 0 }
      },
      matches,
      matchCount: matches.length,
      totalProcessingTimeMs: Date.now() - startTime,
      phaseTimings
    };

  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }

    console.error('Quick match error:', error);
    throw error;
  }
}

/**
 * Simulated quick match for demo/testing purposes
 * Uses realistic timing and fake data
 */
export async function executeQuickMatchDemo(
  file: File,
  sessionId: string,
  consentTimestamp: string,
  onProgress: ProgressCallback,
  signal?: AbortSignal
): Promise<QuickMatchResult> {
  const startTime = Date.now();

  // Simulate upload phase
  onProgress('uploading', 5, {
    animationData: { fileName: file.name, fileSize: file.size }
  });
  await delay(1500);
  onProgress('uploading', 15);

  if (signal?.aborted) throw new Error('Geannuleerd');

  // Simulate anonymization phase
  onProgress('anonymizing', 20);
  await delay(500);

  const demoAnonymizationData: AnonymizationData = {
    detectedPII: [
      { id: '1', original: 'Jan ***', replacement: '[NAAM]', type: 'NAME', confidence: 0.95 },
      { id: '2', original: 'jan@***.nl', replacement: '[EMAIL]', type: 'EMAIL', confidence: 0.98 },
      { id: '3', original: '06-***', replacement: '[TELEFOON]', type: 'PHONE', confidence: 0.92 },
    ],
    piiCount: 3,
    piiByType: { NAME: 1, EMAIL: 1, PHONE: 1 } as any,
    processingTimeMs: 450
  };

  onProgress('anonymizing', 30, { anonymizationData: demoAnonymizationData });
  await delay(1500);

  if (signal?.aborted) throw new Error('Geannuleerd');

  // Simulate extraction phase
  onProgress('extracting', 35, {
    animationData: { wordCount: 1247 }
  });
  await delay(2000);
  onProgress('extracting', 50);

  if (signal?.aborted) throw new Error('Geannuleerd');

  // Simulate categorization phase
  const demoExtractedData: QuickExtractedData = {
    workExperiences: [
      { id: '1', jobTitle: 'Software Developer', organization: 'Tech Corp', extractedSkills: ['Python', 'JavaScript'] },
      { id: '2', jobTitle: 'Team Lead', organization: 'StartupX', extractedSkills: ['Leadership', 'Agile'] }
    ],
    education: [
      { id: '1', degree: 'HBO Informatica', institution: 'Hogeschool Utrecht', year: '2018' }
    ],
    directSkills: ['Python', 'JavaScript', 'SQL', 'Agile', 'Git'],
    classifiedExperiences: [],
    classifiedEducation: [],
    totalItems: 8,
    processingTimeMs: 1200
  };

  onProgress('categorizing', 55, { extractedData: demoExtractedData });
  await delay(2000);
  onProgress('categorizing', 70);

  if (signal?.aborted) throw new Error('Geannuleerd');

  // Simulate classification phase
  const demoAggregatedSkills: AggregatedSkills = {
    direct: [
      { label: 'Python', source: 'cv-direct' },
      { label: 'JavaScript', source: 'cv-direct' },
      { label: 'SQL', source: 'cv-direct' },
      { label: 'Agile', source: 'cv-direct' },
      { label: 'Git', source: 'cv-direct' }
    ],
    fromEducation: [
      { label: 'Databases', source: 'education', sourceLabel: 'HBO Informatica' },
      { label: 'Algoritmen', source: 'education', sourceLabel: 'HBO Informatica' },
      { label: 'Netwerken', source: 'education', sourceLabel: 'HBO Informatica' }
    ],
    fromOccupation: [
      { label: 'Software testen', source: 'occupation', sourceLabel: 'Software Developer' },
      { label: 'Code review', source: 'occupation', sourceLabel: 'Software Developer' },
      { label: 'Teammanagement', source: 'occupation', sourceLabel: 'Team Lead' }
    ],
    combined: [
      'Python', 'JavaScript', 'SQL', 'Agile', 'Git',
      'Databases', 'Algoritmen', 'Netwerken',
      'Software testen', 'Code review', 'Teammanagement'
    ],
    totalCount: 11,
    bySource: { direct: 5, education: 3, occupation: 3 }
  };

  onProgress('classifying', 75, { aggregatedSkills: demoAggregatedSkills });
  await delay(2500);
  onProgress('classifying', 88);

  if (signal?.aborted) throw new Error('Geannuleerd');

  // Simulate matching phase
  onProgress('matching', 90);
  await delay(1000);

  const demoMatches: MatchResult[] = [
    {
      occupation: { uri: 'occ:1', label: 'Softwareontwikkelaar' },
      score: 0.92,
      breakdown: {
        skills: { score: 0.95, matchedCount: 8, totalCount: 10, weight: 0.5 },
        knowledge: { score: 0.85, matchedCount: 4, totalCount: 5, weight: 0.3 },
        tasks: { score: 0.88, matchedCount: 6, totalCount: 7, weight: 0.2 }
      },
      gaps: { skills: [{ label: 'Cloud Computing', relevance: 'essential' }], knowledge: [], tasks: [] },
      matched: { skills: [{ label: 'Python' }, { label: 'JavaScript' }], knowledge: [], tasks: [] }
    },
    {
      occupation: { uri: 'occ:2', label: 'Full Stack Developer' },
      score: 0.87,
      breakdown: {
        skills: { score: 0.88, matchedCount: 7, totalCount: 10, weight: 0.5 },
        knowledge: { score: 0.82, matchedCount: 4, totalCount: 5, weight: 0.3 },
        tasks: { score: 0.85, matchedCount: 5, totalCount: 7, weight: 0.2 }
      },
      gaps: { skills: [], knowledge: [], tasks: [] },
      matched: { skills: [], knowledge: [], tasks: [] }
    },
    {
      occupation: { uri: 'occ:3', label: 'Technical Lead' },
      score: 0.84,
      breakdown: {
        skills: { score: 0.82, matchedCount: 6, totalCount: 10, weight: 0.5 },
        knowledge: { score: 0.80, matchedCount: 4, totalCount: 5, weight: 0.3 },
        tasks: { score: 0.90, matchedCount: 6, totalCount: 7, weight: 0.2 }
      },
      gaps: { skills: [], knowledge: [], tasks: [] },
      matched: { skills: [], knowledge: [], tasks: [] }
    }
  ];

  const topMatches = demoMatches.slice(0, 5).map(m => ({
    label: m.occupation.label,
    score: Math.round(m.score * 100)
  }));

  onProgress('matching', 98, { animationData: { topMatches } });
  await delay(1000);
  onProgress('complete', 100);

  return {
    success: true,
    cvId: 999,
    anonymization: demoAnonymizationData,
    extraction: demoExtractedData,
    skillSources: demoAggregatedSkills,
    matches: demoMatches,
    matchCount: demoMatches.length,
    totalProcessingTimeMs: Date.now() - startTime,
    phaseTimings: {
      uploading: 1500,
      anonymizing: 2000,
      extracting: 2000,
      categorizing: 2000,
      classifying: 2500,
      matching: 2000
    } as any
  };
}
