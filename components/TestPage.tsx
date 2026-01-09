/**
 * TestPage.tsx v4.1.0 - Met echte API calls en download knoppen
 * ==============================================================
 */

import React, { useState, useCallback } from 'react';

// ============================================================
// TYPES
// ============================================================

interface ValidationCheck {
  type: string;
  field?: string;
  expected?: any;
  value?: any;
  check?: string;
  minLength?: number;
  pattern?: string;
  caseInsensitive?: boolean;
  description: string;
}

interface ValidationResult {
  check: ValidationCheck;
  passed: boolean;
  actual?: any;
  reason?: string;
}

interface TestScenario {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  method: string;
  payload: any;
  validations: ValidationCheck[];
}

interface TestResult {
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  duration: number;
  validationResults: ValidationResult[];
  apiResponse: any;
  error?: string;
  suggestion?: string;
}

interface TestPageProps {
  onClose?: () => void;
  backendUrl?: string;
}

// ============================================================
// TEST SCENARIOS - Echte API calls
// ============================================================

const TEST_SCENARIOS: TestScenario[] = [
  {
    id: '1',
    name: 'Disambiguatie: Architect',
    description: 'Bij "architect" moet het systeem vragen welke architect bedoeld wordt',
    endpoint: '/concept/resolve',
    method: 'POST',
    payload: { searchTerm: 'architect', conceptType: 'occupation' },
    validations: [
      { type: 'exact', field: 'needsDisambiguation', expected: true, description: 'Moet disambiguatie triggeren' },
      { type: 'array_min', field: 'matches', minLength: 2, description: 'Moet meerdere matches retourneren' },
      { type: 'contains', field: 'disambiguationQuestion', value: 'welke', caseInsensitive: true, description: 'Vraag moet "welke" bevatten' }
    ]
  },
  {
    id: '1a',
    name: 'Feedback endpoint',
    description: 'Feedback moet opgeslagen kunnen worden',
    endpoint: '/feedback',
    method: 'POST',
    payload: { rating: 5, feedbackType: 'helpful', comment: 'Test feedback', sessionId: 'test-session' },
    validations: [
      { type: 'exact', field: 'success', expected: true, description: 'Feedback moet succesvol opgeslagen worden' }
    ]
  },
  {
    id: '2',
    name: 'Domein-detectie: MBO Kwalificaties',
    description: 'Vraag over MBO moet domein "education" detecteren',
    endpoint: '/orchestrator/classify',
    method: 'POST',
    payload: { question: 'Toon alle MBO kwalificaties' },
    validations: [
      { type: 'exact', field: 'primary.domainKey', expected: 'education', description: 'Domein moet "education" zijn' },
      { type: 'greater_than', field: 'primary.confidence', value: 0.5, description: 'Confidence moet > 0.5 zijn' }
    ]
  },
  {
    id: '2a',
    name: 'SPARQL generatie: MBO query',
    description: 'MBO vraag moet SPARQL met MboKwalificatie genereren',
    endpoint: '/generate',
    method: 'POST',
    payload: { question: 'Toon alle MBO kwalificaties', filters: { graphs: [], type: 'All', status: 'Current' } },
    validations: [
      { type: 'contains', field: 'sparql', value: 'MboKwalificatie', description: 'SPARQL moet MboKwalificatie bevatten' },
      { type: 'contains', field: 'sparql', value: 'SELECT', description: 'SPARQL moet SELECT bevatten' }
    ]
  },
  {
    id: '3',
    name: 'Vervolgvraag met context',
    description: '"Hoeveel zijn er?" moet context van vorige vraag gebruiken',
    endpoint: '/generate',
    method: 'POST',
    payload: { 
      question: 'Hoeveel zijn er?',
      filters: { graphs: [], type: 'All', status: 'Current' },
      chatHistory: [
        { role: 'user', content: 'Toon alle MBO kwalificaties' },
        { role: 'assistant', content: 'Hier zijn de MBO kwalificaties', sparql: 'SELECT ?k WHERE { ?k a ksmo:MboKwalificatie }' }
      ]
    },
    validations: [
      { type: 'contains', field: 'sparql', value: 'COUNT', description: 'SPARQL moet COUNT bevatten' },
      { type: 'exact', field: 'contextUsed', expected: true, description: 'Context moet gebruikt zijn' }
    ]
  },
  {
    id: '4',
    name: 'Concept resolver: Loodgieter',
    description: '"Loodgieter" moet resolved worden naar officiële naam',
    endpoint: '/concept/resolve',
    method: 'POST',
    payload: { searchTerm: 'loodgieter', conceptType: 'occupation' },
    validations: [
      { type: 'exact', field: 'found', expected: true, description: 'Moet gevonden worden' },
      { type: 'exact', field: 'needsDisambiguation', expected: false, description: 'Geen disambiguatie nodig' },
      { type: 'exists', field: 'resolvedLabel', description: 'Moet een resolvedLabel hebben' }
    ]
  },
  {
    id: '5',
    name: 'Opleiding: Vaardigheden + Kennisgebieden',
    description: 'Vraag over opleiding moet zowel skills als knowledge retourneren',
    endpoint: '/generate',
    method: 'POST',
    payload: { question: 'Wat leer je bij de opleiding werkvoorbereider installaties?', filters: { graphs: [], type: 'All', status: 'Current' } },
    validations: [
      { type: 'contains', field: 'sparql', value: 'prescribesHATEssential', description: 'SPARQL moet vaardigheden bevatten' },
      { type: 'contains', field: 'sparql', value: 'prescribesKnowledge', description: 'SPARQL moet kennisgebieden bevatten' }
    ]
  },
  {
    id: '6',
    name: 'RIASEC Hollandcode',
    description: 'Vraag over RIASEC R moet hasRIASEC predikaat gebruiken',
    endpoint: '/generate',
    method: 'POST',
    payload: { question: 'Geef alle vaardigheden die een relatie hebben met R (RIASEC)', filters: { graphs: [], type: 'All', status: 'Current' } },
    validations: [
      { type: 'contains', field: 'sparql', value: 'hasRIASEC', description: 'SPARQL moet hasRIASEC bevatten' },
      { type: 'regex', field: 'sparql', pattern: '["\']R["\']', description: 'SPARQL moet "R" als waarde hebben' }
    ]
  }
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function validateField(data: any, validation: ValidationCheck): ValidationResult {
  const value = getNestedValue(data, validation.field || '');
  
  const result: ValidationResult = {
    check: validation,
    passed: false,
    actual: value,
    reason: ''
  };
  
  switch (validation.type) {
    case 'exact':
      result.passed = value === validation.expected;
      result.reason = result.passed 
        ? 'Match' 
        : `Verwacht: ${JSON.stringify(validation.expected)}, Kreeg: ${JSON.stringify(value)}`;
      break;
      
    case 'array_min':
      result.passed = Array.isArray(value) && value.length >= (validation.minLength || 0);
      result.reason = result.passed
        ? `Array heeft ${value?.length} items`
        : `Array te kort: ${value?.length || 0} items (min: ${validation.minLength})`;
      break;
      
    case 'contains':
      const searchVal = validation.caseInsensitive ? validation.value?.toLowerCase() : validation.value;
      const actualVal = validation.caseInsensitive ? String(value || '').toLowerCase() : String(value || '');
      result.passed = actualVal.includes(searchVal || '');
      result.reason = result.passed
        ? `Bevat "${validation.value}"`
        : `Bevat NIET "${validation.value}"`;
      break;
      
    case 'regex':
      const regex = new RegExp(validation.pattern || '');
      result.passed = regex.test(String(value || ''));
      result.reason = result.passed
        ? `Matcht regex`
        : `Matcht NIET regex: ${validation.pattern}`;
      break;
      
    case 'exists':
      result.passed = value !== undefined && value !== null;
      result.reason = result.passed ? 'Waarde bestaat' : 'Waarde is undefined/null';
      break;
      
    case 'greater_than':
      result.passed = typeof value === 'number' && value > (validation.value || 0);
      result.reason = result.passed
        ? `${value} > ${validation.value}`
        : `${value} is NIET > ${validation.value}`;
      break;
  }
  
  return result;
}

function generateSuggestion(scenario: TestScenario, failedValidations: ValidationResult[]): string {
  if (scenario.id === '1') {
    if (failedValidations.some(v => v.check.field === 'needsDisambiguation' || v.check.field === 'matches')) {
      return 'Database mist architect data. Voer database-setup-complete.sql opnieuw uit.';
    }
  }
  if (scenario.id === '2' && failedValidations.some(v => v.check.field?.includes('domainKey'))) {
    return 'Check classification_keywords tabel voor "mbo" en "kwalificatie" met domain_id=3 (education).';
  }
  if (scenario.id === '3' && failedValidations.some(v => v.check.field === 'contextUsed')) {
    return 'Follow-up detectie werkt niet. Check chatHistory verwerking in /generate endpoint.';
  }
  if (scenario.id === '4' && failedValidations.some(v => v.check.field === 'found')) {
    return 'Loodgieter niet in database. Voer database-setup-complete.sql uit.';
  }
  return `Check ${scenario.endpoint} endpoint in server.js`;
}

// ============================================================
// TEST PAGE COMPONENT
// ============================================================

const TestPage: React.FC<TestPageProps> = ({ onClose, backendUrl = 'http://localhost:3001' }) => {
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState<string>('');
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [logs, setLogs] = useState<string[]>([]);

  // Check backend status
  React.useEffect(() => {
    checkBackend();
  }, [backendUrl]);

  const checkBackend = async () => {
    setBackendStatus('checking');
    try {
      const response = await fetch(`${backendUrl}/health`);
      setBackendStatus(response.ok ? 'online' : 'offline');
    } catch {
      setBackendStatus('offline');
    }
  };

  const addLog = (message: string) => {
    const timestamp = new Date().toISOString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const runTest = async (scenario: TestScenario): Promise<TestResult> => {
    const startTime = Date.now();
    addLog(`Starting test ${scenario.id}: ${scenario.name}`);
    addLog(`  Endpoint: ${scenario.method} ${backendUrl}${scenario.endpoint}`);
    addLog(`  Payload: ${JSON.stringify(scenario.payload)}`);
    
    try {
      const response = await fetch(`${backendUrl}${scenario.endpoint}`, {
        method: scenario.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scenario.payload)
      });
      
      const data = await response.json();
      const duration = Date.now() - startTime;
      
      addLog(`  Response (${duration}ms): ${JSON.stringify(data).substring(0, 500)}`);
      
      const validationResults = scenario.validations.map(v => validateField(data, v));
      const allPassed = validationResults.every(v => v.passed);
      const failedValidations = validationResults.filter(v => !v.passed);
      
      validationResults.forEach(vr => {
        addLog(`  ${vr.passed ? '✅' : '❌'} ${vr.check.description}: ${vr.reason}`);
      });
      
      const suggestion = allPassed ? '' : generateSuggestion(scenario, failedValidations);
      if (suggestion) addLog(`  💡 Suggestie: ${suggestion}`);
      
      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        passed: allPassed,
        duration,
        validationResults,
        apiResponse: data,
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
        apiResponse: null,
        error: error.message,
        suggestion: `API call failed: ${error.message}`
      };
    }
  };

  const runAllTests = async () => {
    setIsRunning(true);
    setResults([]);
    setLogs([]);
    addLog('='.repeat(60));
    addLog('CompetentNL Test Suite v4.1.0 - Starting');
    addLog(`Backend: ${backendUrl}`);
    addLog('='.repeat(60));
    
    const newResults: TestResult[] = [];
    
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
  };

  const runSingleTest = async (scenarioId: string) => {
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
  };

  // Download functions
  const downloadJSON = () => {
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
          actual: vr.actual,
          reason: vr.reason
        })),
        suggestion: r.suggestion,
        apiResponse: r.apiResponse
      }))
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-results-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadTXT = () => {
    const content = logs.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-results-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
        background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
        padding: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>
            🧪 CompetentNL Test Suite v4.1.0
          </h1>
          <p style={{ margin: '8px 0 0', opacity: 0.8, fontSize: '14px' }}>
            Met echte API calls en download functie
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
          {onClose && (
            <button 
              onClick={onClose}
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
              backgroundColor: '#10b981',
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
                  backgroundColor: '#14b8a6',
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
                  backgroundColor: '#059669',
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
                  border: isCurrentTest ? '2px solid #10b981' : '1px solid #334155'
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
                        {!vr.passed && vr.reason && (
                          <span style={{ display: 'block', fontSize: '12px', opacity: 0.7, marginLeft: '16px' }}>
                            {vr.reason}
                          </span>
                        )}
                      </div>
                    ))}
                    
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
