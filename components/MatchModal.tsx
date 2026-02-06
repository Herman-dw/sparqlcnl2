/**
 * MatchModal Component - v1.0.0
 * Modal voor profiel matching met skill selectie en resultaten weergave
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X, Target, Plus, Trash2, Loader2,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle,
  Briefcase, GraduationCap, Sparkles, ArrowRight,
  Download, RefreshCcw, UserCircle
} from 'lucide-react';
import { 
  MatchProfile, 
  MatchResult, 
  MatchModalView,
  SkillSearchResult 
} from '../types/matching';
import { 
  matchProfile, 
  searchSkills, 
  searchKnowledge 
} from '../services/matchingService';
import SkillSearchInput from './SkillSearchInput';
import { SessionProfile, ProfileSource } from '../types/profile';
import { normalizeLabel } from '../state/profileUtils';
import { QuickExtractedData, AggregatedSkills } from '../types/quickMatch';
import CVDataReviewModal, { CVReviewResult } from './CVDataReviewModal';

type SourceMap = Record<string, { label: string; sources: ProfileSource[] }>;

const mergeSourceEntry = (map: SourceMap, label: string, sources: ProfileSource[]): SourceMap => {
  const key = normalizeLabel(label);
  const existing = map[key];
  const mergedSources = existing ? [...existing.sources] : [];

  sources.forEach((source) => {
    if (!mergedSources.find((s) => s.id === source.id)) {
      mergedSources.push(source);
    }
  });

  return {
    ...map,
    [key]: {
      label,
      sources: mergedSources
    }
  };
};

const buildSourceMap = (profile?: SessionProfile, fallbackSkills: string[] = []): SourceMap => {
  let map: SourceMap = {};
  const addItems = (items?: { label: string; sources?: ProfileSource[] }[]) => {
    (items || []).forEach((item) => {
      if (!item.label) return;
      map = mergeSourceEntry(map, item.label, item.sources || []);
    });
  };

  if (profile) {
    addItems(profile.skills);
    addItems(profile.knowledge);
    addItems(profile.tasks);
    addItems(profile.workConditions);
  }

  if (fallbackSkills.length > 0) {
    const riasecSource: ProfileSource = { id: 'riasec', label: 'RIASEC selectie', type: 'riasec' };
    fallbackSkills.forEach((label) => {
      map = mergeSourceEntry(map, label, [riasecSource]);
    });
  }

  return map;
};

// ============================================================
// PROPS
// ============================================================

interface CVMatchData {
  matches: MatchResult[];
  matchCount?: number;
  profile?: {
    occupationHistory?: { occupationLabel: string }[];
    capabilities?: number;
    knowledge?: number;
    tasks?: number;
  };
  // CV extraction data for "add to profile" feature
  extraction?: QuickExtractedData;
  skillSources?: AggregatedSkills;
}

interface MatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMatchComplete?: (results: MatchResult[]) => void;
  initialSkills?: string[];  // Pre-selected skills (e.g., from RIASEC flow)
  presetProfile?: SessionProfile;
  cvMatchData?: CVMatchData;  // Pre-computed match results from CV
  onAddToProfile?: (extractedData: QuickExtractedData, skillSources: AggregatedSkills) => void;
}

// ============================================================
// SELECTED ITEMS COMPONENT
// ============================================================

interface SelectedItemsProps {
  items: string[];
  onRemove: (item: string) => void;
  color?: 'emerald' | 'teal' | 'amber';
  sourceMap?: SourceMap;
}

const SelectedItems: React.FC<SelectedItemsProps> = ({ items, onRemove, color = 'emerald', sourceMap }) => {
  const colors = {
    emerald: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
    teal: 'bg-teal-100 text-teal-700 hover:bg-teal-200',
    amber: 'bg-amber-100 text-amber-700 hover:bg-amber-200'
  };

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {items.map((item, idx) => (
        <span key={idx} className={`inline-flex flex-col gap-1 px-3 py-1.5 rounded-lg text-sm font-medium ${colors[color]} transition-colors`}>
          <span className="flex items-center gap-1.5">
            {item}
            <button
              onClick={() => onRemove(item)}
              className="hover:opacity-70 transition-opacity"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
          {sourceMap && sourceMap[normalizeLabel(item)]?.sources?.length ? (
            <div className="flex flex-wrap gap-1">
              {sourceMap[normalizeLabel(item)]?.sources.map((source) => (
                <span
                  key={source.id}
                  className="text-[10px] font-semibold bg-white/60 text-slate-600 px-2 py-0.5 rounded-full"
                >
                  {source.label}
                </span>
              ))}
            </div>
          ) : null}
        </span>
      ))}
    </div>
  );
};

// ============================================================
// SCORE BAR COMPONENT
// ============================================================

interface ScoreBarProps {
  score: number;
  label?: string;
  showPercentage?: boolean;
}

const ScoreBar: React.FC<ScoreBarProps> = ({ score, label, showPercentage = true }) => {
  const percentage = Math.round(score * 100);
  const getColor = (pct: number) => {
    if (pct >= 80) return 'bg-emerald-500';
    if (pct >= 60) return 'bg-emerald-500';
    if (pct >= 40) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="flex items-center gap-3">
      {label && <span className="text-xs text-slate-500 w-20">{label}</span>}
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div 
          className={`h-full ${getColor(percentage)} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showPercentage && (
        <span className="text-sm font-bold text-slate-700 w-12 text-right">{percentage}%</span>
      )}
    </div>
  );
};

// ============================================================
// MATCH RESULT CARD COMPONENT
// ============================================================

interface MatchResultCardProps {
  result: MatchResult;
  rank: number;
  expanded: boolean;
  onToggle: () => void;
  profileSources?: SourceMap;
}

const MatchResultCard: React.FC<MatchResultCardProps> = ({ result, rank, expanded, onToggle, profileSources }) => {
  const { occupation, score, breakdown, gaps, matched } = result;
  const hasProfileSources = profileSources && Object.keys(profileSources).length > 0;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden hover:border-emerald-300 transition-colors">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center gap-4 bg-white hover:bg-slate-50 transition-colors"
      >
        <span className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center text-sm font-bold">
          {rank}
        </span>
        <div className="flex-1 text-left">
          <h3 className="font-semibold text-slate-800">{occupation.label}</h3>
          <div className="mt-1">
            <ScoreBar score={score} showPercentage />
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-slate-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400" />
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 space-y-4">
          {/* Breakdown */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Score Breakdown</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-24">Vaardigheden</span>
                <div className="flex-1">
                  <ScoreBar score={breakdown.skills.score} showPercentage={false} />
                </div>
                <span className="text-xs text-slate-600 w-20 text-right">
                  {breakdown.skills.matchedCount}/{breakdown.skills.totalCount} Ã— {breakdown.skills.weight}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-24">Kennisgebieden</span>
                <div className="flex-1">
                  <ScoreBar score={breakdown.knowledge.score} showPercentage={false} />
                </div>
                <span className="text-xs text-slate-600 w-20 text-right">
                  {breakdown.knowledge.matchedCount}/{breakdown.knowledge.totalCount} Ã— {breakdown.knowledge.weight}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-24">Taken</span>
                <div className="flex-1">
                  <ScoreBar score={breakdown.tasks.score} showPercentage={false} />
                </div>
                <span className="text-xs text-slate-600 w-20 text-right">
                  {breakdown.tasks.matchedCount}/{breakdown.tasks.totalCount} Ã— {breakdown.tasks.weight}
                </span>
              </div>
            </div>
          </div>

          {/* Gaps */}
          {gaps && gaps.skills.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-2">
                Te Ontwikkelen ({gaps.skills.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {gaps.skills.slice(0, 5).map((gap, idx) => (
                  <span 
                    key={idx} 
                    className="text-xs bg-rose-50 text-rose-700 px-2 py-1 rounded"
                    title={`Relevantie: ${gap.relevance}${gap.idf ? `, IDF: ${gap.idf.toFixed(2)}` : ''}`}
                  >
                    {gap.label}
                  </span>
                ))}
                {gaps.skills.length > 5 && (
                  <span className="text-xs text-slate-500 px-2 py-1">
                    +{gaps.skills.length - 5} meer
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Matched */}
          {matched && matched.skills.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">
                Gematcht ({matched.skills.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {matched.skills.slice(0, 5).map((item, idx) => (
                  <span 
                    key={idx} 
                    className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded"
                  >
                    {item.label}
                  </span>
                ))}
                {matched.skills.length > 5 && (
                  <span className="text-xs text-slate-500 px-2 py-1">
                    +{matched.skills.length - 5} meer
                  </span>
                )}
              </div>
            </div>
          )}

          {hasProfileSources && (
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Herkomst profielitems
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {Object.values(profileSources || {}).map((item) => (
                  <span
                    key={item.label}
                    className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded border border-slate-200"
                    title={item.sources.map((s) => s.label).join(', ')}
                  >
                    {item.label}
                    <span className="ml-1 text-[10px] text-slate-500">
                      ({item.sources.map((s) => s.label).join(', ')})
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================
// MAIN MODAL COMPONENT
// ============================================================

const MatchModal: React.FC<MatchModalProps> = ({ isOpen, onClose, onMatchComplete, initialSkills, presetProfile, cvMatchData, onAddToProfile }) => {
  // State
  const [view, setView] = useState<MatchModalView>('builder');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedKnowledge, setSelectedKnowledge] = useState<string[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [selectedWorkConditions, setSelectedWorkConditions] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedResult, setExpandedResult] = useState<number | null>(0);
  const [executionTime, setExecutionTime] = useState<number>(0);
  const [profileSourceMap, setProfileSourceMap] = useState<SourceMap>({});
  const [cvAddedToProfile, setCvAddedToProfile] = useState(false);
  const [showCVReviewModal, setShowCVReviewModal] = useState(false);

  const manualSource: ProfileSource = useMemo(
    () => ({ id: 'manual', label: 'Handmatig toegevoegd', type: 'manual' }),
    []
  );

  const uniqueStrings = useCallback((items: string[]) => {
    return Array.from(new Set(items.filter(Boolean)));
  }, []);

  const selectedProfileSources = useMemo(() => {
    const active = [
      ...selectedSkills,
      ...selectedKnowledge,
      ...selectedTasks,
      ...selectedWorkConditions
    ];
    return active.reduce<SourceMap>((acc, label) => {
      const info = profileSourceMap[normalizeLabel(label)];
      if (info) {
        acc[normalizeLabel(label)] = info;
      }
      return acc;
    }, {});
  }, [profileSourceMap, selectedKnowledge, selectedSkills, selectedTasks]);

  // Reset state when modal opens, and load initial skills if provided
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setCvAddedToProfile(false);
      setShowCVReviewModal(false);

      // If CV match data is provided, show results directly (even if empty)
      if (cvMatchData && cvMatchData.matches) {
        console.log('[MatchModal] Using pre-computed CV match results:', cvMatchData.matches.length, 'matches');
        setResults(cvMatchData.matches);
        setView('results');
        // Clear selections since we're showing pre-computed results
        setSelectedSkills([]);
        setSelectedKnowledge([]);
        setSelectedTasks([]);
        setSelectedWorkConditions([]);
        return;
      }

      // Otherwise, start in builder view
      setView('builder');
      const initialSourceMap = buildSourceMap(presetProfile, initialSkills || []);
      setProfileSourceMap(initialSourceMap);

      // Load initial skills if provided (e.g., from RIASEC flow)
      const baseSkills = presetProfile?.skills?.map((item) => item.label) || [];
      const mergedSkills = uniqueStrings([...(initialSkills || []), ...baseSkills]);
      if (mergedSkills.length > 0) {
        setSelectedSkills(mergedSkills);
      } else {
        setSelectedSkills([]);
      }

      const baseKnowledge = presetProfile?.knowledge?.map((item) => item.label) || [];
      setSelectedKnowledge(uniqueStrings(baseKnowledge));

      const baseTasks = presetProfile?.tasks?.map((item) => item.label) || [];
      setSelectedTasks(uniqueStrings(baseTasks));

      const baseWorkConditions = presetProfile?.workConditions?.map((item) => item.label) || [];
      setSelectedWorkConditions(uniqueStrings(baseWorkConditions));
    }
  }, [initialSkills, isOpen, presetProfile, uniqueStrings, cvMatchData]);

  // Handle skill selection
  const handleSelectSkill = useCallback((item: SkillSearchResult) => {
    if (!selectedSkills.includes(item.label)) {
      setSelectedSkills(prev => [...prev, item.label]);
      setProfileSourceMap((current) => mergeSourceEntry(current, item.label, [manualSource]));
    }
  }, [manualSource, selectedSkills]);

  const handleRemoveSkill = useCallback((skill: string) => {
    setSelectedSkills(prev => prev.filter(s => s !== skill));
  }, []);

  // Handle knowledge selection
  const handleSelectKnowledge = useCallback((item: SkillSearchResult) => {
    if (!selectedKnowledge.includes(item.label)) {
      setSelectedKnowledge(prev => [...prev, item.label]);
      setProfileSourceMap((current) => mergeSourceEntry(current, item.label, [manualSource]));
    }
  }, [manualSource, selectedKnowledge]);

  const handleRemoveKnowledge = useCallback((knowledge: string) => {
    setSelectedKnowledge(prev => prev.filter(k => k !== knowledge));
  }, []);

  // Handle tasks selection (pre-filled only)
  const handleRemoveTask = useCallback((task: string) => {
    setSelectedTasks((prev) => prev.filter((t) => t !== task));
  }, []);

  const handleRemoveWorkCondition = useCallback((condition: string) => {
    setSelectedWorkConditions((prev) => prev.filter((c) => c !== condition));
  }, []);

  // Handle matching
  const handleMatch = async () => {
    if (selectedSkills.length === 0 && selectedKnowledge.length === 0) {
      setError('Selecteer minimaal Ã©Ã©n vaardigheid of kennisgebied');
      return;
    }

    setView('loading');
    setIsLoading(true);
    setError(null);

    try {
      const profile: MatchProfile = {
        skills: selectedSkills,
        knowledge: selectedKnowledge,
        tasks: selectedTasks
      };

      const response = await matchProfile(profile, {
        limit: 20,
        minScore: 0.01,
        includeGaps: true,
        includeMatched: true
      });

      if (!response.success) {
        throw new Error(response.error || 'Matching mislukt');
      }

      setResults(response.matches);
      setExecutionTime(response.meta.executionTime);
      setView('results');
      
      if (onMatchComplete) {
        onMatchComplete(response.matches);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onbekende fout');
      setView('error');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle back to builder
  const handleBack = () => {
    setView('builder');
    setError(null);
  };

  // Handle retry
  const handleRetry = () => {
    handleMatch();
  };

  // Handle opening the CV review modal
  const handleAddCVToProfile = useCallback(() => {
    if (cvMatchData?.extraction && cvMatchData?.skillSources) {
      console.log('[MatchModal] Opening CV review modal');
      setShowCVReviewModal(true);
    }
  }, [cvMatchData]);

  // Handle CV review completion
  const handleCVReviewConfirm = useCallback((result: CVReviewResult) => {
    console.log('[MatchModal] CV review confirmed:', result);
    setShowCVReviewModal(false);

    // Store feedback for model improvement
    if (result.feedback && result.feedback.length > 0) {
      const backendUrl = localStorage.getItem('local_backend_url') || 'http://localhost:3001';
      fetch(`${backendUrl}/api/cv/classification-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: result.feedback })
      }).catch(err => {
        console.warn('[MatchModal] Failed to store classification feedback:', err);
      });
    }

    // Build aggregatedSkills-like structure from the review result
    if (onAddToProfile && cvMatchData?.extraction) {
      const skillsBySource = {
        direct: result.selectedSkills.filter(s => s.source === 'CV' || s.source === 'direct'),
        fromEducation: result.selectedSkills.filter(s => s.source.includes('Opleiding') || s.source === 'education'),
        fromOccupation: result.selectedSkills.filter(s => s.source.includes('Beroep') || s.source === 'occupation'),
        combined: result.selectedSkills.map(s => s.label),
        totalCount: result.selectedSkills.length,
        bySource: {
          direct: result.selectedSkills.filter(s => s.source === 'CV' || s.source === 'direct').length,
          education: result.selectedSkills.filter(s => s.source.includes('Opleiding') || s.source === 'education').length,
          occupation: result.selectedSkills.filter(s => s.source.includes('Beroep') || s.source === 'occupation').length
        }
      };

      onAddToProfile(cvMatchData.extraction, skillsBySource as AggregatedSkills);
    }

    setCvAddedToProfile(true);
  }, [cvMatchData, onAddToProfile]);

  // Check if CV data is available to add to profile
  const hasCVDataToAdd = !!(cvMatchData?.extraction && cvMatchData?.skillSources && onAddToProfile);
  const cvSkillCount = cvMatchData?.skillSources?.totalCount || cvMatchData?.skillSources?.combined?.length || 0;
  const cvJobCount = cvMatchData?.extraction?.workExperiences?.length || 0;
  const cvEduCount = cvMatchData?.extraction?.education?.length || 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col m-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-emerald-500 to-green-500">
          <div className="flex items-center gap-3">
            <Target className="w-6 h-6 text-white" />
            <h2 className="text-lg font-bold text-white">
              {view === 'builder' && 'Match Profiel'}
              {view === 'loading' && 'Bezig met matchen...'}
              {view === 'results' && 'Match Resultaten'}
              {view === 'error' && 'Fout'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Builder View */}
          {view === 'builder' && (
            <div className="p-6 space-y-6">
              {/* Info */}
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex gap-3">
                <Sparkles className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-emerald-700">
                  <p className="font-medium">Selecteer je vaardigheden</p>
                  <p className="mt-1 text-emerald-600">
                    We matchen je profiel tegen alle beroepen in de database en tonen welke het beste passen.
                  </p>
                </div>
              </div>

              {/* Skills */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Vaardigheden <span className="text-rose-500">*</span>
                </label>
                <SkillSearchInput
                  placeholder="Zoek een vaardigheid (bijv. Programmeren, Communiceren)..."
                  onSelect={handleSelectSkill}
                  searchFn={searchSkills}
                />
                <SelectedItems
                  items={selectedSkills}
                  onRemove={handleRemoveSkill}
                  sourceMap={profileSourceMap}
                  color="emerald"
                />
                {selectedSkills.length === 0 && (
                  <p className="mt-2 text-xs text-slate-400">
                    Typ minimaal 2 karakters om te zoeken
                  </p>
                )}
              </div>

              {/* Advanced options toggle */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-600 transition-colors"
              >
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Uitgebreide opties (kennisgebieden)
              </button>

              {/* Knowledge (advanced) */}
              {showAdvanced && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Kennisgebieden <span className="text-slate-400">(optioneel)</span>
                  </label>
                  <SkillSearchInput
                    placeholder="Zoek een kennisgebied (bijv. Gezondheidszorg, Informatica)..."
                    onSelect={handleSelectKnowledge}
                    searchFn={searchKnowledge}
                  />
                  <SelectedItems 
                    items={selectedKnowledge} 
                    onRemove={handleRemoveKnowledge}
                    sourceMap={profileSourceMap}
                    color="emerald"
                  />
                </div>
              )}

              {/* Pre-filled tasks */}
              {selectedTasks.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-bold text-slate-700">
                      Taken <span className="text-slate-400">(uit profiel)</span>
                    </label>
                    <span className="text-[11px] text-slate-400 uppercase tracking-widest">
                      {selectedTasks.length} geselecteerd
                    </span>
                  </div>
                  <SelectedItems
                    items={selectedTasks}
                    onRemove={handleRemoveTask}
                    sourceMap={profileSourceMap}
                    color="teal"
                  />
                </div>
              )}

              {/* Pre-filled work conditions */}
              {selectedWorkConditions.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-bold text-slate-700">
                      Werkomstandigheden <span className="text-slate-400">(uit profiel)</span>
                    </label>
                    <span className="text-[11px] text-slate-400 uppercase tracking-widest">
                      {selectedWorkConditions.length} geselecteerd
                    </span>
                  </div>
                  <SelectedItems
                    items={selectedWorkConditions}
                    onRemove={handleRemoveWorkCondition}
                    sourceMap={profileSourceMap}
                    color="amber"
                  />
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
                  <p className="text-sm text-rose-700">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Loading View */}
          {view === 'loading' && (
            <div className="p-12 flex flex-col items-center justify-center text-center">
              <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
              <h3 className="text-lg font-semibold text-slate-700">Bezig met matchen...</h3>
              <p className="mt-2 text-sm text-slate-500">
                Dit kan even duren bij de eerste keer (cache wordt opgebouwd)
              </p>
              <div className="mt-6 flex gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          {/* Results View */}
          {view === 'results' && (
            <div className="p-6 space-y-4">
              {/* Summary */}
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                  <div>
                    <p className="text-sm font-medium text-emerald-700">
                      {results.length} matches gevonden
                    </p>
                    <p className="text-xs text-emerald-600">
                      Berekend in {executionTime}ms
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleBack}
                  className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
                >
                  <RefreshCcw className="w-4 h-4" />
                  Nieuwe match
                </button>
              </div>

              {/* Profile summary - only show if we're not coming from CV upload */}
              {!hasCVDataToAdd && (
                <div className="text-sm text-slate-500 space-y-2">
                  <div className="flex flex-wrap gap-3">
                    <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100 text-xs font-semibold">
                      Vaardigheden: {selectedSkills.length}
                    </span>
                    <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100 text-xs font-semibold">
                      Kennisgebieden: {selectedKnowledge.length}
                    </span>
                    <span className="px-2 py-1 bg-teal-50 text-teal-700 rounded-full border border-teal-100 text-xs font-semibold">
                      Taken: {selectedTasks.length}
                    </span>
                    <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-full border border-amber-100 text-xs font-semibold">
                      Werkomstandigheden: {selectedWorkConditions.length}
                    </span>
                  </div>
                  {Object.keys(selectedProfileSources).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {Object.values(selectedProfileSources).map((item) => (
                        <span
                          key={item.label}
                          className="text-[11px] bg-slate-100 text-slate-700 px-2 py-1 rounded border border-slate-200"
                        >
                          {item.label}
                          <span className="ml-1 text-[10px] text-slate-500">
                            {item.sources.map((s) => s.label).join(', ')}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* CV to Profile Card - shown after CV upload */}
              {hasCVDataToAdd && (
                <div className={`border rounded-xl p-4 transition-all ${
                  cvAddedToProfile
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200'
                }`}>
                  {cvAddedToProfile ? (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-emerald-700">CV gegevens toegevoegd!</p>
                        <p className="text-sm text-emerald-600">
                          {cvSkillCount} vaardigheden zijn aan je profiel toegevoegd.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <UserCircle className="w-6 h-6 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-slate-800 mb-1">
                          CV gegevens toevoegen aan profiel?
                        </h4>
                        <p className="text-sm text-slate-600 mb-3">
                          Voeg de geëxtraheerde gegevens toe aan je profiel voor betere matches in de toekomst.
                        </p>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {cvJobCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                              <Briefcase className="w-3 h-3" />
                              {cvJobCount} beroep{cvJobCount !== 1 ? 'en' : ''}
                            </span>
                          )}
                          {cvEduCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                              <GraduationCap className="w-3 h-3" />
                              {cvEduCount} opleiding{cvEduCount !== 1 ? 'en' : ''}
                            </span>
                          )}
                          {cvSkillCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">
                              <Sparkles className="w-3 h-3" />
                              {cvSkillCount} vaardighe{cvSkillCount !== 1 ? 'den' : 'id'}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={handleAddCVToProfile}
                          className="px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg hover:from-blue-600 hover:to-indigo-600 transition-all shadow hover:shadow-lg flex items-center gap-2"
                        >
                          Toevoegen aan profiel
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Results list */}
              <div className="space-y-3">
                {results.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Target className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p>Geen matches gevonden met de huidige criteria</p>
                    <button
                      onClick={handleBack}
                      className="mt-3 text-emerald-600 hover:text-emerald-700 font-medium"
                    >
                      Probeer andere vaardigheden
                    </button>
                  </div>
                ) : (
                  results.map((result, idx) => (
                    <MatchResultCard
                      key={result.occupation.uri || idx}
                      result={result}
                      rank={idx + 1}
                      expanded={expandedResult === idx}
                      onToggle={() => setExpandedResult(expandedResult === idx ? null : idx)}
                      profileSources={selectedProfileSources}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {/* Error View */}
          {view === 'error' && (
            <div className="p-12 flex flex-col items-center justify-center text-center">
              <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700">Er ging iets mis</h3>
              <p className="mt-2 text-sm text-slate-500 max-w-sm">
                {error || 'Er is een onbekende fout opgetreden. Probeer het opnieuw.'}
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleBack}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Terug
                </button>
                <button
                  onClick={handleRetry}
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2"
                >
                  <RefreshCcw className="w-4 h-4" />
                  Opnieuw proberen
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {view === 'builder' && (
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {selectedSkills.length + selectedKnowledge.length + selectedTasks.length + selectedWorkConditions.length} items geselecteerd
            </p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={handleMatch}
                disabled={selectedSkills.length === 0 && selectedKnowledge.length === 0}
                className="px-6 py-2 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <Target className="w-4 h-4" />
                Matchen
              </button>
            </div>
          </div>
        )}

        {view === 'results' && (
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Sluiten
            </button>
          </div>
        )}
      </div>

      {/* CV Data Review Modal */}
      {cvMatchData?.extraction && cvMatchData?.skillSources && (
        <CVDataReviewModal
          isOpen={showCVReviewModal}
          onClose={() => setShowCVReviewModal(false)}
          extractedData={cvMatchData.extraction}
          skillSources={cvMatchData.skillSources}
          onConfirm={handleCVReviewConfirm}
        />
      )}
    </div>
  );
};

export { MatchResultCard };
export default MatchModal;
