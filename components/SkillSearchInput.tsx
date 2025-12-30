import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { SkillSearchResult } from '../types/matching';

interface SkillSearchInputProps {
  placeholder: string;
  onSelect: (item: SkillSearchResult) => void;
  searchFn: (query: string) => Promise<{ success: boolean; results: SkillSearchResult[] }>;
  disabled?: boolean;
}

const SkillSearchInput: React.FC<SkillSearchInputProps> = ({
  placeholder,
  onSelect,
  searchFn,
  disabled
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SkillSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const response = await searchFn(query);
      setResults(response.results);
      setIsSearching(false);
      setShowDropdown(true);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, searchFn]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (item: SkillSearchResult) => {
    onSelect(item);
    setQuery('');
    setResults([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full pl-10 pr-10 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500 animate-spin" />
        )}
      </div>

      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {results.map((item, idx) => (
            <button
              key={item.uri || idx}
              className="w-full text-left px-3 py-2 hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none flex flex-col gap-1"
              onClick={() => handleSelect(item)}
            >
              <span className="text-sm font-medium text-slate-700">{item.label}</span>
              <span className="text-[11px] text-slate-400">score: {(item.confidence * 100).toFixed(0)}%</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SkillSearchInput;
