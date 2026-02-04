/**
 * UploadPhase Component - Fase 1
 * Animatie voor CV upload
 */

import React, { useEffect, useState } from 'react';
import { Upload, FileText, CheckCircle } from 'lucide-react';
import { PhaseComponentProps } from '../../../types/quickMatch';

interface UploadPhaseProps extends PhaseComponentProps {
  fileName?: string;
  fileSize?: number;
}

const UploadPhase: React.FC<UploadPhaseProps> = ({
  isActive,
  isComplete,
  data,
  progress
}) => {
  const [showDocument, setShowDocument] = useState(false);
  const [showGlow, setShowGlow] = useState(false);

  useEffect(() => {
    if (isActive) {
      // Document flies in
      const timer1 = setTimeout(() => setShowDocument(true), 200);
      // Glow effect
      const timer2 = setTimeout(() => setShowGlow(true), 600);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [isActive]);

  return (
    <div className={`flex flex-col items-center justify-center transition-opacity duration-500 ${isActive ? 'opacity-100' : isComplete ? 'opacity-50' : 'opacity-30'}`}>
      {/* Document animation */}
      <div className="relative">
        {/* Glow background */}
        <div
          className={`absolute inset-0 bg-emerald-400/30 rounded-3xl blur-xl transition-all duration-1000
                      ${showGlow ? 'scale-150 opacity-100' : 'scale-100 opacity-0'}`}
        />

        {/* Document */}
        <div
          className={`relative w-24 h-32 bg-white rounded-xl shadow-2xl border-2 border-emerald-200
                      flex items-center justify-center transition-all duration-700
                      ${showDocument ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-12 opacity-0 scale-90'}`}
        >
          {isComplete ? (
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          ) : (
            <FileText className="w-10 h-10 text-slate-400" />
          )}

          {/* File type badge */}
          <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded-lg">
            CV
          </div>
        </div>

        {/* Upload arrow animation */}
        {isActive && !isComplete && (
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2">
            <Upload
              className="w-6 h-6 text-emerald-500 animate-bounce"
            />
          </div>
        )}
      </div>

      {/* Progress ring */}
      {isActive && !isComplete && (
        <div className="mt-8 relative w-16 h-16">
          <svg className="w-full h-full -rotate-90">
            <circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="4"
            />
            <circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              stroke="#10b981"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${(progress / 100) * 176} 176`}
              className="transition-all duration-300"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold text-slate-600">{Math.round(progress)}%</span>
          </div>
        </div>
      )}

      {/* Status text */}
      <p className={`mt-4 text-sm font-medium transition-colors duration-300
                    ${isComplete ? 'text-emerald-600' : 'text-slate-500'}`}>
        {isComplete ? 'CV ontvangen' : 'CV uploaden...'}
      </p>

      {/* File info */}
      {data?.fileName && (
        <p className="mt-1 text-xs text-slate-400 truncate max-w-[200px]">
          {data.fileName}
        </p>
      )}
    </div>
  );
};

export default UploadPhase;
