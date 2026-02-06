/**
 * CVDataReviewModal Component
 * Shows detailed CV extraction data for review before adding to profile
 * Allows editing and marking classification correctness
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  X, Check, Trash2, Edit2, Save, AlertCircle,
  Briefcase, GraduationCap, Sparkles, ChevronDown, ChevronUp,
  ThumbsUp, ThumbsDown, Plus, ArrowRight
} from 'lucide-react';
import { QuickExtractedData, AggregatedSkills } from '../types/quickMatch';

// Feedback types for model improvement
export interface ClassificationFeedback {
  itemId: string;
  itemType: 'work' | 'education' | 'skill';
  originalLabel: string;
  classifiedLabel?: string;
  classifiedUri?: string;
  isCorrect: boolean | null; // null = not rated, true = correct, false = incorrect
  userCorrectedLabel?: string;
  removed: boolean;
}

export interface CVReviewResult {
  // Items to add to profile
  selectedSkills: { label: string; uri?: string; source: string }[];
  selectedWorkExperiences: { jobTitle: string; organization?: string }[];
  selectedEducation: { degree: string; institution?: string }[];
  // Feedback for model improvement
  feedback: ClassificationFeedback[];
}

interface CVDataReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  extractedData: QuickExtractedData;
  skillSources: AggregatedSkills;
  onConfirm: (result: CVReviewResult) => void;
}

interface EditableSkill {
  id: string;
  label: string;
  originalLabel?: string;
  uri?: string;
  source: 'direct' | 'education' | 'occupation';
  sourceLabel?: string;
  isCorrect: boolean | null;
  removed: boolean;
  editing: boolean;
  editedLabel: string;
}

interface EditableWorkExp {
  id: string;
  jobTitle: string;
  organization: string;
  classifiedLabel?: string;
  classifiedUri?: string;
  isCorrect: boolean | null;
  removed: boolean;
  editing: boolean;
  editedTitle: string;
}

interface EditableEducation {
  id: string;
  degree: string;
  institution: string;
  year?: string;
  classifiedLabel?: string;
  classifiedUri?: string;
  isCorrect: boolean | null;
  removed: boolean;
  editing: boolean;
  editedDegree: string;
}

const CVDataReviewModal: React.FC<CVDataReviewModalProps> = ({
  isOpen,
  onClose,
  extractedData,
  skillSources,
  onConfirm
}) => {
  // Initialize editable state from extracted data
  const [skills, setSkills] = useState<EditableSkill[]>(() => {
    const result: EditableSkill[] = [];
    let idx = 0;

    // Add direct skills
    (skillSources.direct || []).forEach((skill: any) => {
      const label = typeof skill === 'string' ? skill : skill.label;
      const uri = typeof skill === 'string' ? undefined : skill.uri;
      result.push({
        id: `direct-${idx++}`,
        label,
        originalLabel: label,
        uri,
        source: 'direct',
        sourceLabel: 'CV',
        isCorrect: null,
        removed: false,
        editing: false,
        editedLabel: label
      });
    });

    // Add education-derived skills
    (skillSources.fromEducation || []).forEach((skill: any) => {
      const label = typeof skill === 'string' ? skill : skill.label;
      const uri = typeof skill === 'string' ? undefined : skill.uri;
      const sourceLabel = typeof skill === 'string' ? 'Opleiding' : (skill.sourceLabel || 'Opleiding');
      result.push({
        id: `edu-${idx++}`,
        label,
        originalLabel: label,
        uri,
        source: 'education',
        sourceLabel,
        isCorrect: null,
        removed: false,
        editing: false,
        editedLabel: label
      });
    });

    // Add occupation-derived skills
    (skillSources.fromOccupation || []).forEach((skill: any) => {
      const label = typeof skill === 'string' ? skill : skill.label;
      const uri = typeof skill === 'string' ? undefined : skill.uri;
      const sourceLabel = typeof skill === 'string' ? 'Beroep' : (skill.sourceLabel || 'Beroep');
      result.push({
        id: `occ-${idx++}`,
        label,
        originalLabel: label,
        uri,
        source: 'occupation',
        sourceLabel,
        isCorrect: null,
        removed: false,
        editing: false,
        editedLabel: label
      });
    });

    return result;
  });

  const [workExperiences, setWorkExperiences] = useState<EditableWorkExp[]>(() => {
    return (extractedData.workExperiences || []).map((exp, idx) => {
      // Find classification by matching job title
      const classification = extractedData.classifiedExperiences?.find(c => c.jobTitle === exp.jobTitle);
      return {
        id: `work-${idx}`,
        jobTitle: exp.jobTitle,
        organization: exp.organization || '',
        classifiedLabel: classification?.cnlClassification?.prefLabel,
        classifiedUri: classification?.cnlClassification?.uri,
        isCorrect: null,
        removed: false,
        editing: false,
        editedTitle: exp.jobTitle
      };
    });
  });

  const [education, setEducation] = useState<EditableEducation[]>(() => {
    return (extractedData.education || []).map((edu, idx) => {
      // Find classification by matching degree
      const classification = extractedData.classifiedEducation?.find(c => c.degree === edu.degree);
      return {
        id: `edu-${idx}`,
        degree: edu.degree,
        institution: edu.institution || '',
        year: edu.year,
        classifiedLabel: classification?.cnlClassification?.prefLabel,
        classifiedUri: classification?.cnlClassification?.uri,
        isCorrect: null,
        removed: false,
        editing: false,
        editedDegree: edu.degree
      };
    });
  });

  const [expandedSections, setExpandedSections] = useState({
    work: true,
    education: true,
    skills: true
  });

  // Counts
  const activeSkillsCount = skills.filter(s => !s.removed).length;
  const activeWorkCount = workExperiences.filter(w => !w.removed).length;
  const activeEduCount = education.filter(e => !e.removed).length;

  // Handlers
  const toggleSection = (section: 'work' | 'education' | 'skills') => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleSkillRemove = (id: string) => {
    setSkills(prev => prev.map(s => s.id === id ? { ...s, removed: !s.removed } : s));
  };

  const handleSkillCorrectness = (id: string, isCorrect: boolean) => {
    setSkills(prev => prev.map(s => s.id === id ? { ...s, isCorrect } : s));
  };

  const handleSkillEdit = (id: string) => {
    setSkills(prev => prev.map(s => s.id === id ? { ...s, editing: true } : s));
  };

  const handleSkillSave = (id: string) => {
    setSkills(prev => prev.map(s => {
      if (s.id === id) {
        return { ...s, label: s.editedLabel, editing: false };
      }
      return s;
    }));
  };

  const handleSkillLabelChange = (id: string, value: string) => {
    setSkills(prev => prev.map(s => s.id === id ? { ...s, editedLabel: value } : s));
  };

  const handleWorkRemove = (id: string) => {
    setWorkExperiences(prev => prev.map(w => w.id === id ? { ...w, removed: !w.removed } : w));
  };

  const handleWorkCorrectness = (id: string, isCorrect: boolean) => {
    setWorkExperiences(prev => prev.map(w => w.id === id ? { ...w, isCorrect } : w));
  };

  const handleEduRemove = (id: string) => {
    setEducation(prev => prev.map(e => e.id === id ? { ...e, removed: !e.removed } : e));
  };

  const handleEduCorrectness = (id: string, isCorrect: boolean) => {
    setEducation(prev => prev.map(e => e.id === id ? { ...e, isCorrect } : e));
  };

  // Build result and confirm
  const handleConfirm = useCallback(() => {
    const result: CVReviewResult = {
      selectedSkills: skills
        .filter(s => !s.removed)
        .map(s => ({
          label: s.label,
          uri: s.uri,
          source: s.sourceLabel || s.source
        })),
      selectedWorkExperiences: workExperiences
        .filter(w => !w.removed)
        .map(w => ({
          jobTitle: w.editing ? w.editedTitle : w.jobTitle,
          organization: w.organization
        })),
      selectedEducation: education
        .filter(e => !e.removed)
        .map(e => ({
          degree: e.editing ? e.editedDegree : e.degree,
          institution: e.institution
        })),
      feedback: [
        ...skills.map(s => ({
          itemId: s.id,
          itemType: 'skill' as const,
          originalLabel: s.originalLabel || s.label,
          classifiedLabel: s.label,
          classifiedUri: s.uri,
          isCorrect: s.isCorrect,
          userCorrectedLabel: s.editing ? s.editedLabel : undefined,
          removed: s.removed
        })),
        ...workExperiences.map(w => ({
          itemId: w.id,
          itemType: 'work' as const,
          originalLabel: w.jobTitle,
          classifiedLabel: w.classifiedLabel,
          classifiedUri: w.classifiedUri,
          isCorrect: w.isCorrect,
          userCorrectedLabel: w.editing ? w.editedTitle : undefined,
          removed: w.removed
        })),
        ...education.map(e => ({
          itemId: e.id,
          itemType: 'education' as const,
          originalLabel: e.degree,
          classifiedLabel: e.classifiedLabel,
          classifiedUri: e.classifiedUri,
          isCorrect: e.isCorrect,
          userCorrectedLabel: e.editing ? e.editedDegree : undefined,
          removed: e.removed
        }))
      ]
    };

    onConfirm(result);
  }, [skills, workExperiences, education, onConfirm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col m-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-500 to-indigo-500">
          <div>
            <h2 className="text-lg font-bold text-white">
              CV gegevens controleren
            </h2>
            <p className="text-sm text-white/80">
              Controleer en bewerk de gegevens voordat ze aan je profiel worden toegevoegd
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Info banner */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-700">
              <p className="font-medium">Help ons beter worden!</p>
              <p className="mt-1 text-blue-600">
                Gebruik de duimpjes om aan te geven of de classificaties correct zijn.
                Dit helpt het model verbeteren voor toekomstige uploads.
              </p>
            </div>
          </div>

          {/* Work Experiences Section */}
          {workExperiences.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleSection('work')}
                className="w-full px-4 py-3 flex items-center justify-between bg-blue-50 hover:bg-blue-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Briefcase className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-left">
                    <span className="font-semibold text-slate-800">
                      Werkervaring ({activeWorkCount})
                    </span>
                    {workExperiences.length !== activeWorkCount && (
                      <span className="ml-2 text-xs text-slate-500">
                        ({workExperiences.length - activeWorkCount} verwijderd)
                      </span>
                    )}
                  </div>
                </div>
                {expandedSections.work ? (
                  <ChevronUp className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                )}
              </button>

              {expandedSections.work && (
                <div className="p-4 space-y-2">
                  {workExperiences.map((work) => (
                    <div
                      key={work.id}
                      className={`p-3 rounded-lg border transition-all ${
                        work.removed
                          ? 'bg-slate-50 border-slate-200 opacity-50'
                          : 'bg-white border-slate-200 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-800">
                            {work.jobTitle}
                          </div>
                          {work.organization && (
                            <div className="text-sm text-slate-500">{work.organization}</div>
                          )}
                          {work.classifiedLabel && (
                            <div className="mt-1 flex items-center gap-2">
                              <span className="text-xs text-slate-400">Geclassificeerd als:</span>
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                {work.classifiedLabel}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {/* Correctness buttons */}
                          {work.classifiedLabel && (
                            <>
                              <button
                                onClick={() => handleWorkCorrectness(work.id, true)}
                                className={`p-1.5 rounded transition-colors ${
                                  work.isCorrect === true
                                    ? 'bg-emerald-100 text-emerald-600'
                                    : 'text-slate-400 hover:text-emerald-500 hover:bg-emerald-50'
                                }`}
                                title="Correcte classificatie"
                              >
                                <ThumbsUp className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleWorkCorrectness(work.id, false)}
                                className={`p-1.5 rounded transition-colors ${
                                  work.isCorrect === false
                                    ? 'bg-rose-100 text-rose-600'
                                    : 'text-slate-400 hover:text-rose-500 hover:bg-rose-50'
                                }`}
                                title="Incorrecte classificatie"
                              >
                                <ThumbsDown className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleWorkRemove(work.id)}
                            className={`p-1.5 rounded transition-colors ${
                              work.removed
                                ? 'bg-emerald-100 text-emerald-600'
                                : 'text-slate-400 hover:text-rose-500 hover:bg-rose-50'
                            }`}
                            title={work.removed ? 'Herstellen' : 'Verwijderen'}
                          >
                            {work.removed ? <Plus className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Education Section */}
          {education.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleSection('education')}
                className="w-full px-4 py-3 flex items-center justify-between bg-purple-50 hover:bg-purple-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                    <GraduationCap className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="text-left">
                    <span className="font-semibold text-slate-800">
                      Opleiding ({activeEduCount})
                    </span>
                    {education.length !== activeEduCount && (
                      <span className="ml-2 text-xs text-slate-500">
                        ({education.length - activeEduCount} verwijderd)
                      </span>
                    )}
                  </div>
                </div>
                {expandedSections.education ? (
                  <ChevronUp className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                )}
              </button>

              {expandedSections.education && (
                <div className="p-4 space-y-2">
                  {education.map((edu) => (
                    <div
                      key={edu.id}
                      className={`p-3 rounded-lg border transition-all ${
                        edu.removed
                          ? 'bg-slate-50 border-slate-200 opacity-50'
                          : 'bg-white border-slate-200 hover:border-purple-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-800">
                            {edu.degree}
                          </div>
                          {edu.institution && (
                            <div className="text-sm text-slate-500">
                              {edu.institution}
                              {edu.year && ` (${edu.year})`}
                            </div>
                          )}
                          {edu.classifiedLabel && (
                            <div className="mt-1 flex items-center gap-2">
                              <span className="text-xs text-slate-400">Geclassificeerd als:</span>
                              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                                {edu.classifiedLabel}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {edu.classifiedLabel && (
                            <>
                              <button
                                onClick={() => handleEduCorrectness(edu.id, true)}
                                className={`p-1.5 rounded transition-colors ${
                                  edu.isCorrect === true
                                    ? 'bg-emerald-100 text-emerald-600'
                                    : 'text-slate-400 hover:text-emerald-500 hover:bg-emerald-50'
                                }`}
                                title="Correcte classificatie"
                              >
                                <ThumbsUp className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleEduCorrectness(edu.id, false)}
                                className={`p-1.5 rounded transition-colors ${
                                  edu.isCorrect === false
                                    ? 'bg-rose-100 text-rose-600'
                                    : 'text-slate-400 hover:text-rose-500 hover:bg-rose-50'
                                }`}
                                title="Incorrecte classificatie"
                              >
                                <ThumbsDown className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleEduRemove(edu.id)}
                            className={`p-1.5 rounded transition-colors ${
                              edu.removed
                                ? 'bg-emerald-100 text-emerald-600'
                                : 'text-slate-400 hover:text-rose-500 hover:bg-rose-50'
                            }`}
                            title={edu.removed ? 'Herstellen' : 'Verwijderen'}
                          >
                            {edu.removed ? <Plus className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Skills Section */}
          {skills.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleSection('skills')}
                className="w-full px-4 py-3 flex items-center justify-between bg-emerald-50 hover:bg-emerald-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-left">
                    <span className="font-semibold text-slate-800">
                      Vaardigheden ({activeSkillsCount})
                    </span>
                    {skills.length !== activeSkillsCount && (
                      <span className="ml-2 text-xs text-slate-500">
                        ({skills.length - activeSkillsCount} verwijderd)
                      </span>
                    )}
                  </div>
                </div>
                {expandedSections.skills ? (
                  <ChevronUp className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                )}
              </button>

              {expandedSections.skills && (
                <div className="p-4">
                  <div className="flex flex-wrap gap-2">
                    {skills.map((skill) => (
                      <div
                        key={skill.id}
                        className={`group inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border transition-all ${
                          skill.removed
                            ? 'bg-slate-50 border-slate-200 opacity-50'
                            : skill.source === 'direct'
                            ? 'bg-emerald-50 border-emerald-200'
                            : skill.source === 'education'
                            ? 'bg-purple-50 border-purple-200'
                            : 'bg-blue-50 border-blue-200'
                        }`}
                      >
                        {skill.editing ? (
                          <input
                            type="text"
                            value={skill.editedLabel}
                            onChange={(e) => handleSkillLabelChange(skill.id, e.target.value)}
                            className="w-24 text-sm bg-transparent border-b border-slate-300 focus:border-emerald-500 outline-none"
                            autoFocus
                          />
                        ) : (
                          <span className="text-sm font-medium text-slate-700">
                            {skill.label}
                          </span>
                        )}
                        <span className={`text-[10px] px-1 py-0.5 rounded ${
                          skill.source === 'direct'
                            ? 'bg-emerald-100 text-emerald-600'
                            : skill.source === 'education'
                            ? 'bg-purple-100 text-purple-600'
                            : 'bg-blue-100 text-blue-600'
                        }`}>
                          {skill.sourceLabel}
                        </span>

                        {/* Action buttons - show on hover or when interacted */}
                        <div className="flex items-center gap-0.5 ml-1">
                          {skill.editing ? (
                            <button
                              onClick={() => handleSkillSave(skill.id)}
                              className="p-0.5 text-emerald-600 hover:bg-emerald-100 rounded"
                            >
                              <Save className="w-3 h-3" />
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => handleSkillCorrectness(skill.id, true)}
                                className={`p-0.5 rounded transition-colors ${
                                  skill.isCorrect === true
                                    ? 'text-emerald-600 bg-emerald-100'
                                    : 'text-slate-400 hover:text-emerald-500'
                                }`}
                              >
                                <ThumbsUp className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleSkillCorrectness(skill.id, false)}
                                className={`p-0.5 rounded transition-colors ${
                                  skill.isCorrect === false
                                    ? 'text-rose-600 bg-rose-100'
                                    : 'text-slate-400 hover:text-rose-500'
                                }`}
                              >
                                <ThumbsDown className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleSkillEdit(skill.id)}
                                className="p-0.5 text-slate-400 hover:text-blue-500 rounded"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleSkillRemove(skill.id)}
                            className={`p-0.5 rounded transition-colors ${
                              skill.removed
                                ? 'text-emerald-600'
                                : 'text-slate-400 hover:text-rose-500'
                            }`}
                          >
                            {skill.removed ? <Plus className="w-3 h-3" /> : <X className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Legend */}
                  <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                      Direct uit CV
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-purple-400 rounded-full"></span>
                      Via opleiding
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                      Via beroep
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-sm text-slate-500">
            {activeSkillsCount + activeWorkCount + activeEduCount} items geselecteerd
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Annuleren
            </button>
            <button
              onClick={handleConfirm}
              className="px-5 py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg hover:from-blue-600 hover:to-indigo-600 transition-all shadow hover:shadow-lg flex items-center gap-2"
            >
              Toevoegen aan profiel
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CVDataReviewModal;
