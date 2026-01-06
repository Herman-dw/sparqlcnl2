import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Briefcase,
  GraduationCap,
  Sparkles,
  Plus,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle,
  RefreshCcw,
  ListChecks,
  Target,
  Info
} from 'lucide-react';
import SkillSearchInput from './SkillSearchInput';
import { createDebouncedProfileSuggestor, mapSuggestionsToItems } from '../services/profileBuilderService';
import { searchKnowledge, searchSkills, matchProfile } from '../services/matchingService';
import { useProfileStore } from '../state/profileStore';
import {
  ProfileHistoryEntry,
  ProfileItemWithSource,
  ProfileSource,
  SessionProfile
} from '../types/profile';
import { MatchProfile, MatchResult } from '../types/matching';
import { MatchResultCard } from './MatchModal';
import { createEmptyProfile, mergeProfileLists, mergeProfiles, normalizeLabel } from '../state/profileUtils';

type WizardStep = 'input' | 'suggestions' | 'confirm';

const buildSourceMap = (profile: SessionProfile) => {
  const entries: Record<string, { label: string; sources: ProfileSource[] }> = {};
  const addItems = (items: ProfileItemWithSource[]) => {
    items.forEach((item) => {
      entries[normalizeLabel(item.label)] = { label: item.label, sources: item.sources || [] };
    });
  };
  addItems(profile.skills);
  addItems(profile.knowledge);
  addItems(profile.tasks);
  addItems(profile.workConditions);
  return entries;
};

interface ProfileHistoryWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileReady?: (profile: SessionProfile) => void;
}

const emptyEntry = (): ProfileHistoryEntry => ({
  id:
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  kind: 'work',
  title: '',
  organization: '',
  years: '',
  description: ''
});

const ProfileHistoryWizard: React.FC<ProfileHistoryWizardProps> = ({ isOpen, onClose, onProfileReady }) => {
  const [step, setStep] = useState<WizardStep>('input');
  const [entries, setEntries] = useState<ProfileHistoryEntry[]>([]);
  const [formEntry, setFormEntry] = useState<ProfileHistoryEntry>(emptyEntry());
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<
    Record<
      string,
      {
        loading: boolean;
        error?: string | null;
        hasLoaded?: boolean;
        resolvedLabel?: string;
        resolvedMatchLabel?: string;
        resolvedUri?: string;
      }
    >
  >({});
  const [entrySelections, setEntrySelections] = useState<Record<string, SessionProfile>>({});
  const [suggestedProfiles, setSuggestedProfiles] = useState<Record<string, SessionProfile>>({});
  const [manualAdditions, setManualAdditions] = useState<SessionProfile>(createEmptyProfile());
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [workConditionInput, setWorkConditionInput] = useState('');
  const [taskInput, setTaskInput] = useState('');
  const [expandedResult, setExpandedResult] = useState<number | null>(0);

  const debouncedSuggestor = useMemo(() => createDebouncedProfileSuggestor(500), []);
  const { mergeProfile: mergeStoreProfile } = useProfileStore();

  const activeEntry = entries.find((entry) => entry.id === activeEntryId) || null;
  const activeSource: ProfileSource | null = activeEntry
    ? {
        id: activeEntry.id,
        label: `${activeEntry.kind === 'education' ? 'Opleiding' : 'Werk'}: ${activeEntry.title || activeEntry.organization}`,
        type: 'wizard'
      }
    : null;

  const aggregatedProfile = useMemo(() => {
    let combined: SessionProfile = createEmptyProfile();
    Object.values(entrySelections).forEach((profile) => {
      combined = mergeProfiles(combined, profile);
    });
    combined = mergeProfiles(combined, manualAdditions);
    return combined;
  }, [entrySelections, manualAdditions]);

  const aggregatedSourceMap = useMemo(() => buildSourceMap(aggregatedProfile), [aggregatedProfile]);

  useEffect(() => {
    if (!isOpen) {
      setStep('input');
      setEntries([]);
      setFormEntry(emptyEntry());
      setValidationErrors({});
      setActiveEntryId(null);
      setEntrySelections({});
      setManualAdditions(createEmptyProfile());
      setMatchResults([]);
      setMatchError(null);
      setExpandedResult(0);
      return;
    }
    if (!activeEntryId && entries[0]) {
      setActiveEntryId(entries[0].id);
    }
  }, [activeEntryId, entries, isOpen]);

  useEffect(() => {
    if (step === 'confirm') {
      mergeStoreProfile(aggregatedProfile);
      onProfileReady?.(aggregatedProfile);
    }
  }, [aggregatedProfile, mergeStoreProfile, onProfileReady, step]);

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formEntry.title.trim()) errors.title = 'Titel is verplicht';
    if (!formEntry.organization.trim()) errors.organization = 'Organisatie is verplicht';
    if (!formEntry.years.trim()) errors.years = 'Jaren zijn verplicht';
    if (!formEntry.description.trim()) errors.description = 'Beschrijving is verplicht';
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddEntry = () => {
    if (!validateForm()) return;
    setEntries((prev) => [...prev, formEntry]);
    setFormEntry(emptyEntry());
    setActiveEntryId((prevActive) => prevActive || formEntry.id);
  };

  const handleEditEntry = (entry: ProfileHistoryEntry) => {
    setFormEntry(entry);
  };

  const handleUpdateEntry = () => {
    if (!validateForm()) return;
    setEntries((prev) => prev.map((entry) => (entry.id === formEntry.id ? formEntry : entry)));
    setFormEntry(emptyEntry());
  };

  const handleRemoveEntry = (id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    setEntrySelections((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (activeEntryId === id) {
      setActiveEntryId(null);
    }
  };

  const toggleSelection = (entryId: string, listKey: keyof SessionProfile, item: ProfileItemWithSource) => {
    setEntrySelections((current) => {
      const existing = current[entryId] || createEmptyProfile();
      const list = existing[listKey] as ProfileItemWithSource[];
      const exists = list.some((l) => normalizeLabel(l.label) === normalizeLabel(item.label));
      const updatedList = exists
        ? list.filter((l) => normalizeLabel(l.label) !== normalizeLabel(item.label))
        : [...list, item];
      return {
        ...current,
        [entryId]: {
          ...existing,
          [listKey]: updatedList
        }
      };
    });
  };

  const addManualItem = (listKey: keyof SessionProfile, label: string, sourceLabel = 'Handmatig') => {
    if (!label.trim()) return;
    const manualSource: ProfileSource = { id: `${listKey}-manual-${label}`, label: sourceLabel, type: 'manual' };
    const type: ProfileItemWithSource['type'] =
      listKey === 'knowledge'
        ? 'knowledge'
        : listKey === 'tasks'
          ? 'task'
          : listKey === 'workConditions'
            ? 'workCondition'
            : 'skill';
    const item: ProfileItemWithSource = { uri: '', label, type, sources: [manualSource] };
    setManualAdditions((prev) => ({
      ...prev,
      [listKey]: mergeProfileLists(prev[listKey] as ProfileItemWithSource[], [item])
    }));
  };

  const removeAggregatedItem = (label: string, listKey: keyof SessionProfile) => {
    setEntrySelections((current) => {
      const next: typeof current = {};
      Object.entries(current).forEach(([entryId, profile]) => {
        next[entryId] = {
          ...profile,
          [listKey]: (profile[listKey] as ProfileItemWithSource[]).filter(
            (item) => normalizeLabel(item.label) !== normalizeLabel(label)
          )
        };
      });
      return next;
    });
    setManualAdditions((prev) => ({
      ...prev,
      [listKey]: (prev[listKey] as ProfileItemWithSource[]).filter(
        (item) => normalizeLabel(item.label) !== normalizeLabel(label)
      )
    }));
  };

  const handleSuggestionFetch = async (entry: ProfileHistoryEntry) => {
    if (!entry.title && !entry.description) return;
    setSuggestions((prev) => ({
      ...prev,
      [entry.id]: {
        loading: true,
        error: null,
        hasLoaded: prev[entry.id]?.hasLoaded,
        resolvedLabel: prev[entry.id]?.resolvedLabel,
        resolvedMatchLabel: prev[entry.id]?.resolvedMatchLabel,
        resolvedUri: prev[entry.id]?.resolvedUri
      }
    }));

    try {
      const response = await debouncedSuggestor({
        title: entry.title,
        organization: entry.organization,
        years: entry.years,
        description: entry.description,
        kind: entry.kind
      });

      setSuggestions((prev) => ({
        ...prev,
        [entry.id]: {
          loading: false,
          error: response.error,
          hasLoaded: true,
          resolvedLabel: response.resolvedLabel,
          resolvedMatchLabel: response.resolvedMatchLabel,
          resolvedUri: response.resolvedUri
        }
      }));

      if (response.success && activeSource) {
        const mapped = mapSuggestionsToItems(response, activeSource);
        setSuggestedProfiles((current) => ({
          ...current,
          [entry.id]: mapped
        }));
        setEntrySelections((current) => ({
          ...current,
          [entry.id]: mergeProfiles(current[entry.id] || createEmptyProfile(), mapped)
        }));
      }
    } catch (error) {
      setSuggestions((prev) => ({
        ...prev,
        [entry.id]: {
          loading: false,
          error: error instanceof Error ? error.message : 'Onbekende fout',
          hasLoaded: true
        }
      }));
    }
  };

  useEffect(() => {
    if (step !== 'suggestions' || !activeEntry) return;
    handleSuggestionFetch(activeEntry);
  }, [activeEntry?.description, activeEntry?.title, activeEntry?.years, activeEntry?.organization, activeEntry?.kind, step]);

  const handleNext = () => {
    if (step === 'input') {
      if (entries.length === 0) {
        setValidationErrors({ global: 'Voeg minstens één werk- of opleidingsrecord toe' });
        return;
      }
      setStep('suggestions');
      setValidationErrors({});
      setActiveEntryId(entries[0].id);
    } else if (step === 'suggestions') {
      setStep('confirm');
    }
  };

  const handleBack = () => {
    if (step === 'confirm') setStep('suggestions');
    if (step === 'suggestions') setStep('input');
  };

  const handleMatch = async () => {
    setIsMatching(true);
    setMatchError(null);
    try {
      const profilePayload: MatchProfile = {
        skills: aggregatedProfile.skills.map((item) => item.label),
        knowledge: aggregatedProfile.knowledge.map((item) => item.label),
        tasks: aggregatedProfile.tasks.map((item) => item.label)
      };
      const response = await matchProfile(profilePayload, {
        limit: 15,
        includeGaps: true,
        includeMatched: true,
        minScore: 0.01
      });

      if (!response.success) {
        throw new Error(response.error || 'Matching mislukt');
      }
      setMatchResults(response.matches);
      setExpandedResult(0);
    } catch (error) {
      setMatchError(error instanceof Error ? error.message : 'Onbekende fout');
    } finally {
      setIsMatching(false);
    }
  };

  const renderEntryCard = (entry: ProfileHistoryEntry) => (
    <div
      key={entry.id}
      className={`p-4 rounded-xl border ${activeEntryId === entry.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'} flex flex-col gap-2`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-700">
          {entry.kind === 'work' ? <Briefcase className="w-4 h-4 text-indigo-600" /> : <GraduationCap className="w-4 h-4 text-emerald-600" />}
          <div>
            <p className="font-semibold">{entry.title}</p>
            <p className="text-xs text-slate-500">{entry.organization}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleEditEntry(entry)} className="text-xs text-indigo-600 hover:underline">Bewerken</button>
          <button onClick={() => handleRemoveEntry(entry.id)} className="text-xs text-rose-600 hover:underline">Verwijderen</button>
        </div>
      </div>
      <div className="text-xs text-slate-500">{entry.years}</div>
      <p className="text-sm text-slate-600 line-clamp-2">{entry.description}</p>
      <button
        className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold self-start"
        onClick={() => setActiveEntryId(entry.id)}
      >
        Selecteer voor suggesties
      </button>
    </div>
  );

  const renderSuggestions = (entry: ProfileHistoryEntry) => {
    const state = suggestions[entry.id];
    const selection = entrySelections[entry.id] || createEmptyProfile();
    const suggestionData = suggestedProfiles[entry.id] || createEmptyProfile();
    const isEducation = entry.kind === 'education';

    const renderGroup = (
      title: string,
      listKey: keyof SessionProfile,
      emptyLabel: string,
      items: ProfileItemWithSource[]
    ) => (
      <div className="border border-slate-200 rounded-xl p-4 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
          <span className="text-[11px] text-slate-400 uppercase tracking-widest">
            {selection[listKey].length} geselecteerd
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {items.length === 0 ? (
            <span className="text-xs text-slate-400">{emptyLabel}</span>
          ) : (
            items.map((item) => {
              const isActive = selection[listKey].some(
                (selected) => normalizeLabel(selected.label) === normalizeLabel(item.label)
              );
              return (
                <button
                  key={item.label}
                  onClick={() => toggleSelection(entry.id, listKey, { ...item, sources: activeSource ? [activeSource] : item.sources })}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                    isActive
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-700'
                  }`}
                >
                  {item.label}
                </button>
              );
            })
          )}
        </div>
      </div>
    );

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-600">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <div>
              <p className="text-sm font-semibold">Suggesties</p>
              <p className="text-xs text-slate-500">Op basis van titel & beschrijving genereren we voorstellen</p>
            </div>
          </div>
          <button
            onClick={() => handleSuggestionFetch(entry)}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            <RefreshCcw className="w-4 h-4" /> Vernieuwen
          </button>
        </div>

        {state?.error && (
          <div className="p-3 border border-rose-200 bg-rose-50 text-rose-700 text-sm rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {state.error}
          </div>
        )}

        {state?.loading && (
          <div className="p-6 border border-indigo-100 bg-indigo-50 rounded-xl flex items-center gap-3 text-indigo-700 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
            Suggesties ophalen...
          </div>
        )}

        {!state?.loading && !state?.hasLoaded && (
          <div className="p-6 border border-slate-200 bg-white rounded-xl text-sm text-slate-500 flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-400" />
            Vul de beschrijving en klik op "Vernieuwen" om suggesties te zien.
          </div>
        )}

        {state?.hasLoaded && !state?.loading && (
          <>
            {(state.resolvedLabel || state.resolvedMatchLabel) && (
              <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-sm text-emerald-800 flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5" />
                <div>
                  <p className="font-semibold">Gevonden in CompetentNL</p>
                  <p className="text-sm">
                    {state.resolvedLabel}
                    {state.resolvedMatchLabel && state.resolvedMatchLabel !== state.resolvedLabel
                      ? ` (gevonden via: ${state.resolvedMatchLabel})`
                      : ''}
                  </p>
                  {state.resolvedUri && (
                    <p className="text-xs text-emerald-700 break-all">{state.resolvedUri}</p>
                  )}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderGroup('Vaardigheden', 'skills', 'Nog geen voorgestelde vaardigheden', suggestionData.skills)}
              {renderGroup('Kennis', 'knowledge', 'Nog geen voorgestelde kennisgebieden', suggestionData.knowledge)}
              {!isEducation &&
                renderGroup('Werkomstandigheden', 'workConditions', 'Nog geen werkomstandigheden', suggestionData.workConditions)}
              {!isEducation && renderGroup('Taken', 'tasks', 'Nog geen taken gevonden', suggestionData.tasks)}
            </div>
          </>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col m-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-500 to-purple-500">
          <div className="flex items-center gap-3 text-white">
            <ListChecks className="w-6 h-6" />
            <div>
              <p className="text-sm uppercase tracking-widest font-semibold">Profielbouwer</p>
              <p className="text-lg font-bold">Werk- en opleidingsverleden</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-4 text-xs font-semibold text-slate-500">
            <span className={`flex items-center gap-1 px-3 py-1 rounded-full ${step === 'input' ? 'bg-indigo-100 text-indigo-700' : 'bg-white border border-slate-200'}`}>
              <Briefcase className="w-3 h-3" /> Invoer
            </span>
            <span className={`flex items-center gap-1 px-3 py-1 rounded-full ${step === 'suggestions' ? 'bg-indigo-100 text-indigo-700' : 'bg-white border border-slate-200'}`}>
              <Sparkles className="w-3 h-3" /> Suggesties
            </span>
            <span className={`flex items-center gap-1 px-3 py-1 rounded-full ${step === 'confirm' ? 'bg-indigo-100 text-indigo-700' : 'bg-white border border-slate-200'}`}>
              <CheckCircle className="w-3 h-3" /> Bevestigen
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {step === 'input' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-indigo-600" />
                  Voeg werk of mbo-opleiding toe
                </h3>
                {validationErrors.global && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {validationErrors.global}
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-600">Type</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFormEntry({ ...formEntry, kind: 'work' })}
                      className={`px-3 py-2 rounded-lg border text-sm font-semibold ${formEntry.kind === 'work' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}
                    >
                      Werkervaring
                    </button>
                    <button
                      onClick={() => setFormEntry({ ...formEntry, kind: 'education' })}
                      className={`px-3 py-2 rounded-lg border text-sm font-semibold ${formEntry.kind === 'education' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}
                    >
                      MBO-opleiding
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-600">Titel</label>
                  <input
                    value={formEntry.title}
                    onChange={(e) => setFormEntry({ ...formEntry, title: e.target.value })}
                    className={`w-full border rounded-lg p-2 text-sm ${validationErrors.title ? 'border-rose-300' : 'border-slate-200'}`}
                    placeholder="Bijv. Verpleegkundige"
                  />
                  {validationErrors.title && <p className="text-xs text-rose-600">{validationErrors.title}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-600">Organisatie</label>
                  <input
                    value={formEntry.organization}
                    onChange={(e) => setFormEntry({ ...formEntry, organization: e.target.value })}
                    className={`w-full border rounded-lg p-2 text-sm ${validationErrors.organization ? 'border-rose-300' : 'border-slate-200'}`}
                    placeholder="Bijv. UMC Utrecht"
                  />
                  {validationErrors.organization && <p className="text-xs text-rose-600">{validationErrors.organization}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-600">Jaren</label>
                  <input
                    value={formEntry.years}
                    onChange={(e) => setFormEntry({ ...formEntry, years: e.target.value })}
                    className={`w-full border rounded-lg p-2 text-sm ${validationErrors.years ? 'border-rose-300' : 'border-slate-200'}`}
                    placeholder="Bijv. 2019 - 2023"
                  />
                  {validationErrors.years && <p className="text-xs text-rose-600">{validationErrors.years}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-600">Beschrijving</label>
                  <textarea
                    value={formEntry.description}
                    onChange={(e) => setFormEntry({ ...formEntry, description: e.target.value })}
                    className={`w-full border rounded-lg p-2 text-sm min-h-[120px] ${validationErrors.description ? 'border-rose-300' : 'border-slate-200'}`}
                    placeholder="Beschrijf werkzaamheden, projecten of vakken"
                  />
                  {validationErrors.description && <p className="text-xs text-rose-600">{validationErrors.description}</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={formEntry && entries.find((e) => e.id === formEntry.id) ? handleUpdateEntry : handleAddEntry}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    {entries.find((e) => e.id === formEntry.id) ? 'Update record' : 'Voeg record toe'}
                  </button>
                  <button
                    onClick={() => setFormEntry(emptyEntry())}
                    className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-200"
                  >
                    Reset formulier
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-slate-500" />
                    Records ({entries.length})
                  </h3>
                  {entries.length > 0 && (
                    <span className="text-[11px] text-slate-400 uppercase tracking-widest">klik om te selecteren</span>
                  )}
                </div>
                {entries.length === 0 ? (
                  <div className="p-4 border border-slate-200 rounded-xl bg-white text-sm text-slate-500">
                    Nog geen werk- of opleidingsrecords toegevoegd.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {entries.map(renderEntryCard)}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 'suggestions' && activeEntry && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  Kies een record
                </h3>
                <div className="space-y-2">
                  {entries.map((entry) => (
                    <button
                      key={entry.id}
                      onClick={() => setActiveEntryId(entry.id)}
                      className={`w-full text-left p-4 rounded-xl border ${entry.id === activeEntryId ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-300'} transition-colors`}
                    >
                      <p className="font-semibold text-slate-700">{entry.title}</p>
                      <p className="text-xs text-slate-500">{entry.organization}</p>
                      <p className="text-[11px] text-slate-400 mt-1">{entry.years}</p>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setStep('input')}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1"
                >
                  <ArrowLeft className="w-4 h-4" /> Records aanpassen
                </button>
              </div>
              <div className="md:col-span-2">
                <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-slate-700">
                    {activeEntry.kind === 'work' ? <Briefcase className="w-4 h-4 text-indigo-600" /> : <GraduationCap className="w-4 h-4 text-emerald-600" />}
                    <div>
                      <p className="font-semibold">{activeEntry.title}</p>
                      <p className="text-xs text-slate-500">{activeEntry.organization}</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600">{activeEntry.description}</p>
                </div>
                {renderSuggestions(activeEntry)}
              </div>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-700">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold">Bevestig voorgestelde items</p>
                    <p className="text-xs text-slate-500">Verwijder wat niet past of voeg handmatig toe.</p>
                  </div>
                </div>
                <button
                  onClick={handleMatch}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 flex items-center gap-2"
                  disabled={aggregatedProfile.skills.length === 0 && aggregatedProfile.knowledge.length === 0}
                >
                  {isMatching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
                  Match nu
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl p-4 bg-white">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-slate-700">Vaardigheden</h4>
                    <span className="text-[11px] text-slate-400 uppercase tracking-widest">{aggregatedProfile.skills.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {aggregatedProfile.skills.length === 0 ? (
                      <span className="text-xs text-slate-400">Geen vaardigheden geselecteerd</span>
                    ) : (
                      aggregatedProfile.skills.map((item) => (
                        <span key={item.label} className="px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs border border-indigo-100 flex items-center gap-2">
                          {item.label}
                          <button
                            onClick={() => removeAggregatedItem(item.label, 'skills')}
                            className="text-indigo-500 hover:text-indigo-700"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                          <span className="text-[10px] text-slate-500">
                            {item.sources.map((s) => s.label).join(', ')}
                          </span>
                        </span>
                      ))
                    )}
                  </div>
                  <div className="mt-3">
                    <SkillSearchInput
                      placeholder="Voeg handmatig vaardigheid toe"
                      onSelect={(item) => addManualItem('skills', item.label)}
                      searchFn={searchSkills}
                    />
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl p-4 bg-white">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-slate-700">Kennis</h4>
                    <span className="text-[11px] text-slate-400 uppercase tracking-widest">{aggregatedProfile.knowledge.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {aggregatedProfile.knowledge.length === 0 ? (
                      <span className="text-xs text-slate-400">Geen kennisgebieden geselecteerd</span>
                    ) : (
                      aggregatedProfile.knowledge.map((item) => (
                        <span key={item.label} className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs border border-emerald-100 flex items-center gap-2">
                          {item.label}
                          <button
                            onClick={() => removeAggregatedItem(item.label, 'knowledge')}
                            className="text-emerald-500 hover:text-emerald-700"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                          <span className="text-[10px] text-slate-500">
                            {item.sources.map((s) => s.label).join(', ')}
                          </span>
                        </span>
                      ))
                    )}
                  </div>
                  <div className="mt-3">
                    <SkillSearchInput
                      placeholder="Voeg handmatig kennis toe"
                      onSelect={(item) => addManualItem('knowledge', item.label)}
                      searchFn={searchKnowledge}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl p-4 bg-white">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-slate-700">Werkomstandigheden</h4>
                    <span className="text-[11px] text-slate-400 uppercase tracking-widest">{aggregatedProfile.workConditions.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {aggregatedProfile.workConditions.length === 0 ? (
                      <span className="text-xs text-slate-400">Geen werkomstandigheden geselecteerd</span>
                    ) : (
                      aggregatedProfile.workConditions.map((item) => (
                        <span key={item.label} className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs border border-amber-100 flex items-center gap-2">
                          {item.label}
                          <button
                            onClick={() => removeAggregatedItem(item.label, 'workConditions')}
                            className="text-amber-600 hover:text-amber-800"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                          <span className="text-[10px] text-slate-500">
                            {item.sources.map((s) => s.label).join(', ')}
                          </span>
                        </span>
                      ))
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      placeholder="Handmatig werkomstandigheid toevoegen"
                      className="flex-1 border border-slate-200 rounded-lg p-2 text-sm"
                      value={workConditionInput}
                      onChange={(e) => setWorkConditionInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addManualItem('workConditions', workConditionInput);
                          setWorkConditionInput('');
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        if (workConditionInput) {
                          addManualItem('workConditions', workConditionInput);
                          setWorkConditionInput('');
                        }
                      }}
                      className="px-3 py-2 bg-amber-100 text-amber-700 rounded-lg text-sm font-semibold"
                    >
                      Toevoegen
                    </button>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl p-4 bg-white">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-slate-700">Taken</h4>
                    <span className="text-[11px] text-slate-400 uppercase tracking-widest">{aggregatedProfile.tasks.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {aggregatedProfile.tasks.length === 0 ? (
                      <span className="text-xs text-slate-400">Geen taken geselecteerd</span>
                    ) : (
                      aggregatedProfile.tasks.map((item) => (
                        <span key={item.label} className="px-3 py-1.5 rounded-full bg-purple-50 text-purple-700 text-xs border border-purple-100 flex items-center gap-2">
                          {item.label}
                          <button
                            onClick={() => removeAggregatedItem(item.label, 'tasks')}
                            className="text-purple-600 hover:text-purple-800"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                          <span className="text-[10px] text-slate-500">
                            {item.sources.map((s) => s.label).join(', ')}
                          </span>
                        </span>
                      ))
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      placeholder="Handmatig taak toevoegen"
                      className="flex-1 border border-slate-200 rounded-lg p-2 text-sm"
                      value={taskInput}
                      onChange={(e) => setTaskInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addManualItem('tasks', taskInput);
                          setTaskInput('');
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        if (taskInput) {
                          addManualItem('tasks', taskInput);
                          setTaskInput('');
                        }
                      }}
                      className="px-3 py-2 bg-purple-100 text-purple-700 rounded-lg text-sm font-semibold"
                    >
                      Toevoegen
                    </button>
                  </div>
                </div>
              </div>

              {matchError && (
                <div className="p-4 border border-rose-200 bg-rose-50 text-rose-700 text-sm rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {matchError}
                </div>
              )}

              {isMatching && (
                <div className="p-4 border border-indigo-100 bg-indigo-50 rounded-xl text-indigo-700 text-sm flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Matching op basis van je bevestigde profiel...
                </div>
              )}

              {matchResults.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-700">
                      <CheckCircle className="w-5 h-5" />
                      <p className="text-sm font-semibold">{matchResults.length} matches gevonden</p>
                    </div>
                    <span className="text-[11px] text-slate-400 uppercase tracking-widest">
                      Profielitems: {aggregatedProfile.skills.length + aggregatedProfile.knowledge.length + aggregatedProfile.tasks.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {matchResults.map((result, idx) => (
                      <MatchResultCard
                        key={result.occupation.uri || idx}
                        result={result}
                        rank={idx + 1}
                        expanded={expandedResult === idx}
                        onToggle={() => setExpandedResult(expandedResult === idx ? null : idx)}
                        profileSources={aggregatedSourceMap}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Stap {step === 'input' ? 1 : step === 'suggestions' ? 2 : 3} van 3
          </div>
          <div className="flex gap-2">
            {step !== 'input' && (
              <button onClick={handleBack} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100">
                <ArrowLeft className="w-4 h-4 inline-block mr-1" />
                Terug
              </button>
            )}
            {step !== 'confirm' && (
              <button onClick={handleNext} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 flex items-center gap-2">
                Volgende
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {step === 'confirm' && (
              <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100">
                Klaar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileHistoryWizard;
