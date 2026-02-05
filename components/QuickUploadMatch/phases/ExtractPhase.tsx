/**
 * ExtractPhase Component - Fase 3
 * Animatie voor tekst extractie (ontrafelen)
 */

import React, { useEffect, useState, useRef } from 'react';
import { FileText, CheckCircle } from 'lucide-react';
import { PhaseComponentProps } from '../../../types/quickMatch';

interface ExtractPhaseProps extends PhaseComponentProps {
  wordCount?: number;
  extractedWords?: string[]; // Real words from CV
}

const ExtractPhase: React.FC<ExtractPhaseProps> = ({
  isActive,
  isComplete,
  data,
  progress
}) => {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; word: string; delay: number }>>([]);
  const [documentOpen, setDocumentOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use real words from CV if available, otherwise fallback to sample
  const realWords = data?.extractedWords || [];
  const sampleWords = [
    'Ervaring', 'Skills', 'Opleiding', 'Kennis', 'Projecten',
    'Resultaten', 'Leiderschap', 'Analyse', 'Communicatie', 'Teamwork',
    'Innovatie', 'Strategie', 'Development', 'Management', 'Design'
  ];

  // Prefer real words, limit to 15 for animation
  const displayWords = realWords.length > 0
    ? realWords.slice(0, 15)
    : sampleWords;

  useEffect(() => {
    if (isActive) {
      // Open document
      setTimeout(() => setDocumentOpen(true), 300);

      // Create particles
      const newParticles = displayWords.map((word, idx) => ({
        id: idx,
        x: (Math.random() - 0.5) * 200,
        y: (Math.random() - 0.5) * 150 + 50,
        word,
        delay: idx * 100
      }));

      setTimeout(() => {
        setParticles(newParticles);
      }, 800);

      return () => {
        setParticles([]);
        setDocumentOpen(false);
      };
    }
  }, [isActive, displayWords.length]);

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col items-center justify-center min-h-[300px]
                  transition-opacity duration-500 ${isActive ? 'opacity-100' : isComplete ? 'opacity-50' : 'opacity-30'}`}
    >
      {/* Document */}
      <div className="relative">
        {/* Document body */}
        <div
          className={`relative w-20 h-28 bg-white rounded-lg shadow-xl border-2 border-slate-200
                      transition-all duration-700 overflow-hidden
                      ${documentOpen ? 'scale-110' : 'scale-100'}`}
        >
          {/* Document lines */}
          <div className="absolute inset-3 space-y-2">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className={`h-1.5 bg-slate-200 rounded transition-all duration-500
                           ${documentOpen ? 'opacity-0 translate-x-full' : 'opacity-100'}`}
                style={{
                  transitionDelay: `${i * 100}ms`,
                  width: `${80 - i * 10}%`
                }}
              />
            ))}
          </div>

          {/* Success state */}
          {isComplete && (
            <div className="absolute inset-0 flex items-center justify-center bg-emerald-50">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
            </div>
          )}
        </div>

        {/* Floating particles */}
        {isActive && !isComplete && particles.map((particle) => (
          <div
            key={particle.id}
            className="absolute top-1/2 left-1/2 pointer-events-none animate-float"
            style={{
              transform: `translate(${particle.x}px, ${particle.y}px)`,
              opacity: 0,
              animation: `floatParticle 2s ease-out ${particle.delay}ms forwards`
            }}
          >
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full whitespace-nowrap">
              {particle.word}
            </span>
          </div>
        ))}
      </div>

      {/* Word count animation */}
      {isActive && !isComplete && (
        <div className="mt-8 text-center">
          <div className="text-3xl font-bold text-emerald-600 tabular-nums">
            {Math.round((progress / 100) * (data?.wordCount || 1500))}
          </div>
          <div className="text-xs text-slate-500 mt-1">woorden geanalyseerd</div>
        </div>
      )}

      {/* Status */}
      <p className={`mt-4 text-sm font-medium ${isComplete ? 'text-emerald-600' : 'text-slate-500'}`}>
        {isComplete ? 'Inhoud geanalyseerd' : 'Inhoud analyseren...'}
      </p>

      {/* CSS for particle animation */}
      <style>{`
        @keyframes floatParticle {
          0% {
            opacity: 0;
            transform: translate(0, 0) scale(0.5);
          }
          20% {
            opacity: 1;
          }
          100% {
            opacity: 0.5;
            transform: translate(var(--tx, 100px), var(--ty, -50px)) scale(1);
          }
        }
      `}</style>
    </div>
  );
};

export default ExtractPhase;
