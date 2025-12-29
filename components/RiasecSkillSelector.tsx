/**
 * RiasecSkillSelector Component - v1.0.0
 * Selecteer vaardigheden op basis van RIASEC testresultaten
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Loader2, CheckCircle, Target, ArrowRight, ArrowLeft,
  Sparkles, AlertCircle, Search
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface RiasecLetterInfo {
  code: string;
  name: string;
  dutch: string;
  description: string;
}

interface Capability {
  uri: string;
  label: string;
}

interface RiasecCapabilitiesResponse {
  success: boolean;
  letter: string;
  name: string;
  dutch: string;
  description: string;
  capabilities: Capability[];
  totalCount: number;
  error?: string;
}

interface RiasecBatchResponse {
  success: boolean;
  letters: string[];
  results: Record<string, RiasecCapabilitiesResponse>;
  error?: string;
}

// RIASEC letter informatie (fallback)
const RIASEC_LETTERS: Record<string, RiasecLetterInfo> = {
  R: { code: 'R', name: 'Realistic', dutch: 'Praktisch', description: 'Praktische vaardigheden' },
  I: { code: 'I', name: 'Investigative', dutch: 'Onderzoekend', description: 'Onderzoekende vaardigheden' },
  A: { code: 'A', name: 'Artistic', dutch: 'Artistiek', description: 'Creatieve vaardigheden' },
  S: { code: 'S', name: 'Social', dutch: 'Sociaal', description: 'Sociale vaardigheden' },
  E: { code: 'E', name: 'Enterprising', dutch: 'Ondernemend', description: 'Ondernemende vaardigheden' },
  C: { code: 'C', name: 'Conventional', dutch: 'Conventioneel', description: 'Organisatorische vaardigheden' }
};

// Backend URL helper
const getBackendUrl = () => {
  return localStorage.getItem('local_backend_url') || 'http://localhost:3001';
};

// API function to fetch capabilities for multiple letters
async function getCapabilitiesForLetters(letters: string[]): Promise<RiasecBatchResponse> {
  const backendUrl = getBackendUrl();
  
  try {
    const response = await fetch(`${backendUrl}/api/riasec/capabilities/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ letters: letters.map(l => l.toUpperCase()) })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('RIASEC batch capabilities error:', error);
    return {
      success: false,
      letters: [],
      results: {},
      error: error instanceof Error ? error.message : 'Onbekende fout'
    };
  }
}

// ============================================================
// TYPES
// ============================================================

interface RiasecResult {
  code: string;
  scores: Array<[string, number]>;
}

interface RiasecSkillSelectorProps {
  riasecResult: RiasecResult;
  onSkillsSelected: (skills: SelectedCapability[]) => void;
  onBack: () => void;
}

export interface SelectedCapability {
  uri: string;
  label: string;
  riasecLetter: string;
}

// ============================================================
// COMPONENT
// ============================================================

const RiasecSkillSelector: React.FC<RiasecSkillSelectorProps> = ({
  riasecResult,
  onSkillsSelected,
  onBack
}) => {
  // State
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [capabilitiesData, setCapabilitiesData] = useState<RiasecBatchResponse | null>(null);
  const [selectedCapabilities, setSelectedCapabilities] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Extract top 3 letters
  const topLetters = useMemo(() => {
    return riasecResult.code.split('').slice(0, 3);
  }, [riasecResult.code]);

  // Load capabilities on mount
  useEffect(() => {
    const loadCapabilities = async () => {
      setIsLoading(true);
      setError(null);
      
      const response = await getCapabilitiesForLetters(topLetters);
      
      if (response.success) {
        setCapabilitiesData(response);
        setActiveTab(topLetters[0]); // Set eerste tab als actief
      } else {
        setError(response.error || 'Kon vaardigheden niet laden');
      }
      
      setIsLoading(false);
    };
    
    loadCapabilities();
  }, [topLetters]);

  // Toggle capability selection
  const toggleCapability = (uri: string) => {
    setSelectedCapabilities(prev => {
      const newSet = new Set(prev);
      if (newSet.has(uri)) {
        newSet.delete(uri);
      } else {
        newSet.add(uri);
      }
      return newSet;
    });
  };

  // Select all capabilities for a letter
  const selectAllForLetter = (letter: string) => {
    if (!capabilitiesData?.results[letter]) return;
    
    const letterCapabilities = capabilitiesData.results[letter].capabilities;
    setSelectedCapabilities(prev => {
      const newSet = new Set(prev);
      letterCapabilities.forEach(cap => newSet.add(cap.uri));
      return newSet;
    });
  };

  // Deselect all capabilities for a letter
  const deselectAllForLetter = (letter: string) => {
    if (!capabilitiesData?.results[letter]) return;
    
    const letterCapabilities = capabilitiesData.results[letter].capabilities;
    setSelectedCapabilities(prev => {
      const newSet = new Set(prev);
      letterCapabilities.forEach(cap => newSet.delete(cap.uri));
      return newSet;
    });
  };

  // Filter capabilities by search query
  const filteredCapabilities = useMemo(() => {
    if (!capabilitiesData?.results[activeTab]) return [];
    
    const capabilities = capabilitiesData.results[activeTab].capabilities;
    
    if (!searchQuery.trim()) return capabilities;
    
    const query = searchQuery.toLowerCase();
    return capabilities.filter(cap => 
      cap.label.toLowerCase().includes(query)
    );
  }, [capabilitiesData, activeTab, searchQuery]);

  // Count selected per letter
  const selectedCountPerLetter = useMemo(() => {
    const counts: Record<string, number> = {};
    
    if (!capabilitiesData) return counts;
    
    topLetters.forEach(letter => {
      const letterCaps = capabilitiesData.results[letter]?.capabilities || [];
      counts[letter] = letterCaps.filter(cap => selectedCapabilities.has(cap.uri)).length;
    });
    
    return counts;
  }, [capabilitiesData, topLetters, selectedCapabilities]);

  // Handle continue to matching
  const handleContinue = () => {
    if (!capabilitiesData) return;
    
    const selected: SelectedCapability[] = [];
    
    topLetters.forEach(letter => {
      const letterCaps = capabilitiesData.results[letter]?.capabilities || [];
      letterCaps.forEach(cap => {
        if (selectedCapabilities.has(cap.uri)) {
          selected.push({
            uri: cap.uri,
            label: cap.label,
            riasecLetter: letter
          });
        }
      });
    });
    
    onSkillsSelected(selected);
  };

  // Get total selected count
  const totalSelected = selectedCapabilities.size;

  // ============================================================
  // RENDER
  // ============================================================

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-12 text-center">
        <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-700">Vaardigheden laden...</h3>
        <p className="mt-2 text-sm text-slate-500">
          We halen de vaardigheden op die passen bij jouw RIASEC profiel
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-12 text-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-700">Er ging iets mis</h3>
        <p className="mt-2 text-sm text-slate-500">{error}</p>
        <button
          onClick={onBack}
          className="mt-6 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition-colors"
        >
          Terug naar resultaten
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-6">
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="w-6 h-6" />
          <h2 className="text-xl font-bold">Bouw je profiel op basis van je interesses</h2>
        </div>
        <p className="text-indigo-100 text-sm">
          Je Holland-code is <span className="font-bold text-white">{riasecResult.code}</span>. 
          Selecteer de vaardigheden die bij je passen.
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex">
          {topLetters.map((letter, idx) => {
            const info = RIASEC_LETTERS[letter];
            const count = selectedCountPerLetter[letter] || 0;
            const total = capabilitiesData?.results[letter]?.totalCount || 0;
            const isActive = activeTab === letter;
            
            return (
              <button
                key={letter}
                onClick={() => setActiveTab(letter)}
                className={`flex-1 px-4 py-4 text-sm font-medium transition-colors relative ${
                  isActive 
                    ? 'text-indigo-600 bg-indigo-50' 
                    : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="font-bold text-lg">{letter}</span>
                  <span className="text-xs opacity-75">{info?.dutch || ''}</span>
                  {count > 0 && (
                    <span className="mt-1 px-2 py-0.5 bg-indigo-600 text-white text-xs rounded-full">
                      {count} / {total}
                    </span>
                  )}
                </div>
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Tab info + actions */}
        {activeTab && capabilitiesData?.results[activeTab] && (
          <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-slate-800">
                {RIASEC_LETTERS[activeTab]?.name} ({RIASEC_LETTERS[activeTab]?.dutch})
              </h3>
              <p className="text-sm text-slate-500">
                {capabilitiesData.results[activeTab].totalCount} vaardigheden beschikbaar
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => selectAllForLetter(activeTab)}
                className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors"
              >
                Alles selecteren
              </button>
              <button
                onClick={() => deselectAllForLetter(activeTab)}
                className="text-xs px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Alles deselecteren
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Zoek vaardigheden..."
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* Capabilities list */}
        <div className="max-h-[400px] overflow-y-auto border border-slate-100 rounded-xl">
          {filteredCapabilities.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              {searchQuery ? 'Geen vaardigheden gevonden met deze zoekopdracht' : 'Geen vaardigheden beschikbaar'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredCapabilities.map((capability) => {
                const isSelected = selectedCapabilities.has(capability.uri);
                
                return (
                  <label
                    key={capability.uri}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleCapability(capability.uri)}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className={`text-sm ${isSelected ? 'text-indigo-700 font-medium' : 'text-slate-700'}`}>
                      {capability.label}
                    </span>
                    {isSelected && (
                      <CheckCircle className="w-4 h-4 text-indigo-600 ml-auto" />
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-800 font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Terug naar resultaten
        </button>
        
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-600">
            <span className="font-bold text-indigo-600">{totalSelected}</span> vaardigheden geselecteerd
          </span>
          <button
            onClick={handleContinue}
            disabled={totalSelected === 0}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-colors ${
              totalSelected > 0
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Target className="w-4 h-4" />
            Match met beroepen
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default RiasecSkillSelector;
