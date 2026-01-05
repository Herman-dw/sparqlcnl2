/**
 * TestPage.tsx v4.2.0 - Chat-gesimuleerde test suite
 * ===================================================
 *
 * Draait alle scenario's via de TestRunner zodat de flow overeenkomt
 * met hoe een gebruiker in de chat vragen stelt (classify → resolve → generate).
 */

import React, { useCallback, useMemo, useState } from 'react';
import { TestRunner } from '../tests/testRunner';
import { TEST_SCENARIOS, TestResult, TestScenario, ValidationCheck } from '../tests/testScenarios';

interface UITestResult extends TestResult {
  scenarioName: string;
  suggestion?: string;
}

interface TestPageProps {
  onClose?: () => void;
  onBack?: () => void;
  backendUrl?: string;
}

function generateSuggestion(
  scenario: TestScenario,
  failedValidations: UITestResult['validationResults']
): string {
  const hasFailedCheck = (type: ValidationCheck['type'], value?: string | number | boolean | RegExp) =>
    failedValidations.some(v => v.check.type === type && (value === undefined || v.check.value === value));

  switch (scenario.id) {
    case 'disambiguation-architect':
      if (hasFailedCheck('needs_disambiguation') || hasFailedCheck('has_matches')) {
        return 'Controleer of concept-resolve meerdere architecten teruggeeft (database seed of fallback).';
      }
      return 'Check de disambiguatieflow in /concept/resolve.';
    case 'domain-detection-education':
      if (hasFailedCheck('domain_equals')) {
        return 'Classificatie mist education-domein; controleer classification_keywords of fallback classificatie.';
      }
      return 'Controleer orchestrator/classify endpoint.';
    case 'follow-up-context':
      if (hasFailedCheck('context_used')) {
        return 'De chatgeschiedenis wordt niet opgepakt; verwerk chatHistory in /generate.';
      }
      return 'Controleer context-handling in de generate endpoint.';
    case 'concept-resolver-loodgieter':
      if (hasFailedCheck('concept_resolved', 'loodgieter')) {
        return 'Voeg loodgieter of synoniem toe aan concept-resolver dataset.';
      }
      return 'Controleer resolutiepad voor beroepen.';
    case 'count-handling-large-results':
      if (hasFailedCheck('count_triggered')) {
        return 'COUNT-indicatie ontbreekt; controleer grote-resultatenlogica in SPARQL generatie.';
      }
      return 'Controleer of er een limit/count query wordt toegevoegd bij grote sets.';
    default:
      return failedValidations.length > 0
        ? `Controleer scenario "${scenario.name}" in backend flow.`
        : '';
  }
}

const TestPage: React.FC<TestPageProps> = ({ onClose, onBack, backendUrl = 'http://localhost:3001' }) => {
  const [results, setResults] = useState<UITestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState<string>('');
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [logs, setLogs] = useState<string[]>([]);

  const runner = useMemo(() => new TestRunner({ backendUrl, verbose: false }), [backendUrl]);

  const checkBackend = useCallback(async () => {
    setBackendStatus('checking');
    try {
      const response = await fetch(`${backendUrl}/health`);
      setBackendStatus(response.ok ? 'online' : 'offline');
    } catch {
      setBackendStatus('offline');
    }
  }, [backendUrl]);

  // Check backend status
  React.useEffect(() => {
    checkBackend();
  }, [checkBackend]);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toISOString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  const runTest = useCallback(
    async (scenario: TestScenario): Promise<UITestResult> => {
      const startTime = Date.now();
      addLog(`Starting test ${scenario.id}: ${scenario.name}`);
      addLog(`  Vraag: ${scenario.question}`);

      try {
        const result = await runner.runSingleTest(scenario);
        const duration = Date.now() - startTime;

        result.consoleOutput.forEach(line => addLog(`  ${line}`));
        if (result.responseText) {
          addLog(`  Response: ${result.responseText.substring(0, 200)}`);
        }
        if (result.sparqlGenerated) {
          addLog(`  SPARQL: ${result.sparqlGenerated.substring(0, 200)}`);
        }

        result.validationResults.forEach(vr => {
          const detail = vr.actualValue ? ` (waarde: ${vr.actualValue})` : '';
          const error = vr.error ? ` [${vr.error}]` : '';
          addLog(`  ${vr.passed ? '✅' : '❌'} ${vr.check.description}${detail}${error}`);
        });

        const suggestion = result.passed ? '' : generateSuggestion(scenario, result.validationResults);
        if (suggestion) addLog(`  💡 Suggestie: ${suggestion}`);

        return {
          ...result,
          duration,
          scenarioName: scenario.name,
          suggestion
        };
      } catch (error: any) {
        const duration = Date.now() - startTime;
        addLog(`  ❌ Error: ${error.message}`);

        return {
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          passed: false,
          duration,
          validationResults: [],
          consoleOutput: [],
          sparqlGenerated: undefined,
          responseText: undefined,
          error: error.message,
          suggestion: `API call failed: ${error.message}`
        };
      }
    },
    [addLog, runner]
  );

  const runAllTests = useCallback(async () => {
    setIsRunning(true);
    setResults([]);
    setLogs([]);
    addLog('='.repeat(60));
    addLog('CompetentNL Test Suite v4.2.0 - Starting (chatflow)');
    addLog(`Backend: ${backendUrl}`);
    addLog('='.repeat(60));

    const newResults: UITestResult[] = [];

    for (const scenario of TEST_SCENARIOS) {
      setCurrentTest(scenario.id);
      const result = await runTest(scenario);
      newResults.push(result);
      setResults([...newResults]);
    }

    const passed = newResults.filter(r => r.passed).length;
    addLog('='.repeat(60));
    addLog(`RESULTAAT: ${passed}/${newResults.length} tests geslaagd`);
    addLog('='.repeat(60));

    setCurrentTest('');
    setIsRunning(false);
  }, [addLog, backendUrl, runTest]);

  const runSingleTest = useCallback(
    async (scenarioId: string) => {
      const scenario = TEST_SCENARIOS.find(s => s.id === scenarioId);
      if (!scenario) return;

      setIsRunning(true);
      setCurrentTest(scenarioId);
      addLog(`\n--- Running single test: ${scenario.name} ---`);

      const result = await runTest(scenario);

      setResults(prev => {
        const filtered = prev.filter(r => r.scenarioId !== scenarioId);
        return [...filtered, result].sort((a, b) => a.scenarioId.localeCompare(b.scenarioId));
      });

      setCurrentTest('');
      setIsRunning(false);
    },
    [addLog, runTest]
  );

  // Download functions
  const downloadJSON = useCallback(() => {
    const data = {
      timestamp: new Date().toISOString(),
      backendUrl,
      summary: {
        total: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length
      },
      results: results.map(r => ({
        id: r.scenarioId,
        name: r.scenarioName,
        passed: r.passed,
        duration: r.duration,
        validationResults: r.validationResults.map(vr => ({
          description: vr.check.description,
          passed: vr.passed,
          actual: vr.actualValue,
          error: vr.error
        })),
        suggestion: r.suggestion,
        response: r.responseText,
        sparql: r.sparqlGenerated,
        consoleOutput: r.consoleOutput
      }))
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-results-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [backendUrl, results]);

  const downloadTXT = useCallback(() => {
    const content = logs.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-results-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logs]);

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f172a',
      color: '#e2e8f0',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a8a 0%, #7c3aed 100%)',
        padding: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>
            🧪 CompetentNL Test Suite v4.2.0
          </h1>
          <p style={{ margin: '8px 0 0', opacity: 0.8, fontSize: '14px' }}>
            Chat-simulatie: classify → resolve → generate
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{
            padding: '6px 12px',
            borderRadius: '9999px',
            fontSize: '12px',
            fontWeight: '500',
            backgroundColor: backendStatus === 'online' ? '#22c55e' :
              backendStatus === 'offline' ? '#ef4444' : '#eab308'
          }}>
            {backendStatus === 'online' ? '🟢 Backend Online' :
              backendStatus === 'offline' ? '🔴 Backend Offline' : '🟡 Checking...'}
          </span>
          {(onClose || onBack) && (
            <button
              onClick={onClose || onBack}
              style={{
                padding: '8px 16px',
                backgroundColor: 'rgba(255,255,255,0.2)',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              ✕ Sluiten
            </button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div style={{ padding: '16px 24px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={runAllTests}
            disabled={isRunning || backendStatus !== 'online'}
            style={{
              padding: '12px 24px',
              backgroundColor: isRunning ? '#475569' : '#22c55e',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              fontWeight: '600',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {isRunning ? '⏳ Running...' : '▶️ Run Alle Tests'}
          </button>

          <button
            onClick={checkBackend}
            style={{
              padding: '12px 24px',
              backgroundColor: '#3b82f6',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            🔄 Check Backend
          </button>

          {results.length > 0 && (
            <>
              <div style={{ height: '32px', width: '1px', backgroundColor: '#475569' }} />

              <button
                onClick={downloadJSON}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#8b5cf6',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                📥 Download JSON
              </button>

              <button
                onClick={downloadTXT}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#6366f1',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                📄 Download Log (TXT)
              </button>
            </>
          )}

          {results.length > 0 && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px', fontSize: '14px' }}>
              <span style={{ color: '#22c55e' }}>✅ {passed} geslaagd</span>
              <span style={{ color: '#ef4444' }}>❌ {failed} gefaald</span>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', padding: '24px' }}>
        {/* Left: Test Results */}
        <div>
          <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px' }}>Test Resultaten</h2>

          {TEST_SCENARIOS.map(scenario => {
            const result = results.find(r => r.scenarioId === scenario.id);
            const isCurrentTest = currentTest === scenario.id;

            return (
              <div
                key={scenario.id}
                style={{
                  backgroundColor: '#1e293b',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '12px',
                  border: isCurrentTest ? '2px solid #3b82f6' : '1px solid #334155'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>
                        {isCurrentTest ? '⏳' : result ? (result.passed ? '✅' : '❌') : '⬜'}
                      </span>
                      <span style={{ fontWeight: '600' }}>Test {scenario.id}: {scenario.name}</span>
                      {result && (
                        <span style={{ fontSize: '12px', opacity: 0.6 }}>
                          ({result.duration}ms)
                        </span>
                      )}
                    </div>
                    <p style={{ margin: '8px 0 0', fontSize: '13px', opacity: 0.7 }}>
                      {scenario.description}
                    </p>
                  </div>

                  <button
                    onClick={() => runSingleTest(scenario.id)}
                    disabled={isRunning || backendStatus !== 'online'}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#475569',
                      border: 'none',
                      borderRadius: '6px',
                      color: 'white',
                      fontSize: '12px',
                      cursor: isRunning ? 'not-allowed' : 'pointer'
                    }}
                  >
                    ▶️ Run
                  </button>
                </div>

                {/* Validation details */}
                {result && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #334155' }}>
                    {result.validationResults.map((vr, i) => (
                      <div key={i} style={{
                        fontSize: '13px',
                        padding: '4px 0',
                        color: vr.passed ? '#86efac' : '#fca5a5'
                      }}>
                        {vr.passed ? '✓' : '✗'} {vr.check.description}
                        {!vr.passed && vr.actualValue && (
                          <span style={{ display: 'block', fontSize: '12px', opacity: 0.7, marginLeft: '16px' }}>
                            Waarde: {vr.actualValue}
                          </span>
                        )}
                        {vr.error && (
                          <span style={{ display: 'block', fontSize: '12px', opacity: 0.7, marginLeft: '16px' }}>
                            Error: {vr.error}
                          </span>
                        )}
                      </div>
                    ))}

                    {result.responseText && (
                      <div style={{ marginTop: '8px', fontSize: '12px', opacity: 0.8 }}>
                        <strong>Antwoord:</strong> {result.responseText}
                      </div>
                    )}
                    {result.sparqlGenerated && (
                      <div style={{ marginTop: '8px', fontSize: '12px', opacity: 0.8 }}>
                        <strong>SPARQL:</strong> {result.sparqlGenerated}
                      </div>
                    )}

                    {result.suggestion && (
                      <div style={{
                        marginTop: '8px',
                        padding: '8px 12px',
                        backgroundColor: '#422006',
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: '#fbbf24'
                      }}>
                        💡 {result.suggestion}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right: Logs */}
        <div>
          <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '18px' }}>
            Console Output
            {logs.length > 0 && (
              <span style={{ fontSize: '12px', opacity: 0.6, marginLeft: '8px' }}>
                ({logs.length} regels)
              </span>
            )}
          </h2>

          <div style={{
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '16px',
            height: 'calc(100vh - 280px)',
            overflow: 'auto',
            fontFamily: 'monospace',
            fontSize: '12px',
            lineHeight: '1.6'
          }}>
            {logs.length === 0 ? (
              <div style={{ opacity: 0.5 }}>
                Klik "Run Alle Tests" om te beginnen...
              </div>
            ) : (
              logs.map((log, i) => (
                <div key={i} style={{
                  color: log.includes('✅') || log.includes('✓') ? '#86efac' :
                    log.includes('❌') || log.includes('✗') ? '#fca5a5' :
                      log.includes('💡') ? '#fbbf24' :
                        log.includes('===') ? '#94a3b8' :
                          '#e2e8f0',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all'
                }}>
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestPage;
