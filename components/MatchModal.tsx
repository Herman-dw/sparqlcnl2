/**
 * MatchModal Component - v1.0.0
 * Modal voor profiel matching met skill selectie en resultaten weergave
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  X, Search, Target, Plus, Trash2, Loader2, 
  ChevronDown, ChevronUp, AlertCircle, CheckCircle,
  Briefcase, GraduationCap, Sparkles, ArrowRight,
  Download, RefreshCcw
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

// ============================================================
// PROPS
// ============================================================

interface MatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMatchComplete?: (results: MatchResult[]) => void;
}

// ============================================================
// SKILL SEARCH INPUT COMPONENT
// ============================================================

interface SkillSearchInputProps {
  placeholder: string;
  onSelect: (item: SkillSearchResult) => void;
  searchFn: (query: string) => Promise<{ success: boolean; results: SkillSearchResult[] }>;
  disabled?: boolean;
}

const SkillSearchInput: React.FC<SkillSearchInputProps> = ({ 
  placeholder, 
  onSelect, 
  searchFn,
  disabled 
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SkillSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const response = await searchFn(query);
      setResults(response.results);
      setIsSearching(false);
      setShowDropdown(true);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, searchFn]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (item: SkillSearchResult) => {
    onSelect(item);
    setQuery('');
    setResults([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full pl-10 pr-10 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500 animate-spin" />
        )}
      </div>

      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {results.map((item, idx) => (
            <button
              key={item.uri || idx}
              onClick={() => handleSelect(item)}
              className="w-full px-4 py-3 text-left hover:bg-indigo-50 flex items-center justify-between border-b border-slate-100 last:border-0 transition-colors"
            >
              <span className="text-sm text-slate-700">{item.label}</span>
              {item.category && (
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                  {item.category}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {showDropdown && query.length >= 2 && results.length === 0 && !isSearching && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg p-4 text-center text-sm text-slate-500">
          Geen resultaten gevonden
        </div>
      )}
    </div>
  );
};

// ============================================================
// SELECTED ITEMS COMPONENT
// ============================================================

interface SelectedItemsProps {
  items: string[];
  onRemove: (item: string) => void;
  color?: 'indigo' | 'emerald' | 'amber';
}

const SelectedItems: React.FC<SelectedItemsProps> = ({ items, onRemove, color = 'indigo' }) => {
  const colors = {
    indigo: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200',
    emerald: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
    amber: 'bg-amber-100 text-amber-700 hover:bg-amber-200'
  };

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {items.map((item, idx) => (
        <span
          key={idx}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${colors[color]} transition-colors`}
        >
          {item}
          <button
            onClick={() => onRemove(item)}
            className="hover:opacity-70 transition-opacity"
          >
            <X className="w-3.5 h-3.5" />
          </button>
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
    if (pct >= 60) return 'bg-indigo-500';
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
}

const MatchResultCard: React.FC<MatchResultCardProps> = ({ result, rank, expanded, onToggle }) => {
  const { occupation, score, breakdown, gaps, matched } = result;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden hover:border-indigo-300 transition-colors">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center gap-4 bg-white hover:bg-slate-50 transition-colors"
      >
        <span className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center text-sm font-bold">
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
                  {breakdown.skills.matchedCount}/{breakdown.skills.totalCount} × {breakdown.skills.weight}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-24">Kennisgebieden</span>
                <div className="flex-1">
                  <ScoreBar score={breakdown.knowledge.score} showPercentage={false} />
                </div>
                <span className="text-xs text-slate-600 w-20 text-right">
                  {breakdown.knowledge.matchedCount}/{breakdown.knowledge.totalCount} × {breakdown.knowledge.weight}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-24">Taken</span>
                <div className="flex-1">
                  <ScoreBar score={breakdown.tasks.score} showPercentage={false} />
                </div>
                <span className="text-xs text-slate-600 w-20 text-right">
                  {breakdown.tasks.matchedCount}/{breakdown.tasks.totalCount} × {breakdown.tasks.weight}
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
        </div>
      )}
    </div>
  );
};

// ============================================================
// MAIN MODAL COMPONENT
// ============================================================

const MatchModal: React.FC<MatchModalProps> = ({ isOpen, onClose, onMatchComplete }) => {
  // State
  const [view, setView] = useState<MatchModalView>('builder');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedKnowledge, setSelectedKnowledge] = useState<string[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedResult, setExpandedResult] = useState<number | null>(0);
  const [executionTime, setExecutionTime] = useState<number>(0);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setView('builder');
      setError(null);
    }
  }, [isOpen]);

  // Handle skill selection
  const handleSelectSkill = useCallback((item: SkillSearchResult) => {
    if (!selectedSkills.includes(item.label)) {
      setSelectedSkills(prev => [...prev, item.label]);
    }
  }, [selectedSkills]);

  const handleRemoveSkill = useCallback((skill: string) => {
    setSelectedSkills(prev => prev.filter(s => s !== skill));
  }, []);

  // Handle knowledge selection
  const handleSelectKnowledge = useCallback((item: SkillSearchResult) => {
    if (!selectedKnowledge.includes(item.label)) {
      setSelectedKnowledge(prev => [...prev, item.label]);
    }
  }, [selectedKnowledge]);

  const handleRemoveKnowledge = useCallback((knowledge: string) => {
    setSelectedKnowledge(prev => prev.filter(k => k !== knowledge));
  }, []);

  // Handle matching
  const handleMatch = async () => {
    if (selectedSkills.length === 0 && selectedKnowledge.length === 0) {
      setError('Selecteer minimaal één vaardigheid of kennisgebied');
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
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-500 to-purple-500">
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
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex gap-3">
                <Sparkles className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-indigo-700">
                  <p className="font-medium">Selecteer je vaardigheden</p>
                  <p className="mt-1 text-indigo-600">
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
                  color="indigo"
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
                className="flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 transition-colors"
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
                    color="emerald"
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
              <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
              <h3 className="text-lg font-semibold text-slate-700">Bezig met matchen...</h3>
              <p className="mt-2 text-sm text-slate-500">
                Dit kan even duren bij de eerste keer (cache wordt opgebouwd)
              </p>
              <div className="mt-6 flex gap-2">
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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

              {/* Profile summary */}
              <div className="text-sm text-slate-500">
                <span className="font-medium">Profiel:</span>{' '}
                {selectedSkills.join(', ')}
                {selectedKnowledge.length > 0 && ` • ${selectedKnowledge.join(', ')}`}
              </div>

              {/* Results list */}
              <div className="space-y-3">
                {results.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    <Target className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                    <p>Geen matches gevonden met de huidige criteria</p>
                    <button
                      onClick={handleBack}
                      className="mt-3 text-indigo-600 hover:text-indigo-700 font-medium"
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
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
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
              {selectedSkills.length + selectedKnowledge.length} items geselecteerd
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
                className="px-6 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
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
    </div>
  );
};

export default MatchModal;
