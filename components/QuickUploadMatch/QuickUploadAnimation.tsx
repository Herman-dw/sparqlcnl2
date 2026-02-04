/**
 * QuickUploadAnimation Component
 * Orchestrator voor de 6 fase animaties
 */

import React from 'react';
import {
  Upload,
  Shield,
  FileText,
  LayoutGrid,
  GitBranch,
  Target,
  CheckCircle
} from 'lucide-react';
import {
  QuickUploadAnimationProps,
  QuickMatchPhase,
  PHASE_CONFIG,
  getPhaseIndex,
  isPhaseComplete
} from '../../types/quickMatch';

// Import phase components
import UploadPhase from './phases/UploadPhase';
import AnonymizePhase from './phases/AnonymizePhase';
import ExtractPhase from './phases/ExtractPhase';
import CategorizePhase from './phases/CategorizePhase';
import ClassifyPhase from './phases/ClassifyPhase';
import MatchPhase from './phases/MatchPhase';

const phaseIcons: Record<string, React.FC<{ className?: string }>> = {
  uploading: Upload,
  anonymizing: Shield,
  extracting: FileText,
  categorizing: LayoutGrid,
  classifying: GitBranch,
  matching: Target
};

const QuickUploadAnimation: React.FC<QuickUploadAnimationProps> = ({
  phase,
  progress,
  animationData,
  anonymizationData,
  extractedData,
  aggregatedSkills
}) => {
  const currentPhaseIndex = getPhaseIndex(phase);

  // Get the label for current phase
  const getCurrentPhaseLabel = () => {
    const config = PHASE_CONFIG.find(p => p.id === phase);
    return config?.activeLabel || 'Verwerken...';
  };

  // Render the active phase animation
  const renderActivePhase = () => {
    const phaseProps = {
      isActive: true,
      isComplete: false,
      progress,
      data: {}
    };

    switch (phase) {
      case 'uploading':
        return (
          <UploadPhase
            {...phaseProps}
            data={{
              fileName: animationData.fileName,
              fileSize: animationData.fileSize
            }}
          />
        );
      case 'anonymizing':
        return (
          <AnonymizePhase
            {...phaseProps}
            piiData={anonymizationData || undefined}
          />
        );
      case 'extracting':
        return (
          <ExtractPhase
            {...phaseProps}
            data={{
              wordCount: animationData.wordCount || 1500
            }}
          />
        );
      case 'categorizing':
        return (
          <CategorizePhase
            {...phaseProps}
            data={{
              categorizedData: extractedData ? {
                work: extractedData.workExperiences.map(w => w.jobTitle),
                education: extractedData.education.map(e => e.degree),
                skills: extractedData.directSkills
              } : undefined
            }}
          />
        );
      case 'classifying':
        return (
          <ClassifyPhase
            {...phaseProps}
            aggregatedSkills={aggregatedSkills || undefined}
          />
        );
      case 'matching':
        return (
          <MatchPhase
            {...phaseProps}
            data={{
              topMatches: animationData.topMatches
            }}
          />
        );
      case 'complete':
        return (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-20 h-20 bg-emerald-100 rounded-2xl flex items-center justify-center mb-4">
              <CheckCircle className="w-10 h-10 text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-800">Klaar!</h3>
            <p className="text-sm text-slate-500 mt-1">Resultaten worden geladen...</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Main animation area */}
      <div className="flex-1 flex items-center justify-center p-6 min-h-[350px]">
        {renderActivePhase()}
      </div>

      {/* Progress section */}
      <div className="border-t border-slate-200 bg-slate-50 p-6">
        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-slate-600">
              {getCurrentPhaseLabel()}
            </span>
            <span className="text-sm font-bold text-emerald-600">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-green-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Phase indicators */}
        <div className="flex justify-between items-center">
          {PHASE_CONFIG.map((phaseConfig, idx) => {
            const Icon = phaseIcons[phaseConfig.id] || Target;
            const isCurrentPhase = phase === phaseConfig.id;
            const isPastPhase = isPhaseComplete(phase, phaseConfig.id);
            const isFuturePhase = !isCurrentPhase && !isPastPhase;

            return (
              <div
                key={phaseConfig.id}
                className="flex flex-col items-center"
              >
                {/* Icon */}
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300
                             ${isPastPhase ? 'bg-emerald-100' : isCurrentPhase ? 'bg-emerald-500' : 'bg-slate-200'}`}
                >
                  {isPastPhase ? (
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <Icon className={`w-5 h-5 ${isCurrentPhase ? 'text-white' : 'text-slate-400'}`} />
                  )}
                </div>

                {/* Label */}
                <span
                  className={`mt-2 text-xs font-medium transition-colors duration-300
                             ${isPastPhase ? 'text-emerald-600' : isCurrentPhase ? 'text-slate-700' : 'text-slate-400'}`}
                >
                  {phaseConfig.label}
                </span>

                {/* Active indicator */}
                {isCurrentPhase && (
                  <div className="mt-1 w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default QuickUploadAnimation;
