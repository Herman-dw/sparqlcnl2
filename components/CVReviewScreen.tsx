/**
 * CV Review Screen Component
 * Review extracted data met privacy transparency
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { CVExtractionResponse, ExperienceExtraction } from '../types/cv';
import { PrivacyConsentModal } from './PrivacyConsentModal';

interface MatchResult {
  uri: string;
  prefLabel: string;
  score: number;
  matchedItems?: { type: string; label: string }[];
}

interface CVMatchResponse {
  success: boolean;
  cvId: number;
  profile: {
    occupationHistory: { occupationUri: string; occupationLabel: string; years?: number }[];
    education: { educationUri: string; educationLabel: string }[];
    capabilities: number;
    knowledge: number;
    tasks: number;
  };
  matches: MatchResult[];
  matchCount: number;
}

interface CVReviewScreenProps {
  cvId: number;
  onComplete: (matchResults?: CVMatchResponse) => void;
  onBack: () => void;
}

type TabType = 'experience' | 'education' | 'skills';

export const CVReviewScreen: React.FC<CVReviewScreenProps> = ({
  cvId,
  onComplete,
  onBack
}) => {
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [extraction, setExtraction] = useState<CVExtractionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('experience');
  const [showConsentModal, setShowConsentModal] = useState(false);

  useEffect(() => {
    loadExtraction();
  }, [cvId]);

  const loadExtraction = async () => {
    try {
      setLoading(true);
      const response = await axios.get<CVExtractionResponse>(`/api/cv/${cvId}/extraction`);
      setExtraction(response.data);
    } catch (err) {
      setError('Kon CV data niet laden');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleConsent = async (consentGiven: boolean, useExactEmployers: boolean) => {
    try {
      await axios.post(`/api/cv/${cvId}/privacy-consent`, {
        consentGiven,
        useExactEmployers,
        consentText: 'User reviewed and consented via CVReviewScreen'
      });

      // Reload extraction to reflect changes
      await loadExtraction();
      setShowConsentModal(false);
    } catch (err) {
      console.error('Consent error:', err);
    }
  };

  const handleGoToMatching = async () => {
    try {
      setMatching(true);
      setError(null);

      // Call the CV matching endpoint
      const response = await axios.post<CVMatchResponse>(`/api/cv/${cvId}/match`, {
        limit: 20,
        minScore: 0.1,
        includeGaps: false
      });

      console.log('Match results:', response.data);

      // Pass results to parent and close
      onComplete(response.data);

    } catch (err) {
      console.error('Matching error:', err);
      setError('Matching mislukt. Probeer het opnieuw.');
      setMatching(false);
    }
  };

  if (matching) {
    return (
      <div className="review-screen loading">
        <div className="spinner"></div>
        <p>Profiel matchen met beroepen...</p>
        <p className="subtext">Dit kan even duren...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="review-screen loading">
        <div className="spinner"></div>
        <p>CV data laden...</p>
      </div>
    );
  }

  if (error || !extraction) {
    return (
      <div className="review-screen error">
        <p>{error || 'Geen data gevonden'}</p>
        <button onClick={onBack}>Terug</button>
      </div>
    );
  }

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'low': return '#10b981';
      case 'medium': return '#f59e0b';
      case 'high': return '#f97316';
      case 'critical': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'low': return '🟢';
      case 'medium': return '🟡';
      case 'high': return '🟠';
      case 'critical': return '🔴';
      default: return '⚪';
    }
  };

  return (
    <div className="review-screen">
      {/* Header */}
      <div className="header">
        <h1>✅ CV Analyse Compleet</h1>
        <p className="subtitle">Controleer de geëxtraheerde gegevens</p>
      </div>

      {/* Privacy Status Banner */}
      <div className="privacy-banner" style={{ borderColor: getRiskColor(extraction.privacyStatus.riskLevel) }}>
        <div className="privacy-icon">
          {getRiskIcon(extraction.privacyStatus.riskLevel)}
        </div>
        <div className="privacy-content">
          <strong>Privacy Status</strong>
          <p>
            We hebben {extraction.privacyStatus.piiCount} persoonsgegeven(s) gedetecteerd en verwijderd:
            {extraction.privacyStatus.piiDetected.join(', ')}
          </p>
          <p className="privacy-guarantee">
            ✅ Deze gegevens zijn <strong>niet</strong> gedeeld met onze AI voor classificatie
          </p>
        </div>
        {extraction.privacyStatus.allowExactData === false && extraction.privacyStatus.riskLevel !== 'critical' && (
          <button
            className="consent-button"
            onClick={() => setShowConsentModal(true)}
          >
            Instellingen
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={activeTab === 'experience' ? 'active' : ''}
          onClick={() => setActiveTab('experience')}
        >
          🔍 Werkervaring ({extraction.sections.experience.length})
        </button>
        <button
          className={activeTab === 'education' ? 'active' : ''}
          onClick={() => setActiveTab('education')}
        >
          🎓 Opleidingen ({extraction.sections.education.length})
        </button>
        <button
          className={activeTab === 'skills' ? 'active' : ''}
          onClick={() => setActiveTab('skills')}
        >
          💪 Vaardigheden ({extraction.sections.skills.length})
        </button>
      </div>

      {/* Content */}
      <div className="content">
        {activeTab === 'experience' && (
          <div className="section">
            {extraction.sections.experience.map((exp, idx) => (
              <div key={exp.id} className="item">
                <div className="item-header">
                  <h3>{exp.content.job_title}</h3>
                  <span className="confidence">
                    {Math.round((exp.confidence_score || 0) * 100)}% zeker
                  </span>
                </div>
                <div className="item-details">
                  <p>
                    <strong>Werkgever:</strong> {exp.displayEmployer}
                    {exp.privacyInfo.wasGeneralized && (
                      <span className="privacy-badge" title={`Origineel: ${exp.privacyInfo.originalEmployer}`}>
                        🔒 Gegeneraliseerd
                      </span>
                    )}
                  </p>
                  {exp.content.duration_years && (
                    <p><strong>Duur:</strong> {exp.content.duration_years} jaar</p>
                  )}
                  {exp.content.extracted_skills.length > 0 && (
                    <p>
                      <strong>Vaardigheden:</strong> {exp.content.extracted_skills.join(', ')}
                    </p>
                  )}
                </div>
                {exp.matched_cnl_label && (
                  <div className="cnl-match">
                    ✓ Gematcht met CNL: <strong>{exp.matched_cnl_label}</strong>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'education' && (
          <div className="section">
            {extraction.sections.education.map(edu => (
              <div key={edu.id} className="item">
                <div className="item-header">
                  <h3>{edu.content.degree}</h3>
                  <span className="confidence">
                    {Math.round((edu.confidence_score || 0) * 100)}% zeker
                  </span>
                </div>
                <div className="item-details">
                  {edu.content.institution && (
                    <p><strong>Instelling:</strong> {edu.content.institution}</p>
                  )}
                  {edu.content.year && (
                    <p><strong>Jaar:</strong> {edu.content.year}</p>
                  )}
                </div>
                {edu.matched_cnl_label && (
                  <div className="cnl-match">
                    ✓ Gematcht met CNL: <strong>{edu.matched_cnl_label}</strong>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'skills' && (
          <div className="section">
            <div className="skills-grid">
              {extraction.sections.skills.map(skill => (
                <div key={skill.id} className="skill-chip">
                  {skill.content.skill_name}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quality Score */}
      <div className="quality-score">
        <strong>Kwaliteitsscore:</strong>
        <div className="score-bar">
          <div
            className="score-fill"
            style={{ width: `${Math.round(extraction.overallConfidence * 100)}%` }}
          ></div>
        </div>
        <span>{Math.round(extraction.overallConfidence * 100)}%</span>
      </div>

      {/* Actions */}
      <div className="actions">
        <button className="button secondary" onClick={onBack}>
          ⬅️ Terug
        </button>
        <button className="button primary" onClick={handleGoToMatching} disabled={matching}>
          {matching ? '⏳ Matchen...' : '➡️ Ga naar matching'}
        </button>
      </div>

      {/* Privacy Consent Modal */}
      {showConsentModal && extraction.privacyStatus.allowExactData === false && (
        <PrivacyConsentModal
          riskLevel={extraction.privacyStatus.riskLevel}
          employers={extraction.sections.experience.map(e => ({
            original: e.privacyInfo.originalEmployer || '',
            generalized: e.privacyInfo.generalizedEmployer || ''
          }))}
          onConsent={handleConsent}
          onClose={() => setShowConsentModal(false)}
        />
      )}

      <style>{`
        .review-screen { padding: 24px; max-width: 1200px; margin: 0 auto; }
        .header h1 { margin: 0 0 8px 0; font-size: 28px; }
        .subtitle { color: #6b7280; margin: 0 0 24px 0; }

        .privacy-banner {
          display: flex;
          gap: 16px;
          padding: 20px;
          background: #f9fafb;
          border-left: 4px solid;
          border-radius: 8px;
          margin-bottom: 24px;
        }
        .privacy-icon { font-size: 32px; }
        .privacy-content strong { display: block; margin-bottom: 8px; }
        .privacy-content p { margin: 4px 0; font-size: 14px; color: #4b5563; }
        .privacy-guarantee { color: #065f46; font-weight: 500; }
        .consent-button {
          background: #3b82f6;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
        }

        .tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
          border-bottom: 2px solid #e5e7eb;
        }
        .tabs button {
          background: none;
          border: none;
          padding: 12px 20px;
          font-size: 16px;
          cursor: pointer;
          border-bottom: 3px solid transparent;
          margin-bottom: -2px;
        }
        .tabs button.active {
          border-bottom-color: #3b82f6;
          color: #3b82f6;
          font-weight: 600;
        }

        .content { min-height: 400px; }
        .section { display: flex; flex-direction: column; gap: 16px; }

        .item {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 20px;
        }
        .item-header {
          display: flex;
          justify-content: space-between;
          align-items: start;
          margin-bottom: 12px;
        }
        .item-header h3 { margin: 0; font-size: 18px; }
        .confidence {
          background: #dbeafe;
          color: #1e40af;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 500;
        }
        .item-details p { margin: 8px 0; color: #4b5563; }
        .privacy-badge {
          display: inline-block;
          margin-left: 8px;
          font-size: 12px;
          color: #065f46;
          background: #d1fae5;
          padding: 2px 8px;
          border-radius: 4px;
        }
        .cnl-match {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #e5e7eb;
          color: #059669;
          font-size: 14px;
        }

        .skills-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .skill-chip {
          background: #dbeafe;
          color: #1e40af;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 14px;
        }

        .quality-score {
          display: flex;
          align-items: center;
          gap: 16px;
          margin: 24px 0;
          padding: 16px;
          background: #f9fafb;
          border-radius: 8px;
        }
        .score-bar {
          flex: 1;
          height: 8px;
          background: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
        }
        .score-fill {
          height: 100%;
          background: linear-gradient(90deg, #10b981, #059669);
        }

        .actions {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          margin-top: 24px;
        }
        .button {
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          border: none;
        }
        .button.primary {
          background: #3b82f6;
          color: white;
        }
        .button.secondary {
          background: #f3f4f6;
          color: #374151;
        }

        .spinner {
          width: 48px;
          height: 48px;
          border: 4px solid #e5e7eb;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default CVReviewScreen;
