/**
 * CV Upload Modal Component
 * Drag & drop upload interface met privacy-first messaging
 */

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';

import { CVUploadResponse, CVStatusResponse } from '../types/cv';

interface CVUploadModalProps {
  sessionId: string;
  onComplete: (cvId: number) => void;
  onClose: () => void;
  isOpen: boolean;
  backendUrl?: string; // Optional: defaults to relative URL, but can use direct backend URL
}

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'completed' | 'error';

export const CVUploadModal: React.FC<CVUploadModalProps> = ({
  sessionId,
  onComplete,
  onClose,
  isOpen,
  backendUrl = 'http://localhost:3001' // Default to direct backend URL
}) => {
  // Build API base URL
  const apiBase = backendUrl;
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cvId, setCvId] = useState<number | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];

    // Validatie
    if (file.size > 10 * 1024 * 1024) {
      setError('Bestand is te groot. Maximum is 10 MB.');
      return;
    }

    try {
      setStatus('uploading');
      setError(null);
      setProgress(0);

      // Upload
      const formData = new FormData();
      formData.append('cv', file);
      formData.append('sessionId', sessionId);

      const response = await axios.post<CVUploadResponse>(
        `${apiBase}/api/cv/upload`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percentCompleted = Math.round(
                (progressEvent.loaded * 100) / progressEvent.total
              );
              setProgress(Math.min(percentCompleted, 90)); // Leave 10% for processing
            }
          }
        }
      );

      if (response.data.success) {
        setCvId(response.data.cvId);
        setStatus('processing');
        setProgress(90);

        // Poll for completion (als processing nog bezig is)
        if (response.data.processingStatus === 'processing') {
          await pollProcessingStatus(response.data.cvId);
        } else {
          // Direct klaar
          setStatus('completed');
          setProgress(100);
          setTimeout(() => {
            onComplete(response.data.cvId);
          }, 1000);
        }
      } else {
        throw new Error('Upload failed');
      }

    } catch (err) {
      console.error('Upload error:', err);
      setStatus('error');

      if (axios.isAxiosError(err)) {
        if (err.response?.status === 503) {
          setError('De CV-analyse service is tijdelijk niet beschikbaar. Probeer het later opnieuw.');
        } else {
          setError(err.response?.data?.message || 'Upload mislukt. Probeer het opnieuw.');
        }
      } else {
        setError('Er is een fout opgetreden. Probeer het opnieuw.');
      }
    }
  }, [sessionId, onComplete]);

  const pollProcessingStatus = async (cvId: number) => {
    const maxAttempts = 30; // 30 * 2 sec = 60 sec max
    let attempts = 0;

    const poll = async (): Promise<void> => {
      try {
        const response = await axios.get<CVStatusResponse>(`${apiBase}/api/cv/${cvId}/status`);

        if (response.data.status === 'completed') {
          setStatus('completed');
          setProgress(100);
          setTimeout(() => {
            onComplete(cvId);
          }, 1000);
          return;
        }

        if (response.data.status === 'failed') {
          throw new Error(response.data.error || 'Processing failed');
        }

        // Update progress
        if (response.data.progress) {
          setProgress(Math.max(progress, response.data.progress));
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000); // Poll elke 2 seconden
        } else {
          throw new Error('Processing timeout');
        }
      } catch (err) {
        setStatus('error');
        setError('Verwerking mislukt. Probeer het opnieuw.');
      }
    };

    await poll();
  };

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

  const handleReset = () => {
    setStatus('idle');
    setProgress(0);
    setError(null);
    setCvId(null);
  };

  if (!isOpen) return null;

  return (
    <div className="cv-upload-modal-overlay" onClick={onClose}>
      <div className="cv-upload-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📄 Upload je CV</h2>
          <button className="close-button" onClick={onClose} aria-label="Sluiten">
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* Privacy notice */}
          <div className="privacy-notice">
            <span className="icon">🔒</span>
            <div className="text">
              <strong>Privacy garantie:</strong>
              <p>
                Je CV wordt alleen gebruikt voor matching. Persoonsgegevens (naam, email, telefoon)
                worden automatisch verwijderd voordat we je CV analyseren.
              </p>
            </div>
          </div>

          {/* Upload area (alleen zichtbaar in idle state) */}
          {status === 'idle' && (
            <div
              {...getRootProps()}
              className={`dropzone ${isDragActive ? 'active' : ''}`}
            >
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
                <p className="file-types">
                  Ondersteund: PDF, Word (.docx, .doc) • Max. 10 MB
                </p>
              </div>
            </div>
          )}

          {/* Progress indicator */}
          {(status === 'uploading' || status === 'processing') && (
            <div className="progress-container">
              <div className="spinner"></div>
              <div className="progress-info">
                <p className="status-text">
                  {status === 'uploading' && 'Uploaden...'}
                  {status === 'processing' && 'Analyseren van je CV...'}
                </p>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <p className="progress-text">{progress}%</p>
              </div>
              <p className="sub-text">Dit kan 10-30 seconden duren</p>
            </div>
          )}

          {/* Success */}
          {status === 'completed' && (
            <div className="success-container">
              <span className="icon success">✅</span>
              <p className="success-text">CV succesvol geüpload!</p>
              <p className="sub-text">Je wordt doorgestuurd naar het review scherm...</p>
            </div>
          )}

          {/* Error */}
          {status === 'error' && error && (
            <div className="error-container">
              <span className="icon error">❌</span>
              <p className="error-text">{error}</p>
              <button className="retry-button" onClick={handleReset}>
                Opnieuw proberen
              </button>
            </div>
          )}
        </div>

        {/* Footer info */}
        {status === 'idle' && (
          <div className="modal-footer">
            <p className="info-text">
              <span className="icon">ℹ️</span>
              Je CV wordt automatisch verwijderd na 30 dagen (GDPR compliance)
            </p>
          </div>
        )}
      </div>

      <style jsx>{`
        .cv-upload-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .cv-upload-modal {
          background: white;
          border-radius: 12px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          max-width: 600px;
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
          font-weight: 600;
        }

        .close-button {
          background: none;
          border: none;
          font-size: 32px;
          cursor: pointer;
          color: #6b7280;
          line-height: 1;
          padding: 0;
          width: 32px;
          height: 32px;
        }

        .close-button:hover {
          color: #374151;
        }

        .modal-body {
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
          flex-shrink: 0;
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
          line-height: 1.5;
        }

        .dropzone {
          border: 2px dashed #d1d5db;
          border-radius: 8px;
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

        .progress-container,
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
          margin: 0 auto 24px auto;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .progress-info .status-text {
          font-size: 18px;
          font-weight: 600;
          color: #1f2937;
          margin: 0 0 16px 0;
        }

        .progress-bar {
          width: 100%;
          height: 8px;
          background: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 8px;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #3b82f6, #2563eb);
          transition: width 0.3s;
        }

        .progress-text {
          font-size: 14px;
          color: #6b7280;
          margin: 0;
        }

        .sub-text {
          font-size: 14px;
          color: #9ca3af;
          margin: 16px 0 0 0;
        }

        .success-container .icon {
          font-size: 64px;
          display: block;
          margin-bottom: 16px;
        }

        .success-text {
          font-size: 20px;
          font-weight: 600;
          color: #065f46;
          margin: 0 0 8px 0;
        }

        .error-container .icon {
          font-size: 64px;
          display: block;
          margin-bottom: 16px;
        }

        .error-text {
          font-size: 16px;
          color: #991b1b;
          margin: 0 0 24px 0;
          line-height: 1.5;
        }

        .retry-button {
          background: #3b82f6;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .retry-button:hover {
          background: #2563eb;
        }

        .modal-footer {
          padding: 16px 24px;
          background: #f9fafb;
          border-top: 1px solid #e5e7eb;
          border-bottom-left-radius: 12px;
          border-bottom-right-radius: 12px;
        }

        .modal-footer .info-text {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0;
          font-size: 13px;
          color: #6b7280;
        }

        .modal-footer .icon {
          font-size: 16px;
        }
      `}</style>
    </div>
  );
};

export default CVUploadModal;
