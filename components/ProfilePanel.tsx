/**
 * ProfilePanel Component
 * Displays the current session profile in a collapsible panel
 */

import React, { useState } from 'react';
import {
  ChevronDown, ChevronUp, Sparkles, BookOpen, ListChecks, Briefcase,
  X, Trash2
} from 'lucide-react';
import { SessionProfile, ProfileItemWithSource } from '../types/profile';

interface ProfilePanelProps {
  profile: SessionProfile;
  onRemoveItem?: (category: keyof SessionProfile, uri: string) => void;
  onClearProfile?: () => void;
}

interface CategorySectionProps {
  title: string;
  icon: React.ReactNode;
  items: ProfileItemWithSource[];
  color: string;
  onRemove?: (uri: string) => void;
  defaultExpanded?: boolean;
}

const CategorySection: React.FC<CategorySectionProps> = ({
  title,
  icon,
  items,
  color,
  onRemove,
  defaultExpanded = false
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (items.length === 0) return null;

  const colorClasses: Record<string, { bg: string; text: string; border: string; badge: string }> = {
    emerald: {
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      text: 'text-emerald-700 dark:text-emerald-300',
      border: 'border-emerald-200 dark:border-emerald-800',
      badge: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-400'
    },
    blue: {
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      text: 'text-blue-700 dark:text-blue-300',
      border: 'border-blue-200 dark:border-blue-800',
      badge: 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400'
    },
    purple: {
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      text: 'text-purple-700 dark:text-purple-300',
      border: 'border-purple-200 dark:border-purple-800',
      badge: 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400'
    },
    amber: {
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      text: 'text-amber-700 dark:text-amber-300',
      border: 'border-amber-200 dark:border-amber-800',
      badge: 'bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-400'
    }
  };

  const colors = colorClasses[color] || colorClasses.emerald;

  return (
    <div className={`border rounded-lg overflow-hidden ${colors.border}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full px-3 py-2 flex items-center justify-between ${colors.bg} hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center gap-2">
          <span className={colors.text}>{icon}</span>
          <span className={`text-xs font-semibold ${colors.text}`}>{title}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${colors.badge}`}>
            {items.length}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className={`w-4 h-4 ${colors.text}`} />
        ) : (
          <ChevronDown className={`w-4 h-4 ${colors.text}`} />
        )}
      </button>

      {expanded && (
        <div className="p-2 space-y-1 bg-white dark:bg-slate-800">
          {items.map((item, idx) => (
            <div
              key={item.uri || idx}
              className="group flex items-start justify-between gap-2 p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                  {item.label}
                </div>
                {item.sources && item.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {item.sources.map((source, sidx) => (
                      <span
                        key={source.id || sidx}
                        className="text-[9px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-600 text-slate-500 dark:text-slate-300 rounded"
                      >
                        {source.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {onRemove && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(item.uri);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-500 transition-all"
                  title="Verwijderen"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ProfilePanel: React.FC<ProfilePanelProps> = ({
  profile,
  onRemoveItem,
  onClearProfile
}) => {
  const totalItems =
    profile.skills.length +
    profile.knowledge.length +
    profile.tasks.length +
    profile.workConditions.length;

  if (totalItems === 0) {
    return (
      <div className="text-center py-4 text-slate-400 dark:text-slate-500">
        <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-xs">Nog geen profiel opgebouwd</p>
        <p className="text-[10px] mt-1">Upload een CV of bouw handmatig</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <CategorySection
        title="Vaardigheden"
        icon={<Sparkles className="w-3.5 h-3.5" />}
        items={profile.skills}
        color="emerald"
        onRemove={onRemoveItem ? (uri) => onRemoveItem('skills', uri) : undefined}
        defaultExpanded={true}
      />

      <CategorySection
        title="Kennisgebieden"
        icon={<BookOpen className="w-3.5 h-3.5" />}
        items={profile.knowledge}
        color="blue"
        onRemove={onRemoveItem ? (uri) => onRemoveItem('knowledge', uri) : undefined}
      />

      <CategorySection
        title="Taken"
        icon={<ListChecks className="w-3.5 h-3.5" />}
        items={profile.tasks}
        color="purple"
        onRemove={onRemoveItem ? (uri) => onRemoveItem('tasks', uri) : undefined}
      />

      <CategorySection
        title="Werkomstandigheden"
        icon={<Briefcase className="w-3.5 h-3.5" />}
        items={profile.workConditions}
        color="amber"
        onRemove={onRemoveItem ? (uri) => onRemoveItem('workConditions', uri) : undefined}
      />

      {onClearProfile && totalItems > 0 && (
        <button
          onClick={onClearProfile}
          className="w-full mt-2 flex items-center justify-center gap-1.5 text-[10px] text-slate-400 hover:text-rose-500 py-2 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          Profiel wissen
        </button>
      )}
    </div>
  );
};

export default ProfilePanel;
