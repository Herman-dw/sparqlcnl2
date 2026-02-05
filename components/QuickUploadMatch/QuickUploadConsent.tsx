/**
 * QuickUploadConsent Component
 * Consent dialog voor snelle upload met privacy uitleg
 */

import React, { useState } from 'react';
import {
  Shield,
  ArrowRight,
  Lightbulb,
  Zap,
  FileText,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { QuickUploadConsentProps } from '../../types/quickMatch';

const QuickUploadConsent: React.FC<QuickUploadConsentProps> = ({
  onConsent,
  onCancel,
  onGoToWizard
}) => {
  const [agreed, setAgreed] = useState(false);

  const piiExamples = [
    { original: '"Jan de Vries"', replacement: '[NAAM]', type: 'Naam' },
    { original: '"jan@email.nl"', replacement: '[EMAIL]', type: 'E-mail' },
    { original: '"06-12345678"', replacement: '[TELEFOON]', type: 'Telefoon' },
    { original: '"Hoofdstraat 1"', replacement: '[ADRES]', type: 'Adres' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
          <Zap className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Snelle Upload & Match</h2>
        <p className="mt-2 text-sm text-slate-500">
          Direct van CV naar matchresultaten in enkele seconden
        </p>
      </div>

      {/* Privacy info card */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-800">Privacy Informatie</h3>
            <p className="mt-2 text-sm text-slate-600">
              Bij snelle verwerking worden je persoonsgegevens <strong>automatisch</strong> verwijderd
              en vervangen door labels:
            </p>

            {/* PII Examples */}
            <div className="mt-4 space-y-2 bg-white rounded-lg p-3 border border-slate-100">
              {piiExamples.map((example, idx) => (
                <div key={idx} className="flex items-center gap-3 text-sm">
                  <span className="text-slate-400 font-mono w-32 truncate">{example.original}</span>
                  <ArrowRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  <span className="text-emerald-600 font-mono font-semibold">{example.replacement}</span>
                  <span className="text-xs text-slate-400 ml-auto">{example.type}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-start gap-2 text-sm text-slate-500">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p>
                Dit gebeurt automatisch met AI-detectie. In zeldzame gevallen kan iets gemist worden.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* What happens */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
        <h4 className="font-semibold text-emerald-800 mb-3 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Wat gebeurt er?
        </h4>
        <ul className="space-y-2 text-sm text-emerald-700">
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            Persoonsgegevens worden automatisch verwijderd
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            Werkgevers worden gegeneraliseerd (bv. "Microsoft" → "Grote tech")
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            Beste classificaties worden automatisch gekozen
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            Skills worden afgeleid van opleidingen en beroepen
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            Direct matchen met alle beroepen in de database
          </li>
        </ul>
      </div>

      {/* Consent checkbox */}
      <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl border-2 border-slate-200 hover:border-emerald-300 transition-colors">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 w-5 h-5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
        />
        <span className="text-sm text-slate-700">
          Ik begrijp dat persoonsgegevens <strong>automatisch</strong> worden verwijderd
          en ga akkoord met deze verwerking
        </span>
      </label>

      {/* Alternative: Wizard link */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Lightbulb className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-amber-800">
              <strong>Wil je volledige controle over elke stap?</strong>
              <br />
              <span className="text-amber-700">
                Gebruik dan de CV Wizard waar je elke detectie kunt controleren
                en aanpassen voordat je verdergaat.
              </span>
            </p>
            <button
              onClick={onGoToWizard}
              className="mt-3 text-sm font-medium text-amber-700 hover:text-amber-800
                         flex items-center gap-1 group"
            >
              Naar CV Wizard (stap-voor-stap)
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
        <button
          onClick={onCancel}
          className="px-5 py-2.5 text-sm font-medium text-slate-600
                     bg-white border border-slate-200 rounded-xl hover:bg-slate-50
                     transition-colors"
        >
          Annuleren
        </button>
        <button
          onClick={onConsent}
          disabled={!agreed}
          className="px-6 py-2.5 text-sm font-bold text-white
                     bg-gradient-to-r from-emerald-500 to-green-500
                     rounded-xl hover:from-emerald-600 hover:to-green-600
                     disabled:from-slate-300 disabled:to-slate-300
                     disabled:cursor-not-allowed transition-all
                     flex items-center gap-2 shadow-lg shadow-emerald-500/25
                     disabled:shadow-none"
        >
          <Zap className="w-4 h-4" />
          Akkoord & Uploaden
        </button>
      </div>
    </div>
  );
};

export default QuickUploadConsent;
