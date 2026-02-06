/**
 * QuickUploadMatchModal Component
 * Hoofd modal voor snelle upload en match flow
 */

import React, { useState, useCallback, useRef } from 'react';
import { X, Zap, Upload, AlertCircle, RefreshCcw } from 'lucide-react';
import {
  QuickUploadMatchModalProps,
  QuickMatchState,
  QuickMatchPhase,
  QuickMatchResult,
  createInitialState,
  createInitialAnimationData
} from '../../types/quickMatch';
import QuickUploadConsent from './QuickUploadConsent';
import QuickUploadAnimation from './QuickUploadAnimation';
import { executeQuickMatch } from '../../services/quickMatchService';

type ModalView = 'consent' | 'upload' | 'processing' | 'error';

interface ExtendedQuickUploadMatchModalProps extends QuickUploadMatchModalProps {
  onAddToProfile?: (extractedData: any, aggregatedSkills: any) => void;
}

const QuickUploadMatchModal: React.FC<ExtendedQuickUploadMatchModalProps> = ({
  isOpen,
  sessionId,
  onComplete,
  onClose,
  onGoToWizard,
  onAddToProfile
}) => {
  // State
  const [view, setView] = useState<ModalView>('consent');
  const [state, setState] = useState<QuickMatchState>(createInitialState());
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Visual animation state - separate from actual processing state
  const [visualPhase, setVisualPhase] = useState<QuickMatchPhase>('consent');
  const [visualProgress, setVisualProgress] = useState(0);
  const visualAnimationRef = useRef<NodeJS.Timeout | null>(null);
  const processingCompleteRef = useRef(false);

  // Visual animation timing config (in ms) - longer early phases, shorter later phases
  const VISUAL_PHASE_DURATIONS: Record<string, number> = {
    uploading: 3000,     // 3s - feel substantial
    anonymizing: 4000,   // 4s - important step, show it
    extracting: 5000,    // 5s - core analysis
    categorizing: 2500,  // 2.5s - quick sort
    classifying: 3000,   // 3s - matching to taxonomy
    matching: 2000       // 2s - finding jobs
  };

  // Start visual animation when processing begins
  const startVisualAnimation = useCallback(() => {
    processingCompleteRef.current = false;
    const phases: QuickMatchPhase[] = ['uploading', 'anonymizing', 'extracting', 'categorizing', 'classifying', 'matching'];
    let currentPhaseIdx = 0;
    let phaseProgress = 0;
    const tickInterval = 50; // Update every 50ms

    const animate = () => {
      if (processingCompleteRef.current) {
        // Processing finished - jump to complete
        setVisualPhase('complete');
        setVisualProgress(100);
        return;
      }

      const currentPhase = phases[currentPhaseIdx];
      const phaseDuration = VISUAL_PHASE_DURATIONS[currentPhase] || 3000;
      const progressPerTick = (100 / (phaseDuration / tickInterval));

      phaseProgress += progressPerTick;

      if (phaseProgress >= 100) {
        // Move to next phase
        currentPhaseIdx++;
        phaseProgress = 0;

        if (currentPhaseIdx >= phases.length) {
          // All visual phases done, but processing might still be running
          // Just show last phase at 100% until processing completes
          setVisualPhase('matching');
          setVisualProgress(100);
          return;
        }

        setVisualPhase(phases[currentPhaseIdx]);
      }

      // Calculate overall progress
      const phaseWeight = 100 / phases.length;
      const overallProgress = (currentPhaseIdx * phaseWeight) + (phaseProgress * phaseWeight / 100);
      setVisualProgress(Math.min(overallProgress, 99)); // Never hit 100 until complete

      visualAnimationRef.current = setTimeout(animate, tickInterval);
    };

    setVisualPhase('uploading');
    setVisualProgress(0);
    animate();
  }, []);

  // Stop visual animation
  const stopVisualAnimation = useCallback(() => {
    if (visualAnimationRef.current) {
      clearTimeout(visualAnimationRef.current);
      visualAnimationRef.current = null;
    }
  }, []);

  // Reset state when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setView('consent');
      setState(createInitialState());
      setVisualPhase('consent');
      setVisualProgress(0);
      processingCompleteRef.current = false;
    }
    return () => stopVisualAnimation();
  }, [isOpen, stopVisualAnimation]);

  // Handle consent given
  const handleConsent = useCallback(() => {
    setState(prev => ({
      ...prev,
      consentGiven: true,
      consentTimestamp: new Date().toISOString()
    }));
    setView('upload');
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback(async (file: File) => {
    // Validate file
    const validTypes = ['application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

    if (!validTypes.includes(file.type)) {
      setState(prev => ({
        ...prev,
        error: 'Alleen PDF en Word documenten worden ondersteund',
        phase: 'error'
      }));
      setView('error');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setState(prev => ({
        ...prev,
        error: 'Bestand is te groot (max 10MB)',
        phase: 'error'
      }));
      setView('error');
      return;
    }

    // Start processing
    setView('processing');
    setState(prev => ({
      ...prev,
      phase: 'uploading',
      progress: 0,
      animationData: {
        ...createInitialAnimationData(),
        fileName: file.name,
        fileSize: file.size
      }
    }));

    // Start visual animation (independent timing)
    startVisualAnimation();

    // Create abort controller
    abortControllerRef.current = new AbortController();

    try {
      const result = await executeQuickMatch(
        file,
        sessionId,
        state.consentTimestamp || new Date().toISOString(),
        // Progress callback - still track actual data for the animation to display
        (phase: QuickMatchPhase, progress: number, data?: any) => {
          setState(prev => ({
            ...prev,
            phase,
            progress,
            ...(data?.anonymizationData && { anonymizationData: data.anonymizationData }),
            ...(data?.extractedData && { extractedData: data.extractedData }),
            ...(data?.aggregatedSkills && { aggregatedSkills: data.aggregatedSkills }),
            ...(data?.animationData && {
              animationData: { ...prev.animationData, ...data.animationData }
            })
          }));
        },
        abortControllerRef.current.signal
      );

      // Processing complete - immediately stop visual animation
      processingCompleteRef.current = true;
      stopVisualAnimation();
      setVisualPhase('complete');
      setVisualProgress(100);

      // Success - update actual state
      setState(prev => ({ ...prev, phase: 'complete', progress: 100 }));

      // Short delay to show completion animation, then go to match results
      setTimeout(() => {
        onComplete(result);
      }, 1000);

    } catch (error) {
      // Stop visual animation on error
      processingCompleteRef.current = true;
      stopVisualAnimation();

      if (error instanceof Error && error.name === 'AbortError') {
        // User cancelled
        return;
      }

      setState(prev => ({
        ...prev,
        phase: 'error',
        error: error instanceof Error ? error.message : 'Er is een fout opgetreden'
      }));
      setView('error');
    }
  }, [sessionId, state.consentTimestamp, onComplete, startVisualAnimation, stopVisualAnimation]);

  // Handle file input change
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  // Handle close
  const handleClose = useCallback(() => {
    // Abort any ongoing processing
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    onClose();
  }, [onClose]);

  // Handle retry
  const handleRetry = useCallback(() => {
    setState(createInitialState());
    setState(prev => ({
      ...prev,
      consentGiven: true,
      consentTimestamp: new Date().toISOString()
    }));
    setView('upload');
  }, []);

  // Handle go to wizard
  const handleGoToWizard = useCallback(() => {
    handleClose();
    onGoToWizard();
  }, [handleClose, onGoToWizard]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col m-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-amber-500 via-emerald-500 to-green-500">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                Snelle Upload & Match
              </h2>
              <p className="text-xs text-white/80">
                Direct van CV naar matchresultaten
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-white/80 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Consent View */}
          {view === 'consent' && (
            <QuickUploadConsent
              onConsent={handleConsent}
              onCancel={handleClose}
              onGoToWizard={handleGoToWizard}
            />
          )}

          {/* Upload View */}
          {view === 'upload' && (
            <div className="p-6">
              {/* Drop zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
                           transition-all duration-300
                           ${isDragging
                             ? 'border-emerald-500 bg-emerald-50'
                             : 'border-slate-300 hover:border-emerald-400 hover:bg-slate-50'}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                <div className={`w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-4
                               transition-all duration-300
                               ${isDragging ? 'bg-emerald-100 scale-110' : 'bg-slate-100'}`}>
                  <Upload className={`w-10 h-10 transition-colors duration-300
                                     ${isDragging ? 'text-emerald-500' : 'text-slate-400'}`} />
                </div>

                <h3 className="text-lg font-semibold text-slate-700 mb-2">
                  {isDragging ? 'Laat los om te uploaden' : 'Sleep je CV hier'}
                </h3>
                <p className="text-sm text-slate-500 mb-4">
                  of klik om een bestand te selecteren
                </p>

                <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                    PDF
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                    Word (.doc, .docx)
                  </span>
                  <span>Max 10MB</span>
                </div>
              </div>

              {/* Privacy reminder */}
              <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                <p className="text-sm text-emerald-700">
                  <strong>Privacy:</strong> Persoonsgegevens worden automatisch verwijderd.
                  Werkgevers worden gegeneraliseerd voor optimale privacy.
                </p>
              </div>
            </div>
          )}

          {/* Processing View */}
          {view === 'processing' && (
            <QuickUploadAnimation
              phase={visualPhase}
              progress={visualProgress}
              animationData={state.animationData}
              anonymizationData={state.anonymizationData}
              extractedData={state.extractedData}
              aggregatedSkills={state.aggregatedSkills}
            />
          )}

          {/* Error View */}
          {view === 'error' && (
            <div className="p-12 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 bg-rose-100 rounded-2xl flex items-center justify-center mb-4">
                <AlertCircle className="w-10 h-10 text-rose-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">
                Er ging iets mis
              </h3>
              <p className="text-sm text-slate-500 max-w-sm mb-6">
                {state.error || 'Er is een onbekende fout opgetreden. Probeer het opnieuw.'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="px-5 py-2.5 text-sm font-medium text-slate-600
                           bg-white border border-slate-200 rounded-xl hover:bg-slate-50
                           transition-colors"
                >
                  Sluiten
                </button>
                <button
                  onClick={handleRetry}
                  className="px-5 py-2.5 text-sm font-bold text-white
                           bg-emerald-600 rounded-xl hover:bg-emerald-700
                           transition-colors flex items-center gap-2"
                >
                  <RefreshCcw className="w-4 h-4" />
                  Opnieuw proberen
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer for processing view */}
        {view === 'processing' && state.phase !== 'complete' && (
          <div className="px-6 py-4 border-t border-slate-200 bg-white">
            <button
              onClick={handleClose}
              className="w-full px-4 py-2 text-sm font-medium text-slate-500
                       hover:text-slate-700 transition-colors"
            >
              Annuleren
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickUploadMatchModal;
