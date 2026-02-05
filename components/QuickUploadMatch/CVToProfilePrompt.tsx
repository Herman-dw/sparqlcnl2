/**
 * CVToProfilePrompt Component
 * Vraagt de gebruiker of CV data naar het profiel moet worden overgenomen
 */

import React from 'react';
import { UserCircle, ArrowRight, X, Briefcase, GraduationCap, Sparkles } from 'lucide-react';
import { QuickExtractedData, AggregatedSkills } from '../../types/quickMatch';

interface CVToProfilePromptProps {
  extractedData: QuickExtractedData | null;
  aggregatedSkills: AggregatedSkills | null;
  onConfirm: () => void;
  onSkip: () => void;
}

const CVToProfilePrompt: React.FC<CVToProfilePromptProps> = ({
  extractedData,
  aggregatedSkills,
  onConfirm,
  onSkip
}) => {
  // Calculate counts for display
  const jobCount = extractedData?.workExperiences?.length || 0;
  const eduCount = extractedData?.education?.length || 0;
  const skillCount = aggregatedSkills?.totalCount || extractedData?.directSkills?.length || 0;

  const hasData = jobCount > 0 || eduCount > 0 || skillCount > 0;

  if (!hasData) {
    // No data to add, skip silently
    React.useEffect(() => {
      onSkip();
    }, [onSkip]);
    return null;
  }

  return (
    <div className="p-6 flex flex-col items-center text-center">
      {/* Icon */}
      <div className="w-20 h-20 bg-gradient-to-br from-emerald-100 to-green-100 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
        <UserCircle className="w-10 h-10 text-emerald-600" />
      </div>

      {/* Title */}
      <h3 className="text-xl font-bold text-slate-800 mb-2">
        CV toevoegen aan profiel?
      </h3>
      <p className="text-sm text-slate-500 max-w-md mb-6">
        We hebben de volgende gegevens uit je CV gehaald. Wil je deze toevoegen aan je profiel voor betere matchresultaten?
      </p>

      {/* Summary of what will be added */}
      <div className="w-full max-w-sm space-y-3 mb-6">
        {jobCount > 0 && (
          <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-blue-700">{jobCount} beroep{jobCount !== 1 ? 'en' : ''}</div>
              <div className="text-xs text-blue-500">
                {extractedData?.workExperiences?.slice(0, 2).map(w => w.jobTitle).join(', ')}
                {jobCount > 2 && ` +${jobCount - 2} meer`}
              </div>
            </div>
          </div>
        )}

        {eduCount > 0 && (
          <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl border border-purple-100">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-purple-600" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-purple-700">{eduCount} opleiding{eduCount !== 1 ? 'en' : ''}</div>
              <div className="text-xs text-purple-500">
                {extractedData?.education?.slice(0, 2).map(e => e.degree).join(', ')}
                {eduCount > 2 && ` +${eduCount - 2} meer`}
              </div>
            </div>
          </div>
        )}

        {skillCount > 0 && (
          <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-emerald-700">{skillCount} vaardighe{skillCount !== 1 ? 'den' : 'id'}</div>
              <div className="text-xs text-emerald-500">
                {aggregatedSkills?.combined?.slice(0, 3).join(', ') ||
                 extractedData?.directSkills?.slice(0, 3).join(', ')}
                {skillCount > 3 && ` +${skillCount - 3} meer`}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 w-full max-w-sm">
        <button
          onClick={onSkip}
          className="flex-1 px-5 py-3 text-sm font-medium text-slate-600
                   bg-white border border-slate-200 rounded-xl hover:bg-slate-50
                   transition-colors flex items-center justify-center gap-2"
        >
          <X className="w-4 h-4" />
          Niet nu
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 px-5 py-3 text-sm font-bold text-white
                   bg-gradient-to-r from-emerald-500 to-green-500 rounded-xl
                   hover:from-emerald-600 hover:to-green-600
                   transition-all shadow-lg hover:shadow-xl
                   flex items-center justify-center gap-2"
        >
          Toevoegen
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default CVToProfilePrompt;
