/**
 * AnonymizePhase Component - Fase 2
 * Animatie voor PII detectie en vervanging
 */

import React, { useEffect, useState } from 'react';
import { Shield, ArrowRight, CheckCircle, User, Mail, Phone, MapPin } from 'lucide-react';
import { PhaseComponentProps, DetectedPII, PIIType } from '../../../types/quickMatch';

interface AnonymizePhaseProps extends PhaseComponentProps {
  piiData?: {
    detectedPII: DetectedPII[];
    piiCount: number;
  };
}

const getPIIIcon = (type: PIIType) => {
  switch (type) {
    case 'NAME': return User;
    case 'EMAIL': return Mail;
    case 'PHONE': return Phone;
    case 'ADDRESS': return MapPin;
    default: return User;
  }
};

const getPIIColor = (type: PIIType) => {
  switch (type) {
    case 'NAME': return 'bg-blue-100 text-blue-600';
    case 'EMAIL': return 'bg-purple-100 text-purple-600';
    case 'PHONE': return 'bg-amber-100 text-amber-600';
    case 'ADDRESS': return 'bg-rose-100 text-rose-600';
    default: return 'bg-slate-100 text-slate-600';
  }
};

const AnonymizePhase: React.FC<AnonymizePhaseProps> = ({
  isActive,
  isComplete,
  data,
  progress
}) => {
  const [revealedItems, setRevealedItems] = useState<number[]>([]);
  const [shieldPulse, setShieldPulse] = useState(false);

  // Demo PII items for animation (used if no real data)
  const demoItems: DetectedPII[] = [
    { id: '1', original: 'Jan ***', replacement: '[NAAM]', type: 'NAME', confidence: 0.95 },
    { id: '2', original: 'jan@***.nl', replacement: '[EMAIL]', type: 'EMAIL', confidence: 0.98 },
    { id: '3', original: '06-***', replacement: '[TELEFOON]', type: 'PHONE', confidence: 0.92 },
    { id: '4', original: 'Hoofdstr***', replacement: '[ADRES]', type: 'ADDRESS', confidence: 0.88 },
  ];

  const piiItems = data?.piiData?.detectedPII || demoItems;

  useEffect(() => {
    if (isActive) {
      // Reveal items one by one
      piiItems.forEach((_, idx) => {
        setTimeout(() => {
          setRevealedItems(prev => [...prev, idx]);
        }, 400 + idx * 500);
      });

      // Shield pulse
      const pulseInterval = setInterval(() => {
        setShieldPulse(prev => !prev);
      }, 1000);

      return () => {
        clearInterval(pulseInterval);
        setRevealedItems([]);
      };
    }
  }, [isActive, piiItems.length]);

  return (
    <div className={`flex flex-col items-center transition-opacity duration-500 ${isActive ? 'opacity-100' : isComplete ? 'opacity-50' : 'opacity-30'}`}>
      {/* Shield icon */}
      <div className="relative mb-6">
        <div
          className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500
                      ${isComplete ? 'bg-emerald-100' : 'bg-emerald-500'}
                      ${shieldPulse && isActive ? 'scale-110' : 'scale-100'}`}
        >
          {isComplete ? (
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          ) : (
            <Shield className="w-8 h-8 text-white" />
          )}
        </div>
        {/* Pulse ring */}
        {isActive && !isComplete && (
          <div className="absolute inset-0 rounded-2xl border-2 border-emerald-400 animate-ping opacity-50" />
        )}
      </div>

      {/* PII transformation list */}
      <div className="w-full max-w-sm space-y-3">
        {piiItems.map((item, idx) => {
          const Icon = getPIIIcon(item.type);
          const isRevealed = revealedItems.includes(idx);
          const colorClass = getPIIColor(item.type);

          return (
            <div
              key={item.id}
              className={`flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200
                          shadow-sm transition-all duration-500
                          ${isRevealed ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
            >
              {/* Icon */}
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorClass}`}>
                <Icon className="w-4 h-4" />
              </div>

              {/* Original (fading out) */}
              <span
                className={`flex-1 font-mono text-sm transition-all duration-500
                           ${isRevealed ? 'opacity-30 line-through text-rose-500' : 'opacity-100 text-slate-600'}`}
              >
                {item.original}
              </span>

              {/* Arrow */}
              <ArrowRight
                className={`w-4 h-4 transition-all duration-500
                           ${isRevealed ? 'text-emerald-500 opacity-100' : 'text-slate-300 opacity-50'}`}
              />

              {/* Replacement (appearing) */}
              <span
                className={`font-mono text-sm font-bold transition-all duration-500
                           ${isRevealed ? 'opacity-100 text-emerald-600 scale-100' : 'opacity-0 scale-90'}`}
              >
                {item.replacement}
              </span>
            </div>
          );
        })}
      </div>

      {/* Counter */}
      <div className={`mt-6 flex items-center gap-2 text-sm transition-all duration-500
                      ${isComplete ? 'text-emerald-600' : 'text-slate-500'}`}>
        <Shield className="w-4 h-4" />
        <span>
          {isComplete
            ? `${piiItems.length} persoonsgegevens beveiligd`
            : `${revealedItems.length} / ${piiItems.length} verwerkt...`}
        </span>
      </div>
    </div>
  );
};

export default AnonymizePhase;
