/**
 * CV Parsing Wizard Component
 * Stap-voor-stap CV verwerking met gebruikersbevestiging
 *
 * Stappen:
 * 1. Tekst Extractie - Toon geëxtraheerde tekst uit PDF/Word
 * 2. PII Detectie - Toon gedetecteerde persoonsgegevens met highlighting
 * 3. Anonimisering Preview - Side-by-side: Origineel ↔ Geanonimiseerd
 * 4. Structuur Parsing - Werkervaring, Opleiding, Vaardigheden als kaartjes
 * 5. Privacy & Werkgevers - Kies privacy niveau en finaliseer
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';

import type {
  Step1ExtractResponse,
  Step2PIIResponse,
  Step3AnonymizeResponse,
  Step4ParseResponse,
  Step5FinalizeResponse,
  PIIDetection,
  PrivacyLevel,
  WizardStepResponse
} from '../types/cv';

interface CVParsingWizardProps {
  sessionId: string;
  onComplete: (cvId: number) => void;
  onClose: () => void;
  isOpen: boolean;
  backendUrl?: string;
}

type WizardStatus = 'idle' | 'uploading' | 'processing' | 'step' | 'completed' | 'error';

const STEP_INFO = [
  { number: 1, name: 'Tekst Extractie', description: 'Tekst uit je CV wordt geëxtraheerd' },
  { number: 2, name: 'PII Detectie', description: 'Persoonsgegevens worden gedetecteerd' },
  { number: 3, name: 'Anonimisering', description: 'Preview van de anonimisering' },
  { number: 4, name: 'Structuur', description: 'Werkervaring en opleiding worden geparseerd' },
  { number: 5, name: 'Privacy', description: 'Kies je privacy niveau' }
];

export const CVParsingWizard: React.FC<CVParsingWizardProps> = ({
  sessionId,
  onComplete,
  onClose,
  isOpen,
  backendUrl = 'http://localhost:3001'
}) => {
  const [status, setStatus] = useState<WizardStatus>('idle');
  const [currentStep, setCurrentStep] = useState(0);
  const [cvId, setCvId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Step data
  const [step1Data, setStep1Data] = useState<Step1ExtractResponse | null>(null);
  const [step2Data, setStep2Data] = useState<Step2PIIResponse | null>(null);
  const [step3Data, setStep3Data] = useState<Step3AnonymizeResponse | null>(null);
  const [step4Data, setStep4Data] = useState<Step4ParseResponse | null>(null);
  const [step5Data, setStep5Data] = useState<Step5FinalizeResponse | null>(null);

  // User modifications
  const [additionalPII, setAdditionalPII] = useState<PIIDetection[]>([]);
  const [selectedPrivacyLevel, setSelectedPrivacyLevel] = useState<PrivacyLevel>('medium');

  // File upload
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];

    if (file.size > 10 * 1024 * 1024) {
      setError('Bestand is te groot. Maximum is 10 MB.');
      return;
    }

    try {
      setStatus('uploading');
      setError(null);

      const formData = new FormData();
      formData.append('cv', file);
      formData.append('sessionId', sessionId);

      console.log('📤 Starting CV wizard:', file.name);

      const response = await fetch(`${backendUrl}/api/cv/wizard/start`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('📥 Wizard started:', data);

      if (data.success) {
        setCvId(data.cvId);
        setStep1Data(data.firstStep);
        setCurrentStep(1);
        setStatus('step');
      } else {
        throw new Error('Failed to start wizard');
      }

    } catch (err) {
      console.error('Wizard start error:', err);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Onbekende fout');
    }
  }, [sessionId, backendUrl]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc']
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    disabled: status !== 'idle'
  });

  // Confirm step and proceed
  const confirmStep = async () => {
    if (!cvId) return;

    setIsProcessing(true);

    try {
      const body: any = { confirmed: true };

      // Add step-specific data
      if (currentStep === 2 && additionalPII.length > 0) {
        body.additionalPII = additionalPII;
      }
      if (currentStep === 5) {
        body.privacyLevel = selectedPrivacyLevel;
      }

      const response = await fetch(`${backendUrl}/api/cv/${cvId}/step/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Step confirmed:', data);

      if (data.isComplete) {
        setStatus('completed');
        setTimeout(() => {
          onComplete(cvId);
        }, 2000);
      } else if (data.nextStep) {
        // Store next step data
        switch (data.nextStep.stepNumber) {
          case 2:
            setStep2Data(data.nextStep as Step2PIIResponse);
            break;
          case 3:
            setStep3Data(data.nextStep as Step3AnonymizeResponse);
            break;
          case 4:
            setStep4Data(data.nextStep as Step4ParseResponse);
            break;
          case 5:
            setStep5Data(data.nextStep as Step5FinalizeResponse);
            break;
        }
        setCurrentStep(data.nextStep.stepNumber);
      }

    } catch (err) {
      console.error('Step confirm error:', err);
      setError(err instanceof Error ? err.message : 'Bevestiging mislukt');
    } finally {
      setIsProcessing(false);
    }
  };

  // Go back to previous step
  const goBack = async () => {
    if (!cvId || currentStep <= 1) return;

    setIsProcessing(true);

    try {
      const response = await fetch(`${backendUrl}/api/cv/${cvId}/step/back`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('⬅️ Went back:', data);

      setCurrentStep(data.stepNumber);

    } catch (err) {
      console.error('Step back error:', err);
      setError(err instanceof Error ? err.message : 'Teruggaan mislukt');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setCurrentStep(0);
    setCvId(null);
    setError(null);
    setStep1Data(null);
    setStep2Data(null);
    setStep3Data(null);
    setStep4Data(null);
    setStep5Data(null);
    setAdditionalPII([]);
    setSelectedPrivacyLevel('medium');
  };

  if (!isOpen) return null;

  return (
    <div className="wizard-overlay" onClick={onClose}>
      <div className="wizard-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="wizard-header">
          <h2>CV Parsing Wizard</h2>
          <button className="close-btn" onClick={onClose} aria-label="Sluiten">×</button>
        </div>

        {/* Progress indicator */}
        {status === 'step' && (
          <div className="progress-indicator">
            {STEP_INFO.map((step, idx) => (
              <div
                key={step.number}
                className={`step-dot ${currentStep >= step.number ? 'active' : ''} ${currentStep === step.number ? 'current' : ''}`}
              >
                <span className="dot">{step.number}</span>
                <span className="label">{step.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="wizard-content">
          {/* Idle - File upload */}
          {status === 'idle' && (
            <>
              <div className="privacy-notice">
                <span className="icon">🔒</span>
                <div className="text">
                  <strong>Privacy garantie:</strong>
                  <p>Je CV wordt stap voor stap verwerkt. Bij elke stap kun je de resultaten bekijken en bevestigen voordat we verder gaan.</p>
                </div>
              </div>

              <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
                <input {...getInputProps()} />
                <div className="dropzone-content">
                  <span className="icon">📂</span>
                  {isDragActive ? (
                    <p className="primary">Drop je CV hier...</p>
                  ) : (
                    <>
                      <p className="primary">Drag & drop je CV hier</p>
                      <p className="secondary">of klik om een bestand te selecteren</p>
                    </>
                  )}
                  <p className="file-types">PDF, Word (.docx, .doc) • Max. 10 MB</p>
                </div>
              </div>
            </>
          )}

          {/* Uploading */}
          {status === 'uploading' && (
            <div className="loading-container">
              <div className="spinner"></div>
              <p>CV wordt geüpload en geanalyseerd...</p>
            </div>
          )}

          {/* Step 1: Text Extraction */}
          {status === 'step' && currentStep === 1 && step1Data && (
            <Step1View data={step1Data} />
          )}

          {/* Step 2: PII Detection */}
          {status === 'step' && currentStep === 2 && step2Data && (
            <Step2View
              data={step2Data}
              additionalPII={additionalPII}
              onAddPII={(pii) => setAdditionalPII([...additionalPII, pii])}
            />
          )}

          {/* Step 3: Anonymization Preview */}
          {status === 'step' && currentStep === 3 && step3Data && (
            <Step3View data={step3Data} />
          )}

          {/* Step 4: Structure Parsing */}
          {status === 'step' && currentStep === 4 && step4Data && (
            <Step4View data={step4Data} />
          )}

          {/* Step 5: Privacy & Employers */}
          {status === 'step' && currentStep === 5 && step5Data && (
            <Step5View
              data={step5Data}
              selectedLevel={selectedPrivacyLevel}
              onSelectLevel={setSelectedPrivacyLevel}
            />
          )}

          {/* Completed */}
          {status === 'completed' && (
            <div className="success-container">
              <span className="icon">✅</span>
              <h3>CV succesvol verwerkt!</h3>
              <p>Je wordt doorgestuurd naar het review scherm...</p>
            </div>
          )}

          {/* Error */}
          {status === 'error' && error && (
            <div className="error-container">
              <span className="icon">❌</span>
              <p className="error-text">{error}</p>
              <button className="retry-btn" onClick={handleReset}>Opnieuw proberen</button>
            </div>
          )}
        </div>

        {/* Footer with navigation */}
        {status === 'step' && (
          <div className="wizard-footer">
            <button
              className="btn btn-secondary"
              onClick={goBack}
              disabled={currentStep <= 1 || isProcessing}
            >
              ← Terug
            </button>

            <span className="step-info">
              Stap {currentStep} van {STEP_INFO.length}: {STEP_INFO[currentStep - 1]?.name}
            </span>

            <button
              className="btn btn-primary"
              onClick={confirmStep}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <span className="btn-loading">Verwerken...</span>
              ) : currentStep === 5 ? (
                'Voltooien ✓'
              ) : (
                'Bevestig & Volgende →'
              )}
            </button>
          </div>
        )}

        <style>{`
          .wizard-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }

          .wizard-modal {
            background: white;
            border-radius: 16px;
            box-shadow: 0 25px 80px rgba(0, 0, 0, 0.4);
            max-width: 900px;
            width: 95%;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }

          .wizard-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px 24px;
            border-bottom: 1px solid #e5e7eb;
            background: #f9fafb;
          }

          .wizard-header h2 {
            margin: 0;
            font-size: 22px;
            font-weight: 600;
            color: #1f2937;
          }

          .close-btn {
            background: none;
            border: none;
            font-size: 28px;
            cursor: pointer;
            color: #6b7280;
            padding: 0;
            width: 32px;
            height: 32px;
            line-height: 1;
          }

          .close-btn:hover {
            color: #374151;
          }

          .progress-indicator {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 8px;
            padding: 20px;
            background: #f3f4f6;
            border-bottom: 1px solid #e5e7eb;
          }

          .step-dot {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            position: relative;
          }

          .step-dot:not(:last-child)::after {
            content: '';
            position: absolute;
            top: 14px;
            left: calc(50% + 20px);
            width: 40px;
            height: 2px;
            background: #d1d5db;
          }

          .step-dot.active:not(:last-child)::after {
            background: #3b82f6;
          }

          .step-dot .dot {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: #e5e7eb;
            color: #6b7280;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s;
          }

          .step-dot.active .dot {
            background: #3b82f6;
            color: white;
          }

          .step-dot.current .dot {
            box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.3);
          }

          .step-dot .label {
            font-size: 11px;
            color: #6b7280;
            white-space: nowrap;
          }

          .step-dot.current .label {
            color: #1f2937;
            font-weight: 600;
          }

          .wizard-content {
            flex: 1;
            overflow-y: auto;
            padding: 24px;
          }

          .privacy-notice {
            display: flex;
            gap: 12px;
            padding: 16px;
            background: #ecfdf5;
            border: 1px solid #a7f3d0;
            border-radius: 8px;
            margin-bottom: 24px;
          }

          .privacy-notice .icon {
            font-size: 24px;
          }

          .privacy-notice .text strong {
            display: block;
            margin-bottom: 4px;
            color: #065f46;
          }

          .privacy-notice .text p {
            margin: 0;
            color: #047857;
            font-size: 14px;
          }

          .dropzone {
            border: 2px dashed #d1d5db;
            border-radius: 12px;
            padding: 48px 24px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s;
          }

          .dropzone:hover,
          .dropzone.active {
            border-color: #3b82f6;
            background: #eff6ff;
          }

          .dropzone-content .icon {
            font-size: 48px;
            display: block;
            margin-bottom: 16px;
          }

          .dropzone-content .primary {
            font-size: 18px;
            font-weight: 600;
            color: #1f2937;
            margin: 0 0 8px 0;
          }

          .dropzone-content .secondary {
            color: #6b7280;
            margin: 0 0 16px 0;
          }

          .dropzone-content .file-types {
            font-size: 12px;
            color: #9ca3af;
            margin: 0;
          }

          .loading-container,
          .success-container,
          .error-container {
            text-align: center;
            padding: 48px 24px;
          }

          .spinner {
            width: 48px;
            height: 48px;
            border: 4px solid #e5e7eb;
            border-top-color: #3b82f6;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 24px;
          }

          @keyframes spin {
            to { transform: rotate(360deg); }
          }

          .success-container .icon,
          .error-container .icon {
            font-size: 64px;
            display: block;
            margin-bottom: 16px;
          }

          .success-container h3 {
            color: #065f46;
            margin: 0 0 8px 0;
          }

          .error-text {
            color: #991b1b;
            margin: 0 0 24px 0;
          }

          .retry-btn,
          .btn {
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 15px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
          }

          .btn-primary {
            background: #3b82f6;
            color: white;
          }

          .btn-primary:hover:not(:disabled) {
            background: #2563eb;
          }

          .btn-secondary {
            background: #f3f4f6;
            color: #374151;
            border: 1px solid #d1d5db;
          }

          .btn-secondary:hover:not(:disabled) {
            background: #e5e7eb;
          }

          .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .retry-btn {
            background: #3b82f6;
            color: white;
          }

          .retry-btn:hover {
            background: #2563eb;
          }

          .wizard-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 24px;
            border-top: 1px solid #e5e7eb;
            background: #f9fafb;
          }

          .step-info {
            font-size: 14px;
            color: #6b7280;
          }

          .btn-loading {
            display: flex;
            align-items: center;
            gap: 8px;
          }
        `}</style>
      </div>
    </div>
  );
};

// ============================================================================
// Step Components
// ============================================================================

const Step1View: React.FC<{ data: Step1ExtractResponse }> = ({ data }) => (
  <div className="step-view">
    <h3>Stap 1: Tekst Extractie</h3>
    <p className="step-description">
      De tekst uit je CV is geëxtraheerd. Controleer of de tekst correct is weergegeven.
    </p>

    <div className="stats-row">
      <div className="stat">
        <span className="value">{data.characterCount.toLocaleString()}</span>
        <span className="label">tekens</span>
      </div>
      <div className="stat">
        <span className="value">{data.wordCount.toLocaleString()}</span>
        <span className="label">woorden</span>
      </div>
      <div className="stat">
        <span className="value">{data.sourceFormat.toUpperCase()}</span>
        <span className="label">formaat</span>
      </div>
      <div className="stat">
        <span className="value">{data.processingTimeMs}ms</span>
        <span className="label">verwerkingstijd</span>
      </div>
    </div>

    <div className="text-preview">
      <h4>Geëxtraheerde tekst:</h4>
      <pre>{data.extractedText}</pre>
    </div>

    <div className="success-badge">
      ✅ {data.characterCount.toLocaleString()} tekens succesvol geëxtraheerd
    </div>

    <style>{`
      .step-view { padding: 0; }
      .step-view h3 { margin: 0 0 8px 0; color: #1f2937; }
      .step-description { color: #6b7280; margin: 0 0 20px 0; }

      .stats-row {
        display: flex;
        gap: 24px;
        margin-bottom: 20px;
      }

      .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 12px 20px;
        background: #f3f4f6;
        border-radius: 8px;
      }

      .stat .value {
        font-size: 20px;
        font-weight: 600;
        color: #1f2937;
      }

      .stat .label {
        font-size: 12px;
        color: #6b7280;
      }

      .text-preview {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 16px;
        max-height: 300px;
        overflow-y: auto;
      }

      .text-preview h4 {
        margin: 0 0 12px 0;
        font-size: 14px;
        color: #374151;
      }

      .text-preview pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 13px;
        line-height: 1.6;
        color: #1f2937;
        font-family: ui-monospace, monospace;
      }

      .success-badge {
        margin-top: 16px;
        padding: 12px 16px;
        background: #ecfdf5;
        border: 1px solid #a7f3d0;
        border-radius: 8px;
        color: #065f46;
        font-weight: 500;
      }
    `}</style>
  </div>
);

const Step2View: React.FC<{
  data: Step2PIIResponse;
  additionalPII: PIIDetection[];
  onAddPII: (pii: PIIDetection) => void;
}> = ({ data, additionalPII, onAddPII }) => (
  <div className="step-view">
    <h3>Stap 2: PII Detectie</h3>
    <p className="step-description">
      De volgende persoonsgegevens zijn gedetecteerd. Je kunt extra items toevoegen als iets gemist is.
    </p>

    <div className="pii-summary">
      <div className="total">
        <span className="count">{data.summary.totalDetections}</span>
        <span className="label">PII items gedetecteerd</span>
      </div>
      <div className="by-type">
        {Object.entries(data.summary.byType).map(([type, count]) => (
          <span key={type} className={`badge badge-${type}`}>
            {type}: {count}
          </span>
        ))}
      </div>
    </div>

    <div className="detections-list">
      <h4>Gedetecteerde items:</h4>
      {data.detections.map((detection, idx) => (
        <div key={idx} className={`detection-item type-${detection.type}`}>
          <span className="type-badge">{detection.type}</span>
          <span className="text">"{detection.text}"</span>
          <span className="confidence">{(detection.confidence * 100).toFixed(0)}% zeker</span>
        </div>
      ))}
    </div>

    <div className="info-box">
      <span className="icon">ℹ️</span>
      <p>Zijn dit alle gevoelige gegevens? Je kunt extra items markeren in de tekst hierboven.</p>
    </div>

    <style>{`
      .step-view { padding: 0; }
      .step-view h3 { margin: 0 0 8px 0; color: #1f2937; }
      .step-description { color: #6b7280; margin: 0 0 20px 0; }

      .pii-summary {
        display: flex;
        align-items: center;
        gap: 24px;
        padding: 16px;
        background: #fef3c7;
        border: 1px solid #fcd34d;
        border-radius: 8px;
        margin-bottom: 20px;
      }

      .pii-summary .total {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }

      .pii-summary .count {
        font-size: 32px;
        font-weight: 700;
        color: #92400e;
      }

      .pii-summary .label {
        color: #92400e;
      }

      .by-type {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .badge {
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
      }

      .badge-name { background: #fce7f3; color: #be185d; }
      .badge-email { background: #dbeafe; color: #1e40af; }
      .badge-phone { background: #d1fae5; color: #065f46; }
      .badge-address { background: #fef3c7; color: #92400e; }
      .badge-organization { background: #e0e7ff; color: #3730a3; }

      .detections-list {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 16px;
        max-height: 250px;
        overflow-y: auto;
      }

      .detections-list h4 {
        margin: 0 0 12px 0;
        font-size: 14px;
        color: #374151;
      }

      .detection-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 12px;
        background: white;
        border-radius: 6px;
        margin-bottom: 8px;
        border-left: 3px solid #d1d5db;
      }

      .detection-item.type-name { border-left-color: #ec4899; }
      .detection-item.type-email { border-left-color: #3b82f6; }
      .detection-item.type-phone { border-left-color: #10b981; }
      .detection-item.type-address { border-left-color: #f59e0b; }
      .detection-item.type-organization { border-left-color: #6366f1; }

      .type-badge {
        padding: 2px 8px;
        background: #f3f4f6;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        color: #6b7280;
      }

      .detection-item .text {
        flex: 1;
        font-family: ui-monospace, monospace;
        font-size: 13px;
        color: #1f2937;
      }

      .confidence {
        font-size: 12px;
        color: #9ca3af;
      }

      .info-box {
        display: flex;
        gap: 12px;
        margin-top: 16px;
        padding: 12px 16px;
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        border-radius: 8px;
      }

      .info-box .icon { font-size: 18px; }
      .info-box p { margin: 0; color: #1e40af; font-size: 14px; }
    `}</style>
  </div>
);

const Step3View: React.FC<{ data: Step3AnonymizeResponse }> = ({ data }) => (
  <div className="step-view">
    <h3>Stap 3: Anonimisering Preview</h3>
    <p className="step-description">
      Vergelijk het origineel met de geanonimiseerde versie. Controleer of alle gevoelige gegevens correct zijn vervangen.
    </p>

    <div className="comparison-container">
      <div className="comparison-column original">
        <h4>Origineel</h4>
        <div className="text-content">
          {data.comparisonView.original.map((line, idx) => (
            <div
              key={idx}
              className={`line ${data.comparisonView.diffPositions.includes(idx) ? 'diff' : ''}`}
            >
              {line || '\u00A0'}
            </div>
          ))}
        </div>
      </div>

      <div className="comparison-column anonymized">
        <h4>Geanonimiseerd</h4>
        <div className="text-content">
          {data.comparisonView.anonymized.map((line, idx) => (
            <div
              key={idx}
              className={`line ${data.comparisonView.diffPositions.includes(idx) ? 'diff' : ''}`}
            >
              {line || '\u00A0'}
            </div>
          ))}
        </div>
      </div>
    </div>

    <div className="replacements-summary">
      <h4>Vervangingen ({data.replacements.length}):</h4>
      <div className="replacements-list">
        {data.replacements.slice(0, 10).map((r, idx) => (
          <div key={idx} className="replacement-item">
            <span className="original">"{r.original}"</span>
            <span className="arrow">→</span>
            <span className="replacement">{r.replacement}</span>
            <span className="type-badge">{r.type}</span>
          </div>
        ))}
        {data.replacements.length > 10 && (
          <p className="more">... en {data.replacements.length - 10} meer</p>
        )}
      </div>
    </div>

    <style>{`
      .step-view { padding: 0; }
      .step-view h3 { margin: 0 0 8px 0; color: #1f2937; }
      .step-description { color: #6b7280; margin: 0 0 20px 0; }

      .comparison-container {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        margin-bottom: 20px;
      }

      .comparison-column {
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        overflow: hidden;
      }

      .comparison-column.original {
        border-color: #fca5a5;
      }

      .comparison-column.anonymized {
        border-color: #86efac;
      }

      .comparison-column h4 {
        margin: 0;
        padding: 10px 16px;
        font-size: 13px;
        font-weight: 600;
      }

      .comparison-column.original h4 {
        background: #fef2f2;
        color: #991b1b;
      }

      .comparison-column.anonymized h4 {
        background: #f0fdf4;
        color: #166534;
      }

      .text-content {
        padding: 12px 16px;
        max-height: 200px;
        overflow-y: auto;
        font-family: ui-monospace, monospace;
        font-size: 12px;
        line-height: 1.5;
      }

      .line {
        padding: 2px 0;
      }

      .line.diff {
        background: #fef9c3;
      }

      .replacements-summary {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 16px;
      }

      .replacements-summary h4 {
        margin: 0 0 12px 0;
        font-size: 14px;
        color: #374151;
      }

      .replacements-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .replacement-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
      }

      .replacement-item .original {
        color: #dc2626;
        text-decoration: line-through;
      }

      .replacement-item .arrow {
        color: #9ca3af;
      }

      .replacement-item .replacement {
        color: #16a34a;
        font-weight: 500;
      }

      .type-badge {
        margin-left: auto;
        padding: 2px 8px;
        background: #f3f4f6;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        color: #6b7280;
      }

      .more {
        color: #6b7280;
        font-size: 12px;
        font-style: italic;
        margin: 8px 0 0 0;
      }
    `}</style>
  </div>
);

const Step4View: React.FC<{ data: Step4ParseResponse }> = ({ data }) => (
  <div className="step-view">
    <h3>Stap 4: Structuur Parsing</h3>
    <p className="step-description">
      Je CV is geanalyseerd en opgesplitst in werkervaring, opleiding en vaardigheden. Controleer of alles correct is herkend.
    </p>

    <div className="sections-container">
      {/* Experience */}
      <div className="section">
        <h4>Werkervaring ({data.experience.length})</h4>
        {data.experience.length === 0 ? (
          <p className="empty">Geen werkervaring gevonden</p>
        ) : (
          <div className="items-list">
            {data.experience.map((exp) => (
              <div key={exp.id} className={`item-card ${exp.needsReview ? 'needs-review' : ''}`}>
                <div className="item-header">
                  <strong>{exp.jobTitle}</strong>
                  {exp.needsReview && <span className="review-badge">⚠️ Review nodig</span>}
                </div>
                {exp.organization && <p className="organization">{exp.organization}</p>}
                <p className="dates">
                  {exp.startDate} - {exp.endDate || 'heden'}
                  {exp.duration && ` (${exp.duration} jaar)`}
                </p>
                <div className="confidence-bar">
                  <div className="bar" style={{ width: `${exp.confidence * 100}%` }}></div>
                  <span>{(exp.confidence * 100).toFixed(0)}% zeker</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Education */}
      <div className="section">
        <h4>Opleiding ({data.education.length})</h4>
        {data.education.length === 0 ? (
          <p className="empty">Geen opleiding gevonden</p>
        ) : (
          <div className="items-list">
            {data.education.map((edu) => (
              <div key={edu.id} className={`item-card ${edu.needsReview ? 'needs-review' : ''}`}>
                <div className="item-header">
                  <strong>{edu.degree}</strong>
                  {edu.needsReview && <span className="review-badge">⚠️ Review nodig</span>}
                </div>
                {edu.institution && <p className="organization">{edu.institution}</p>}
                {edu.year && <p className="dates">{edu.year}</p>}
                <div className="confidence-bar">
                  <div className="bar" style={{ width: `${edu.confidence * 100}%` }}></div>
                  <span>{(edu.confidence * 100).toFixed(0)}% zeker</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Skills */}
      <div className="section">
        <h4>Vaardigheden ({data.skills.length})</h4>
        {data.skills.length === 0 ? (
          <p className="empty">Geen vaardigheden gevonden</p>
        ) : (
          <div className="skills-grid">
            {data.skills.map((skill) => (
              <span key={skill.id} className="skill-tag">
                {skill.skillName}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>

    <div className="overall-stats">
      <span>Totale betrouwbaarheid: <strong>{(data.overallConfidence * 100).toFixed(0)}%</strong></span>
      {data.itemsNeedingReview > 0 && (
        <span className="warning">⚠️ {data.itemsNeedingReview} items vereisen review</span>
      )}
    </div>

    <style>{`
      .step-view { padding: 0; }
      .step-view h3 { margin: 0 0 8px 0; color: #1f2937; }
      .step-description { color: #6b7280; margin: 0 0 20px 0; }

      .sections-container {
        display: grid;
        gap: 20px;
      }

      .section {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 16px;
      }

      .section h4 {
        margin: 0 0 12px 0;
        font-size: 15px;
        color: #374151;
      }

      .empty {
        color: #9ca3af;
        font-style: italic;
        margin: 0;
      }

      .items-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .item-card {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 12px 16px;
      }

      .item-card.needs-review {
        border-color: #fcd34d;
        background: #fffbeb;
      }

      .item-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
      }

      .item-header strong {
        color: #1f2937;
      }

      .review-badge {
        font-size: 11px;
        padding: 2px 8px;
        background: #fef3c7;
        border-radius: 4px;
        color: #92400e;
      }

      .organization {
        margin: 0 0 4px 0;
        color: #6b7280;
        font-size: 14px;
      }

      .dates {
        margin: 0 0 8px 0;
        color: #9ca3af;
        font-size: 13px;
      }

      .confidence-bar {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .confidence-bar .bar {
        flex: 1;
        height: 4px;
        background: #10b981;
        border-radius: 2px;
        max-width: 100px;
      }

      .confidence-bar span {
        font-size: 11px;
        color: #9ca3af;
      }

      .skills-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .skill-tag {
        padding: 4px 12px;
        background: #dbeafe;
        color: #1e40af;
        border-radius: 16px;
        font-size: 13px;
      }

      .overall-stats {
        display: flex;
        justify-content: space-between;
        margin-top: 16px;
        padding: 12px 16px;
        background: #f3f4f6;
        border-radius: 8px;
        font-size: 14px;
      }

      .warning {
        color: #92400e;
      }
    `}</style>
  </div>
);

const Step5View: React.FC<{
  data: Step5FinalizeResponse;
  selectedLevel: PrivacyLevel;
  onSelectLevel: (level: PrivacyLevel) => void;
}> = ({ data, selectedLevel, onSelectLevel }) => (
  <div className="step-view">
    <h3>Stap 5: Privacy & Werkgevers</h3>
    <p className="step-description">
      Kies hoe je werkgevers worden weergegeven. Een hoger privacy niveau verbergt meer identificerende informatie.
    </p>

    {/* Risk assessment */}
    <div className={`risk-box risk-${data.riskAssessment.overallRisk}`}>
      <div className="risk-header">
        <span className="risk-label">Privacy risico:</span>
        <span className="risk-level">{data.riskAssessment.overallRisk.toUpperCase()}</span>
        <span className="risk-score">Score: {data.riskAssessment.riskScore}/100</span>
      </div>
      <p className="recommendation">{data.riskAssessment.recommendation}</p>
    </div>

    {/* Privacy level selector */}
    <div className="privacy-options">
      <h4>Kies privacy niveau:</h4>
      {data.privacyOptions.available.map((option) => (
        <label
          key={option.level}
          className={`privacy-option ${selectedLevel === option.level ? 'selected' : ''}`}
        >
          <input
            type="radio"
            name="privacyLevel"
            value={option.level}
            checked={selectedLevel === option.level}
            onChange={() => onSelectLevel(option.level)}
          />
          <div className="option-content">
            <div className="option-header">
              <strong>{option.label}</strong>
              <span className={`level-badge level-${option.level}`}>{option.level}</span>
            </div>
            <p className="option-description">{option.description}</p>
            <div className="employer-preview">
              <span className="preview-label">Preview:</span>
              {option.employerPreview.slice(0, 3).map((emp, idx) => (
                <span key={idx} className="employer-tag">{emp}</span>
              ))}
            </div>
          </div>
        </label>
      ))}
    </div>

    {/* Employers list */}
    <div className="employers-section">
      <h4>Je werkgevers:</h4>
      <div className="employers-list">
        {data.employers.map((emp, idx) => (
          <div key={idx} className={`employer-item ${emp.isIdentifying ? 'identifying' : ''}`}>
            <span className="original">{emp.original}</span>
            <span className="arrow">→</span>
            <span className="generalized">{emp.generalized}</span>
            {emp.isIdentifying && <span className="warning-badge">Identificerend</span>}
          </div>
        ))}
      </div>
    </div>

    <style>{`
      .step-view { padding: 0; }
      .step-view h3 { margin: 0 0 8px 0; color: #1f2937; }
      .step-description { color: #6b7280; margin: 0 0 20px 0; }

      .risk-box {
        padding: 16px;
        border-radius: 8px;
        margin-bottom: 20px;
      }

      .risk-box.risk-low {
        background: #f0fdf4;
        border: 1px solid #86efac;
      }

      .risk-box.risk-medium {
        background: #fefce8;
        border: 1px solid #fde047;
      }

      .risk-box.risk-high {
        background: #fef2f2;
        border: 1px solid #fca5a5;
      }

      .risk-box.risk-critical {
        background: #fef2f2;
        border: 2px solid #dc2626;
      }

      .risk-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;
      }

      .risk-label {
        font-weight: 500;
      }

      .risk-level {
        padding: 4px 12px;
        background: white;
        border-radius: 4px;
        font-weight: 700;
        font-size: 12px;
      }

      .risk-score {
        margin-left: auto;
        font-size: 13px;
        color: #6b7280;
      }

      .recommendation {
        margin: 0;
        font-size: 14px;
        color: #374151;
      }

      .privacy-options {
        margin-bottom: 20px;
      }

      .privacy-options h4 {
        margin: 0 0 12px 0;
        font-size: 15px;
        color: #374151;
      }

      .privacy-option {
        display: flex;
        gap: 12px;
        padding: 16px;
        border: 2px solid #e5e7eb;
        border-radius: 8px;
        margin-bottom: 12px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .privacy-option:hover {
        border-color: #3b82f6;
      }

      .privacy-option.selected {
        border-color: #3b82f6;
        background: #eff6ff;
      }

      .privacy-option input {
        margin-top: 4px;
      }

      .option-content {
        flex: 1;
      }

      .option-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 4px;
      }

      .level-badge {
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
      }

      .level-badge.level-low { background: #fef2f2; color: #dc2626; }
      .level-badge.level-medium { background: #fefce8; color: #ca8a04; }
      .level-badge.level-high { background: #f0fdf4; color: #16a34a; }

      .option-description {
        margin: 0 0 8px 0;
        font-size: 13px;
        color: #6b7280;
      }

      .employer-preview {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .preview-label {
        font-size: 12px;
        color: #9ca3af;
      }

      .employer-tag {
        padding: 2px 8px;
        background: #f3f4f6;
        border-radius: 4px;
        font-size: 12px;
        color: #374151;
      }

      .employers-section {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 16px;
      }

      .employers-section h4 {
        margin: 0 0 12px 0;
        font-size: 14px;
        color: #374151;
      }

      .employers-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .employer-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 12px;
        background: white;
        border-radius: 6px;
        font-size: 14px;
      }

      .employer-item.identifying {
        background: #fef2f2;
      }

      .employer-item .original {
        color: #6b7280;
      }

      .employer-item .arrow {
        color: #9ca3af;
      }

      .employer-item .generalized {
        font-weight: 500;
        color: #16a34a;
      }

      .warning-badge {
        margin-left: auto;
        padding: 2px 8px;
        background: #fef2f2;
        border: 1px solid #fca5a5;
        border-radius: 4px;
        font-size: 11px;
        color: #dc2626;
      }
    `}</style>
  </div>
);

export default CVParsingWizard;
