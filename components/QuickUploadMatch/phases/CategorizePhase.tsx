/**
 * CategorizePhase Component - Fase 4
 * Animatie voor categoriseren in vakjes
 */

import React, { useEffect, useState } from 'react';
import { Briefcase, GraduationCap, Sparkles, CheckCircle } from 'lucide-react';
import { PhaseComponentProps } from '../../../types/quickMatch';

interface CategoryBox {
  id: string;
  type: 'work' | 'education' | 'skill';
  label: string;
  icon: React.FC<{ className?: string }>;
  items: string[];
  color: string;
}

interface CategorizePhaseProps extends PhaseComponentProps {
  categorizedData?: {
    work: string[];
    education: string[];
    skills: string[];
  };
}

const CategorizePhase: React.FC<CategorizePhaseProps> = ({
  isActive,
  isComplete,
  data,
  progress
}) => {
  const [boxesVisible, setBoxesVisible] = useState(false);
  const [filledItems, setFilledItems] = useState<Record<string, number>>({
    work: 0,
    education: 0,
    skill: 0
  });

  // Demo data
  const demoData = {
    work: ['Software Developer', 'Team Lead', 'Consultant'],
    education: ['HBO Informatica', 'MSc Computer Science'],
    skills: ['Python', 'JavaScript', 'SQL', 'Agile', 'Leadership']
  };

  const categorizedData = data?.categorizedData || demoData;

  const categories: CategoryBox[] = [
    {
      id: 'work',
      type: 'work',
      label: 'Werkervaring',
      icon: Briefcase,
      items: categorizedData.work,
      color: 'blue'
    },
    {
      id: 'education',
      type: 'education',
      label: 'Opleiding',
      icon: GraduationCap,
      items: categorizedData.education,
      color: 'purple'
    },
    {
      id: 'skill',
      type: 'skill',
      label: 'Vaardigheden',
      icon: Sparkles,
      items: categorizedData.skills,
      color: 'emerald'
    }
  ];

  useEffect(() => {
    if (isActive) {
      // Show boxes
      setTimeout(() => setBoxesVisible(true), 200);

      // Fill items progressively
      const interval = setInterval(() => {
        setFilledItems(prev => {
          const newState = { ...prev };
          let changed = false;

          categories.forEach(cat => {
            if (prev[cat.type] < cat.items.length) {
              newState[cat.type] = prev[cat.type] + 1;
              changed = true;
            }
          });

          if (!changed) {
            clearInterval(interval);
          }
          return newState;
        });
      }, 300);

      return () => {
        clearInterval(interval);
        setBoxesVisible(false);
        setFilledItems({ work: 0, education: 0, skill: 0 });
      };
    }
  }, [isActive]);

  const getColorClasses = (color: string, type: 'bg' | 'border' | 'text') => {
    const colors: Record<string, Record<string, string>> = {
      blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600' },
      purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-600' },
      emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600' }
    };
    return colors[color]?.[type] || '';
  };

  return (
    <div className={`transition-opacity duration-500 ${isActive ? 'opacity-100' : isComplete ? 'opacity-50' : 'opacity-30'}`}>
      {/* Category boxes */}
      <div className="flex gap-4 justify-center">
        {categories.map((category, idx) => {
          const Icon = category.icon;
          const visibleItems = category.items.slice(0, filledItems[category.type]);

          return (
            <div
              key={category.id}
              className={`w-40 transition-all duration-500
                         ${boxesVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ transitionDelay: `${idx * 150}ms` }}
            >
              {/* Header */}
              <div className={`flex items-center gap-2 p-3 rounded-t-xl border-2 border-b-0
                              ${getColorClasses(category.color, 'bg')}
                              ${getColorClasses(category.color, 'border')}`}>
                <Icon className={`w-4 h-4 ${getColorClasses(category.color, 'text')}`} />
                <span className={`text-sm font-semibold ${getColorClasses(category.color, 'text')}`}>
                  {category.label}
                </span>
              </div>

              {/* Items container */}
              <div className={`min-h-[120px] p-3 bg-white rounded-b-xl border-2 border-t-0
                              ${getColorClasses(category.color, 'border')}`}>
                <div className="space-y-2">
                  {visibleItems.map((item, itemIdx) => (
                    <div
                      key={itemIdx}
                      className={`text-xs p-2 rounded-lg transition-all duration-300
                                 ${getColorClasses(category.color, 'bg')}
                                 ${getColorClasses(category.color, 'text')}`}
                      style={{
                        animation: 'slideIn 0.3s ease-out forwards',
                        animationDelay: `${itemIdx * 100}ms`
                      }}
                    >
                      {item}
                    </div>
                  ))}
                </div>

                {/* Counter */}
                <div className="mt-2 pt-2 border-t border-slate-100 text-center">
                  <span className={`text-lg font-bold ${getColorClasses(category.color, 'text')}`}>
                    {filledItems[category.type]}
                  </span>
                  <span className="text-xs text-slate-400 ml-1">
                    / {category.items.length}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Status */}
      <div className="mt-6 text-center">
        {isComplete ? (
          <div className="flex items-center justify-center gap-2 text-emerald-600">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">Gegevens gecategoriseerd</span>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Gegevens categoriseren...</p>
        )}
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
};

export default CategorizePhase;
