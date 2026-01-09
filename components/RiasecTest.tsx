import React, { useMemo, useRef, useState } from 'react';

type RiasecLetter = 'R' | 'I' | 'A' | 'S' | 'E' | 'C';

const statements: Record<RiasecLetter, string[]> = {
  R: [
    'Ik werk graag met mijn handen en gereedschap.',
    'Ik haal voldoening uit het oplossen van praktische, tastbare problemen.',
    'Ik ben graag buiten of in een werkomgeving waar ik actief kan zijn.',
    'Ik voel me comfortabel met techniek, machines of materialen.'
  ],
  I: [
    'Ik analyseer graag informatie en los theoretische vraagstukken op.',
    'Ik geniet van experimenteren en onderzoeken.',
    'Ik werk graag met data, modellen of concepten.',
    'Ik denk logisch en ben nieuwsgierig naar hoe dingen werken.'
  ],
  A: [
    'Ik druk mezelf graag creatief uit (bijv. schrijven, ontwerpen, muziek).',
    'Ik bedenk originele ideeÃ«n of nieuwe invalshoeken.',
    'Ik waardeer vrijheid en ruimte om te improviseren.',
    'Ik voel me thuis in een omgeving die openstaat voor nieuwe vormen en experimenten.'
  ],
  S: [
    'Ik help graag anderen en geef ondersteuning of begeleiding.',
    'Ik kan me goed inleven in mensen en hun behoeften.',
    'Ik voel me prettig in een samenwerkingsgerichte omgeving.',
    'Ik haal energie uit het organiseren van activiteiten met/voor anderen.'
  ],
  E: [
    'Ik neem graag initiatief en houd ervan om doelen te bereiken.',
    'Ik vind het leuk om mensen te overtuigen of te enthousiasmeren.',
    'Ik voel me prettig in een competitieve omgeving.',
    'Ik neem graag verantwoordelijkheid en leiding.'
  ],
  C: [
    'Ik werk nauwkeurig en gestructureerd.',
    'Ik houd van duidelijkheid, regels en processen.',
    'Ik organiseer informatie graag zodat het overzichtelijk is.',
    'Ik vind het belangrijk om afspraken en procedures te volgen.'
  ]
};

const letterInfo: Record<RiasecLetter, string> = {
  R: 'Realistisch â€“ praktisch, handig, houdt van doen.',
  I: 'Investigatief â€“ onderzoekend, analytisch, nieuwsgierig.',
  A: 'Artistiek â€“ creatief, origineel, expressief.',
  S: 'Sociaal â€“ helpend, samenwerkend, empathisch.',
  E: 'Enterprising â€“ ondernemend, overtuigend, leidend.',
  C: 'Conventioneel â€“ ordelijk, precies, procesgericht.'
};

interface RiasecTestProps {
  onBack?: () => void;
  onResultComplete?: (result: RiasecResult) => void;
}

interface RiasecResult {
  code: string;
  scores: Array<[RiasecLetter, number]>;
}

export type { RiasecResult };

const RiasecTest: React.FC<RiasecTestProps> = ({ onBack, onResultComplete }) => {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [result, setResult] = useState<RiasecResult | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const totalStatements = useMemo(
    () => Object.values(statements).reduce((total, items) => total + items.length, 0),
    []
  );

  const handleAnswerChange = (key: string, value: number) => {
    setAnswers(prev => ({ ...prev, [key]: value }));
  };

  const aggregateScores = (): Record<RiasecLetter, number> => {
    const scores: Record<RiasecLetter, number> = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
    Object.entries(statements).forEach(([letter, items]) => {
      items.forEach((_, idx) => {
        const key = `${letter}-${idx}`;
        if (answers[key]) {
          scores[letter as RiasecLetter] += answers[key];
        }
      });
    });
    return scores;
  };

  const sortScores = (scores: Record<RiasecLetter, number>) =>
    Object.entries(scores).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    ) as Array<[RiasecLetter, number]>;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const isComplete = Object.keys(answers).length === totalStatements;
    if (!isComplete) {
      setError('Niet alle stellingen zijn ingevuld. Vul overal een score in.');
      setResult(null);
      return;
    }

    const scores = aggregateScores();
    const sorted = sortScores(scores);
    const code = sorted.slice(0, 3).map(([letter]) => letter).join('');

    setResult({ code, scores: sorted });
    setError('');

    requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  return (
    <div className="bg-slate-50 min-h-[calc(100vh-88px)]">
      <div className="bg-emerald-800 text-white px-6 py-10 shadow-lg">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-200">Zelftest</p>
          <h1 className="text-3xl font-black mt-2">RIASEC-zelftest</h1>
          <p className="mt-3 text-emerald-100 leading-relaxed max-w-3xl">
            Ontdek jouw Holland-code via 24 korte stellingen. Geef per stelling aan hoe sterk deze
            bij je past op een schaal van 1 (helemaal niet) tot 5 (zeer van toepassing).
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            {onBack && (
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl font-semibold shadow-lg hover:bg-slate-800 transition"
              >
                â† Terug naar chat
              </button>
            )}
            <a
              href="https://en.wikipedia.org/wiki/Holland_Codes"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 bg-white/10 text-white px-4 py-2 rounded-xl font-semibold shadow-lg hover:bg-white/20 transition"
            >
              Meer over Holland-codes
            </a>
          </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto -mt-10 pb-12 px-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 sm:p-8">
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Hoe werkt het?</h3>
              <p className="text-sm text-slate-600">
                Beantwoord alle stellingen. We tellen per RIASEC-letter de punten op en tonen je top-3 code.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Schaal</h3>
              <p className="text-sm text-slate-600">
                1 = helemaal niet van toepassing Â· 3 = neutraal Â· 5 = zeer van toepassing
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Tip</h3>
              <p className="text-sm text-slate-600">
                Gebruik je eerste gevoel. Er zijn geen foute antwoorden.
              </p>
            </div>
          </section>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {Object.entries(statements).map(([letter, items]) => (
                <section
                  key={letter}
                  className="border border-slate-100 rounded-xl p-4 bg-gradient-to-b from-white to-slate-50 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-slate-900">
                      {letter}{' '}
                      <span className="text-sm font-normal text-slate-500">{letterInfo[letter as RiasecLetter]}</span>
                    </h2>
                    <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                      {items.length} stellingen
                    </span>
                  </div>
                  <div className="mt-3 space-y-3">
                    {items.map((text, idx) => {
                      const name = `${letter}-${idx}`;
                      return (
                        <div key={name} className="pt-3 border-t border-slate-100 first:border-t-0 first:pt-0">
                          <p className="text-sm text-slate-800">{text}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {[1, 2, 3, 4, 5].map(value => (
                              <label
                                key={`${name}-${value}`}
                                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition ${
                                  answers[name] === value
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                    : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-200 hover:text-emerald-700'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={name}
                                  value={value}
                                  className="accent-emerald-600"
                                  checked={answers[name] === value}
                                  onChange={() => handleAnswerChange(name, value)}
                                />
                                {value}
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="submit"
                className="inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-3 rounded-xl font-semibold shadow-lg hover:bg-emerald-700 transition"
              >
                Bereken mijn RIASEC-code
              </button>
              <span className="text-sm text-slate-500">
                Beantwoord alle {totalStatements} stellingen om je persoonlijke code te zien.
              </span>
            </div>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-800 p-4 text-sm">
                {error}
              </div>
            )}

            <div ref={resultRef}>
              {result && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 p-5 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
                    Jouw Holland-code
                  </div>
                  <div className="text-3xl font-black text-emerald-900">{result.code}</div>
                  <ul className="space-y-2 text-sm text-emerald-900">
                    {result.scores.map(([letter, score]) => (
                      <li key={letter} className="flex items-start gap-2">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white border border-emerald-200 text-emerald-700 font-semibold">
                          {letter}
                        </span>
                        <div>
                          <div className="font-semibold">
                            {letter} ({score}): {letterInfo[letter]}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="text-sm text-emerald-900">
                    Meer lezen? Bekijk{' '}
                    <a
                      href="https://en.wikipedia.org/wiki/Holland_Codes"
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-emerald-400 decoration-2 underline-offset-2 font-semibold"
                    >
                      de Holland-codes
                    </a>{' '}
                    of{' '}
                    <a
                      href="https://www.onderwijskiezer.be/v2/hulpmiddelen/riasec.php"
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-emerald-400 decoration-2 underline-offset-2 font-semibold"
                    >
                      een Nederlandse toelichting
                    </a>
                    .
                  </p>
                  
                  {/* Doorgaan naar vaardigheden selectie */}
                  {onResultComplete && (
                    <div className="pt-4 mt-4 border-t border-emerald-200">
                      <button
                        type="button"
                        onClick={() => onResultComplete(result)}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition-all"
                      >
                        <span>Selecteer vaardigheden op basis van je profiel</span>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </button>
                      <p className="mt-2 text-xs text-emerald-700">
                        Kies vaardigheden die bij je passen en ontdek welke beroepen het beste matchen.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </form>
        </div>
        <p className="text-center text-xs text-slate-500 mt-6">
          Gebaseerd op het Holland/RIASEC-model. Gebruik voor persoonlijke reflectie; geen formele loopbaanadviesdiagnose.
        </p>
      </main>
    </div>
  );
};

export default RiasecTest;
