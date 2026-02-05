/**
 * MatchPhase Component - Fase 6
 * Animatie voor matching uitvoeren
 */

import React, { useEffect, useState } from 'react';
import { Target, CheckCircle, TrendingUp, Award } from 'lucide-react';
import { PhaseComponentProps } from '../../../types/quickMatch';

interface TopMatch {
  label: string;
  score: number;
}

interface MatchPhaseProps extends PhaseComponentProps {
  topMatches?: TopMatch[];
  totalMatches?: number;
}

const MatchPhase: React.FC<MatchPhaseProps> = ({
  isActive,
  isComplete,
  data,
  progress
}) => {
  const [matchProgress, setMatchProgress] = useState(0);
  const [revealedMatches, setRevealedMatches] = useState<number[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);

  // Demo top matches
  const demoMatches: TopMatch[] = [
    { label: 'Software Architect', score: 92 },
    { label: 'Senior Developer', score: 87 },
    { label: 'Technical Lead', score: 84 },
    { label: 'DevOps Engineer', score: 78 },
    { label: 'Solutions Consultant', score: 75 }
  ];

  const matches = data?.topMatches || demoMatches;

  useEffect(() => {
    if (isActive) {
      // Progress animation
      const progressInterval = setInterval(() => {
        setMatchProgress(prev => {
          if (prev >= 100) {
            clearInterval(progressInterval);
            return 100;
          }
          return prev + 5;
        });
      }, 100);

      // Reveal matches one by one after progress completes
      const revealTimeout = setTimeout(() => {
        matches.forEach((_, idx) => {
          setTimeout(() => {
            setRevealedMatches(prev => [...prev, idx]);
            // Confetti on first high score
            if (idx === 0) {
              setShowConfetti(true);
              setTimeout(() => setShowConfetti(false), 2000);
            }
          }, idx * 300);
        });
      }, 2000);

      return () => {
        clearInterval(progressInterval);
        clearTimeout(revealTimeout);
        setMatchProgress(0);
        setRevealedMatches([]);
        setShowConfetti(false);
      };
    }
  }, [isActive, matches.length]);

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-emerald-600 bg-emerald-50';
    if (score >= 70) return 'text-blue-600 bg-blue-50';
    return 'text-amber-600 bg-amber-50';
  };

  const getBarColor = (score: number) => {
    if (score >= 85) return 'bg-gradient-to-r from-emerald-400 to-emerald-500';
    if (score >= 70) return 'bg-gradient-to-r from-blue-400 to-blue-500';
    return 'bg-gradient-to-r from-amber-400 to-amber-500';
  };

  return (
    <div className={`transition-opacity duration-500 ${isActive ? 'opacity-100' : isComplete ? 'opacity-50' : 'opacity-30'}`}>
      {/* Matching indicator */}
      <div className="flex flex-col items-center mb-6">
        <div className={`w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-500
                        ${isComplete ? 'bg-emerald-100' : 'bg-emerald-500'}`}>
          {isComplete ? (
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          ) : (
            <Target className={`w-10 h-10 text-white ${matchProgress < 100 ? 'animate-pulse' : ''}`} />
          )}
        </div>

        {/* Progress bar */}
        {!isComplete && matchProgress < 100 && (
          <div className="mt-4 w-64">
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-green-500 transition-all duration-300"
                style={{ width: `${matchProgress}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 text-center mt-2">
              {matchProgress}% beroepen geanalyseerd
            </p>
          </div>
        )}
      </div>

      {/* Top matches */}
      {revealedMatches.length > 0 && (
        <div className="max-w-md mx-auto space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <Award className="w-5 h-5 text-emerald-500" />
            <span className="text-sm font-semibold text-slate-700">Top Matches</span>
          </div>

          {matches.map((match, idx) => {
            const isRevealed = revealedMatches.includes(idx);

            return (
              <div
                key={idx}
                className={`flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200
                           shadow-sm transition-all duration-500
                           ${isRevealed ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
              >
                {/* Rank badge */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold
                                ${idx === 0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-600'}`}>
                  {idx + 1}
                </div>

                {/* Label and bar */}
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700">{match.label}</span>
                    <span className={`text-sm font-bold px-2 py-0.5 rounded ${getScoreColor(match.score)}`}>
                      {match.score}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getBarColor(match.score)} transition-all duration-700`}
                      style={{
                        width: isRevealed ? `${match.score}%` : '0%',
                        transitionDelay: '200ms'
                      }}
                    />
                  </div>
                </div>

                {/* Trend indicator for top match */}
                {idx === 0 && isRevealed && (
                  <TrendingUp className="w-5 h-5 text-emerald-500 animate-bounce" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Confetti effect */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-3 h-3 rounded-full animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ec4899'][Math.floor(Math.random() * 4)],
                animationDelay: `${Math.random() * 500}ms`
              }}
            />
          ))}
        </div>
      )}

      {/* Status */}
      <div className="mt-6 text-center">
        {isComplete ? (
          <div className="flex items-center justify-center gap-2 text-emerald-600">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">{data?.totalMatches || matches.length} matches gevonden!</span>
          </div>
        ) : matchProgress >= 100 ? (
          <p className="text-sm text-slate-500">Resultaten voorbereiden...</p>
        ) : (
          <p className="text-sm text-slate-500">Beste matches zoeken...</p>
        )}
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes confetti {
          0% {
            transform: translateY(-10vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-confetti {
          animation: confetti 3s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default MatchPhase;
