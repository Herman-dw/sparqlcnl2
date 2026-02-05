/**
 * ClassifyPhase Component - Fase 5
 * Animatie voor CNL classificatie en skills afleiding
 */

import React, { useEffect, useState, useMemo } from 'react';
import { GitBranch, ArrowRight, Sparkles, CheckCircle, Database } from 'lucide-react';
import { PhaseComponentProps, AggregatedSkills, QuickExtractedData } from '../../../types/quickMatch';

interface ClassifyPhaseProps extends PhaseComponentProps {
  aggregatedSkills?: AggregatedSkills;
  extractedData?: QuickExtractedData;
}

interface ClassificationItem {
  id: string;
  original: string;
  cnlLabel: string;
  derivedSkills: string[];
  type: 'occupation' | 'education';
}

const ClassifyPhase: React.FC<ClassifyPhaseProps> = ({
  isActive,
  isComplete,
  data,
  progress,
  aggregatedSkills,
  extractedData
}) => {
  const [classifiedItems, setClassifiedItems] = useState<number[]>([]);
  const [showSkillsCount, setShowSkillsCount] = useState(false);

  // Demo classification items (fallback)
  const demoItems: ClassificationItem[] = [
    {
      id: '1',
      original: 'Software Developer',
      cnlLabel: 'Softwareontwikkelaar',
      derivedSkills: ['Programmeren', 'Software testen', 'Systeem analyse'],
      type: 'occupation'
    },
    {
      id: '2',
      original: 'HBO Informatica',
      cnlLabel: 'Bachelor Informatica',
      derivedSkills: ['Databases', 'Algoritmen', 'Netwerken'],
      type: 'education'
    },
    {
      id: '3',
      original: 'Project Manager',
      cnlLabel: 'Projectmanager ICT',
      derivedSkills: ['Planning', 'Stakeholder management', 'Risicobeheer'],
      type: 'occupation'
    }
  ];

  // Build real classification items from extractedData if available
  const realItems = useMemo((): ClassificationItem[] => {
    if (!extractedData) return [];

    const items: ClassificationItem[] = [];

    // Add classified experiences (occupations)
    if (extractedData.classifiedExperiences) {
      extractedData.classifiedExperiences.slice(0, 3).forEach((exp, idx) => {
        if (exp.cnlClassification) {
          items.push({
            id: `exp-${idx}`,
            original: exp.jobTitle,
            cnlLabel: exp.cnlClassification.prefLabel,
            derivedSkills: exp.relatedSkills?.slice(0, 3).map(s => s.label) || [],
            type: 'occupation'
          });
        }
      });
    }

    // Add classified education
    if (extractedData.classifiedEducation) {
      extractedData.classifiedEducation.slice(0, 2).forEach((edu, idx) => {
        if (edu.cnlClassification) {
          items.push({
            id: `edu-${idx}`,
            original: edu.degree,
            cnlLabel: edu.cnlClassification.prefLabel,
            derivedSkills: edu.relatedSkills?.slice(0, 3).map(s => s.label) || [],
            type: 'education'
          });
        }
      });
    }

    return items;
  }, [extractedData]);

  // Use real items if available, otherwise demo
  const items = realItems.length > 0 ? realItems : demoItems;

  // Calculate total derived skills from aggregatedSkills if available
  const totalDerivedSkillsFromAggregated = aggregatedSkills
    ? (aggregatedSkills.bySource?.education || 0) + (aggregatedSkills.bySource?.occupation || 0)
    : null;

  useEffect(() => {
    if (isActive) {
      // Classify items one by one
      items.forEach((_, idx) => {
        setTimeout(() => {
          setClassifiedItems(prev => [...prev, idx]);
        }, 800 + idx * 1000);
      });

      // Show skills count at the end
      setTimeout(() => {
        setShowSkillsCount(true);
      }, 800 + items.length * 1000 + 500);

      return () => {
        setClassifiedItems([]);
        setShowSkillsCount(false);
      };
    }
  }, [isActive, items.length]);

  // Use real count if available, otherwise calculate from items
  const totalDerivedSkills = totalDerivedSkillsFromAggregated !== null
    ? totalDerivedSkillsFromAggregated
    : items.reduce((sum, item) => sum + item.derivedSkills.length, 0);

  return (
    <div className={`transition-opacity duration-500 ${isActive ? 'opacity-100' : isComplete ? 'opacity-50' : 'opacity-30'}`}>
      {/* CNL Database indicator */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <Database className="w-5 h-5 text-emerald-500" />
        <span className="text-sm font-medium text-slate-600">CompetentNL Taxonomie</span>
        {isActive && !isComplete && (
          <span className="flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        )}
      </div>

      {/* Classification items */}
      <div className="space-y-4 max-w-lg mx-auto">
        {items.map((item, idx) => {
          const isClassified = classifiedItems.includes(idx);
          const isOccupation = item.type === 'occupation';

          return (
            <div
              key={item.id}
              className={`bg-white rounded-xl border-2 overflow-hidden transition-all duration-500
                         ${isClassified ? 'border-emerald-200 shadow-md' : 'border-slate-200'}`}
            >
              {/* Header row */}
              <div className="flex items-center gap-3 p-3 bg-slate-50">
                {/* Original label */}
                <div className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium
                                ${isOccupation ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                  {item.original}
                </div>

                {/* Arrow */}
                <ArrowRight className={`w-5 h-5 transition-all duration-500
                                       ${isClassified ? 'text-emerald-500' : 'text-slate-300'}`} />

                {/* CNL label */}
                <div className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-500
                                ${isClassified ? 'bg-emerald-50 text-emerald-700 opacity-100' : 'bg-slate-100 text-slate-400 opacity-50'}`}>
                  {isClassified ? item.cnlLabel : '...'}
                </div>
              </div>

              {/* Derived skills */}
              {isClassified && (
                <div className="p-3 border-t border-slate-100">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Afgeleide skills
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.derivedSkills.map((skill, skillIdx) => (
                      <span
                        key={skillIdx}
                        className="text-xs px-2 py-1 bg-amber-50 text-amber-700 rounded-full
                                  animate-fadeIn"
                        style={{ animationDelay: `${skillIdx * 100}ms` }}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Skills summary */}
      {(showSkillsCount || isComplete) && (
        <div className="mt-6 text-center animate-fadeIn">
          <div className="inline-flex items-center gap-3 px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-200">
            <GitBranch className="w-5 h-5 text-emerald-500" />
            <div>
              <span className="text-2xl font-bold text-emerald-600">+{totalDerivedSkills}</span>
              <span className="text-sm text-emerald-600 ml-2">skills via taxonomie</span>
            </div>
          </div>
        </div>
      )}

      {/* Status */}
      <div className="mt-4 text-center">
        {isComplete ? (
          <div className="flex items-center justify-center gap-2 text-emerald-600">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">Skills afgeleid via CompetentNL</span>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Skills afleiden via taxonomie...</p>
        )}
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default ClassifyPhase;
