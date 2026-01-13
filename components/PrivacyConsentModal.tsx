/**
 * Privacy Consent Modal Component
 * Informed consent voor exact data sharing
 */

import React, { useState } from 'react';

interface PrivacyConsentModalProps {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  employers: Array<{
    original: string;
    generalized: string;
  }>;
  onConsent: (consentGiven: boolean, useExactEmployers: boolean) => void;
  onClose: () => void;
}

export const PrivacyConsentModal: React.FC<PrivacyConsentModalProps> = ({
  riskLevel,
  employers,
  onConsent,
  onClose
}) => {
  const [understood, setUnderstood] = useState(false);

  const isHighRisk = riskLevel === 'high' || riskLevel === 'critical';

  return (
    <div className="consent-modal-overlay" onClick={onClose}>
      <div className="consent-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>⚠️ Privacy Keuze</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Risk Warning */}
          <div className={`risk-warning ${riskLevel}`}>
            <span className="icon">
              {riskLevel === 'critical' && '🔴'}
              {riskLevel === 'high' && '🟠'}
              {riskLevel === 'medium' && '🟡'}
              {riskLevel === 'low' && '🟢'}
            </span>
            <div>
              <strong>Privacy Risico: {riskLevel.toUpperCase()}</strong>
              <p>
                {isHighRisk
                  ? 'Je werkgever-combinatie is zeer identificerend. We raden sterk af om exacte gegevens te delen.'
                  : 'Je werkgever-combinatie kan potentieel identificerend zijn.'}
              </p>
            </div>
          </div>

          {/* Explanation */}
          <div className="explanation">
            <h3>Wat betekent dit?</h3>
            <p>
              Zelfs zonder je naam, email of telefoon kan de <strong>combinatie van werkgevers</strong> gebruikt
              worden om je te identificeren (bijvoorbeeld via LinkedIn).
            </p>

            {/* Show example */}
            {employers.length > 0 && (
              <div className="example">
                <strong>Voorbeeld uit je CV:</strong>
                <div className="comparison">
                  <div className="option current">
                    <span className="label">🔒 Huidige versie (veilig):</span>
                    <ul>
                      {employers.slice(0, 3).map((emp, idx) => (
                        <li key={idx}>{emp.generalized}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="option exact">
                    <span className="label">⚠️ Exacte versie (minder veilig):</span>
                    <ul>
                      {employers.slice(0, 3).map((emp, idx) => (
                        <li key={idx}>{emp.original}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Trade-offs */}
          <div className="tradeoffs">
            <div className="tradeoff">
              <span className="icon">✅</span>
              <div>
                <strong>Voordeel van exacte gegevens:</strong>
                <p>5-10% betere matching kwaliteit</p>
              </div>
            </div>
            <div className="tradeoff">
              <span className="icon">⚠️</span>
              <div>
                <strong>Nadeel:</strong>
                <p>Je bent mogelijk identificeerbaar via je werkgever-geschiedenis</p>
              </div>
            </div>
          </div>

          {/* Our Recommendation */}
          <div className="recommendation">
            <strong>🎯 Onze aanbeveling:</strong>
            <p>
              {isHighRisk
                ? 'Gebruik de gegeneraliseerde versie. Je privacy is belangrijker dan een klein verschil in matching kwaliteit.'
                : 'De gegeneraliseerde versie biedt goede matching kwaliteit met optimale privacy.'}
            </p>
          </div>

          {/* Consent Checkbox */}
          {!isHighRisk && (
            <label className="consent-checkbox">
              <input
                type="checkbox"
                checked={understood}
                onChange={(e) => setUnderstood(e.target.checked)}
              />
              <span>
                Ik begrijp het risico en wil toch mijn exacte werkgevers delen voor betere matching
              </span>
            </label>
          )}
        </div>

        <div className="modal-footer">
          {isHighRisk ? (
            <>
              <button className="button secondary" onClick={onClose}>
                Terug
              </button>
              <button
                className="button primary"
                onClick={() => onConsent(true, false)}
              >
                Gebruik gegeneraliseerde versie 🔒
              </button>
            </>
          ) : (
            <>
              <button className="button secondary" onClick={onClose}>
                Annuleren
              </button>
              <button
                className="button danger"
                disabled={!understood}
                onClick={() => onConsent(true, true)}
              >
                Deel exacte gegevens ⚠️
              </button>
              <button
                className="button primary"
                onClick={() => onConsent(true, false)}
              >
                Houd privacy 🔒
              </button>
            </>
          )}
        </div>

        <style jsx>{`
          .consent-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
          }

          .consent-modal {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
            max-width: 700px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
          }

          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 24px;
            border-bottom: 1px solid #e5e7eb;
          }

          .modal-header h2 {
            margin: 0;
            font-size: 24px;
          }

          .close-button {
            background: none;
            border: none;
            font-size: 32px;
            cursor: pointer;
            color: #6b7280;
            padding: 0;
            width: 32px;
            height: 32px;
          }

          .modal-body {
            padding: 24px;
          }

          .risk-warning {
            display: flex;
            gap: 16px;
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 24px;
            border-left: 4px solid;
          }

          .risk-warning.critical {
            background: #fef2f2;
            border-color: #ef4444;
            color: #7f1d1d;
          }

          .risk-warning.high {
            background: #fff7ed;
            border-color: #f97316;
            color: #7c2d12;
          }

          .risk-warning.medium {
            background: #fffbeb;
            border-color: #f59e0b;
            color: #78350f;
          }

          .risk-warning.low {
            background: #f0fdf4;
            border-color: #10b981;
            color: #065f46;
          }

          .risk-warning .icon {
            font-size: 32px;
            flex-shrink: 0;
          }

          .risk-warning strong {
            display: block;
            margin-bottom: 4px;
            font-size: 16px;
          }

          .risk-warning p {
            margin: 0;
            font-size: 14px;
            line-height: 1.5;
          }

          .explanation {
            margin-bottom: 24px;
          }

          .explanation h3 {
            margin: 0 0 12px 0;
            font-size: 18px;
          }

          .explanation p {
            margin: 0 0 16px 0;
            line-height: 1.6;
            color: #4b5563;
          }

          .example {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 16px;
            margin-top: 16px;
          }

          .example strong {
            display: block;
            margin-bottom: 12px;
            color: #1f2937;
          }

          .comparison {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
          }

          .option {
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 6px;
            padding: 12px;
          }

          .option.current {
            border-color: #10b981;
          }

          .option.exact {
            border-color: #f97316;
          }

          .option .label {
            display: block;
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 8px;
          }

          .option ul {
            margin: 0;
            padding-left: 20px;
            font-size: 14px;
            color: #6b7280;
          }

          .option li {
            margin: 4px 0;
          }

          .tradeoffs {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 24px;
          }

          .tradeoff {
            display: flex;
            gap: 12px;
            padding: 12px;
            background: #f9fafb;
            border-radius: 6px;
          }

          .tradeoff .icon {
            font-size: 24px;
            flex-shrink: 0;
          }

          .tradeoff strong {
            display: block;
            margin-bottom: 4px;
            color: #1f2937;
          }

          .tradeoff p {
            margin: 0;
            font-size: 14px;
            color: #6b7280;
          }

          .recommendation {
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
          }

          .recommendation strong {
            display: block;
            margin-bottom: 8px;
            color: #1e40af;
          }

          .recommendation p {
            margin: 0;
            color: #1e40af;
            line-height: 1.5;
          }

          .consent-checkbox {
            display: flex;
            align-items: start;
            gap: 12px;
            padding: 16px;
            background: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 8px;
            cursor: pointer;
          }

          .consent-checkbox input[type="checkbox"] {
            margin-top: 4px;
            width: 18px;
            height: 18px;
            cursor: pointer;
          }

          .consent-checkbox span {
            color: #7f1d1d;
            line-height: 1.5;
            font-size: 14px;
          }

          .modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            padding: 20px 24px;
            background: #f9fafb;
            border-top: 1px solid #e5e7eb;
          }

          .button {
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 15px;
            font-weight: 500;
            cursor: pointer;
            border: none;
            transition: all 0.2s;
          }

          .button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .button.primary {
            background: #10b981;
            color: white;
          }

          .button.primary:hover:not(:disabled) {
            background: #059669;
          }

          .button.secondary {
            background: #f3f4f6;
            color: #374151;
          }

          .button.secondary:hover {
            background: #e5e7eb;
          }

          .button.danger {
            background: #f97316;
            color: white;
          }

          .button.danger:hover:not(:disabled) {
            background: #ea580c;
          }
        `}</style>
      </div>
    </div>
  );
};

export default PrivacyConsentModal;
