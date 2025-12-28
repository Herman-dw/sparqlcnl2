/**
 * CompetentNL Test Dashboard Component
 * =====================================
 * 
 * React component dat een visueel test dashboard biedt.
 * Toont test scenario's, voert ze uit, en visualiseert de resultaten.
 * 
 * Gebruik: Voeg toe aan de sidebar of als aparte pagina.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Play, 
  Square, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Download,
  Settings,
  Beaker,
  Clock
} from 'lucide-react';

// ============================================================
// TYPES (inline voor standalone component)
// ============================================================

type TestType = 
  | 'disambiguation' | 'domain_detection' | 'follow_up' 
  | 'concept_resolution' | 'count_handling' | 'feedback'
  | 'riasec' | 'education_skills';

interface ValidationCheck {
  type: string;
  value: string | RegExp | boolean;
  description: string;
}

interface TestScenario {
  id: string;
  name: string;
  description: string;
  type: TestType;
  question: string;
  previousContext?: string;
  validations: ValidationCheck[];
  expectedBehavior: string;
  priority: 1 | 2 | 3;
  tags: string[];
}

interface TestResult {
  scenarioId: string;
  passed: boolean;
  duration: number;
  validationResults: Array<{
    check: ValidationCheck;
    passed: boolean;
    actualValue?: string;
    error?: string;
  }>;
  consoleOutput: string[];
  sparqlGenerated?: string;
  responseText?: string;
  error?: string;
}

interface TestSuiteResult {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  timestamp: string;
  results: TestResult[];
}

// ============================================================
// TEST SCENARIOS (embedded)
// ============================================================

const TEST_SCENARIOS: TestScenario[] = [
  {
    id: 'disambiguation-architect',
    name: 'Disambiguatie: Architect',
    description: 'Test of het systeem vraagt welke architect bedoeld wordt',
    type: 'disambiguation',
    question: 'Welke vaardigheden heeft een architect?',
    validations: [
      { type: 'needs_disambiguation', value: true, description: 'Moet om verduidelijking vragen' },
      { type: 'response_contains', value: /welke.*architect.*bedoel/i, description: 'Moet vragen welke architect' }
    ],
    expectedBehavior: 'Vraagt om verduidelijking bij meerdere architect-types',
    priority: 1,
    tags: ['disambiguatie', 'occupation']
  },
  {
    id: 'disambiguation-feedback',
    name: 'Feedback na Disambiguatie',
    description: 'Test of feedback beschikbaar is na disambiguatie',
    type: 'feedback',
    question: 'Welke vaardigheden heeft een architect?',
    validations: [
      { type: 'feedback_available', value: true, description: 'Feedback moet beschikbaar zijn' }
    ],
    expectedBehavior: 'Feedback optie zichtbaar',
    priority: 2,
    tags: ['feedback', 'ui']
  },
  {
    id: 'domain-detection-education',
    name: 'Domein-detectie: Education',
    description: 'Test of orchestrator education domein detecteert',
    type: 'domain_detection',
    question: 'Toon alle MBO kwalificaties',
    validations: [
      { type: 'domain_equals', value: 'education', description: 'Domein moet education zijn' },
      { type: 'console_contains', value: '[Orchestrator] Domein: education', description: 'Console log check' }
    ],
    expectedBehavior: 'Detecteert education domein',
    priority: 1,
    tags: ['orchestrator', 'education']
  },
  {
    id: 'count-handling-large-results',
    name: 'Aantallen: >49 resultaten',
    description: 'Test of count query wordt uitgevoerd bij grote sets',
    type: 'count_handling',
    question: 'Toon alle MBO kwalificaties',
    validations: [
      { type: 'count_triggered', value: true, description: 'Count query moet triggeren' },
      { type: 'response_contains', value: /\d+\s*(kwalificaties|resultaten)/i, description: 'Aantal in response' }
    ],
    expectedBehavior: 'Toont aantal met optie voor meer',
    priority: 1,
    tags: ['count', 'pagination']
  },
  {
    id: 'follow-up-context',
    name: 'Vervolgvraag met Context',
    description: 'Test of context van vorige vraag wordt gebruikt',
    type: 'follow_up',
    question: 'Hoeveel zijn er?',
    previousContext: 'Toon alle MBO kwalificaties',
    validations: [
      { type: 'context_used', value: true, description: 'Context moet worden gebruikt' },
      { type: 'sparql_contains', value: 'COUNT', description: 'SPARQL bevat COUNT' }
    ],
    expectedBehavior: 'Begrijpt "er" als MBO kwalificaties',
    priority: 1,
    tags: ['context', 'chat-history']
  },
  {
    id: 'concept-resolver-loodgieter',
    name: 'Concept Resolver: Loodgieter',
    description: 'Test of loodgieter wordt geresolvet',
    type: 'concept_resolution',
    question: 'Vaardigheden van loodgieter',
    validations: [
      { type: 'concept_resolved', value: 'loodgieter', description: 'Loodgieter moet worden geresolvet' },
      { type: 'console_contains', value: '[Concept] Resolving', description: 'Concept resolution log' }
    ],
    expectedBehavior: 'Resolvet naar officiële naam',
    priority: 1,
    tags: ['concept-resolver', 'synoniemen']
  },
  {
    id: 'education-skills-knowledge',
    name: 'Opleiding: Vaardigheden & Kennis',
    description: 'Test opleiding → vaardigheden/kennisgebieden',
    type: 'education_skills',
    question: 'Wat leer je bij de opleiding werkvoorbereider installaties?',
    validations: [
      { type: 'domain_equals', value: 'education', description: 'Domein is education' },
      { type: 'sparql_contains', value: 'prescribes', description: 'SPARQL bevat prescribes' }
    ],
    expectedBehavior: 'Haalt vaardigheden en kennis op',
    priority: 2,
    tags: ['education', 'skills']
  },
  {
    id: 'riasec-hollandcode-R',
    name: 'RIASEC Hollandcode: R',
    description: 'Test RIASEC/Hollandcode mapping',
    type: 'riasec',
    question: 'Geef alle vaardigheden die een relatie hebben met Hollandcode R',
    validations: [
      { type: 'sparql_contains', value: 'hasRIASEC', description: 'SPARQL bevat hasRIASEC' },
      { type: 'sparql_pattern', value: /"R"|'R'/i, description: 'Filter op "R"' }
    ],
    expectedBehavior: 'Queryt RIASEC mapping',
    priority: 2,
    tags: ['riasec', 'taxonomie']
  }
];

// ============================================================
// MOCK TEST RUNNER (voor demo)
// ============================================================

class MockTestRunner {
  private onProgress?: (progress: any) => void;

  setProgressCallback(callback: (progress: any) => void): void {
    this.onProgress = callback;
  }

  async runSingleTest(scenario: TestScenario): Promise<TestResult> {
    // Simuleer API call delay
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

    // Simuleer test resultaten
    const passed = Math.random() > 0.3; // 70% success rate voor demo

    return {
      scenarioId: scenario.id,
      passed,
      duration: Math.floor(200 + Math.random() * 1500),
      validationResults: scenario.validations.map(check => ({
        check,
        passed: passed || Math.random() > 0.5,
        actualValue: passed ? 'education' : 'occupation'
      })),
      consoleOutput: [
        `[Test] Starting: ${scenario.name}`,
        `[Orchestrator] Domein: ${passed ? 'education' : 'occupation'}`,
        `[Query] SPARQL generated`
      ],
      sparqlGenerated: `SELECT ?item WHERE { ?item a cnlo:Example }`,
      responseText: passed ? 
        'Er zijn 447 resultaten gevonden.' : 
        'Welke architect bedoel je?'
    };
  }

  async runAllTests(scenarios: TestScenario[]): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const results: TestResult[] = [];
    let passed = 0;
    let failed = 0;

    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];

      if (this.onProgress) {
        this.onProgress({
          current: i + 1,
          total: scenarios.length,
          currentScenario: scenario.name,
          status: 'running'
        });
      }

      const result = await this.runSingleTest(scenario);
      results.push(result);

      if (result.passed) {
        passed++;
      } else {
        failed++;
      }
    }

    return {
      totalTests: scenarios.length,
      passed,
      failed,
      skipped: 0,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      results
    };
  }
}

// ============================================================
// STYLES
// ============================================================

const styles = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    backgroundColor: '#1a1a2e',
    color: '#e0e0e0',
    borderRadius: '12px',
    padding: '20px',
    maxWidth: '800px',
    margin: '0 auto',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
  } as React.CSSProperties,
  
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '20px',
    paddingBottom: '15px',
    borderBottom: '1px solid #333'
  } as React.CSSProperties,
  
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '20px',
    fontWeight: 600,
    color: '#ffffff'
  } as React.CSSProperties,
  
  controls: {
    display: 'flex',
    gap: '10px'
  } as React.CSSProperties,
  
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'all 0.2s'
  } as React.CSSProperties,
  
  primaryButton: {
    backgroundColor: '#4CAF50',
    color: 'white'
  } as React.CSSProperties,
  
  secondaryButton: {
    backgroundColor: '#333',
    color: '#e0e0e0'
  } as React.CSSProperties,
  
  dangerButton: {
    backgroundColor: '#f44336',
    color: 'white'
  } as React.CSSProperties,
  
  statsBar: {
    display: 'flex',
    gap: '20px',
    marginBottom: '20px',
    padding: '15px',
    backgroundColor: '#16213e',
    borderRadius: '8px'
  } as React.CSSProperties,
  
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  } as React.CSSProperties,
  
  statValue: {
    fontSize: '24px',
    fontWeight: 700
  } as React.CSSProperties,
  
  statLabel: {
    fontSize: '12px',
    color: '#888',
    textTransform: 'uppercase'
  } as React.CSSProperties,
  
  progressBar: {
    width: '100%',
    height: '8px',
    backgroundColor: '#333',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '15px'
  } as React.CSSProperties,
  
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    transition: 'width 0.3s ease'
  } as React.CSSProperties,
  
  scenarioList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  } as React.CSSProperties,
  
  scenarioItem: {
    backgroundColor: '#16213e',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #333'
  } as React.CSSProperties,
  
  scenarioHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 15px',
    cursor: 'pointer',
    gap: '10px'
  } as React.CSSProperties,
  
  scenarioName: {
    flex: 1,
    fontWeight: 500
  } as React.CSSProperties,
  
  scenarioDetails: {
    padding: '15px',
    paddingTop: '0',
    borderTop: '1px solid #333',
    backgroundColor: '#0f1729'
  } as React.CSSProperties,
  
  tag: {
    display: 'inline-block',
    padding: '2px 8px',
    backgroundColor: '#333',
    borderRadius: '10px',
    fontSize: '11px',
    marginRight: '5px'
  } as React.CSSProperties,
  
  validationItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '8px 0',
    fontSize: '13px'
  } as React.CSSProperties,
  
  codeBlock: {
    fontFamily: 'Monaco, Consolas, monospace',
    fontSize: '12px',
    backgroundColor: '#0a0a15',
    padding: '10px',
    borderRadius: '4px',
    overflowX: 'auto',
    marginTop: '10px'
  } as React.CSSProperties,
  
  currentTest: {
    padding: '10px 15px',
    backgroundColor: '#1e3a5f',
    borderRadius: '6px',
    marginBottom: '15px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  } as React.CSSProperties
};

// ============================================================
// COMPONENT
// ============================================================

interface TestDashboardProps {
  backendUrl?: string;
  onClose?: () => void;
}

const TestDashboard: React.FC<TestDashboardProps> = ({ 
  backendUrl = 'http://127.0.0.1:3001',
  onClose 
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestSuiteResult | null>(null);
  const [expandedScenarios, setExpandedScenarios] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState({ current: 0, total: 0, currentScenario: '' });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const testRunner = new MockTestRunner();

  // Alle unieke tags
  const allTags = [...new Set(TEST_SCENARIOS.flatMap(s => s.tags))].sort();

  // Gefilterde scenarios
  const filteredScenarios = selectedTags.length === 0 
    ? TEST_SCENARIOS 
    : TEST_SCENARIOS.filter(s => selectedTags.some(tag => s.tags.includes(tag)));

  // Run alle tests
  const handleRunAllTests = useCallback(async () => {
    setIsRunning(true);
    setResults(null);
    setExpandedScenarios(new Set());

    testRunner.setProgressCallback(setProgress);

    try {
      const suiteResult = await testRunner.runAllTests(filteredScenarios);
      setResults(suiteResult);
    } catch (error) {
      console.error('Test suite error:', error);
    } finally {
      setIsRunning(false);
      setProgress({ current: 0, total: 0, currentScenario: '' });
    }
  }, [filteredScenarios]);

  // Run enkele test
  const handleRunSingleTest = async (scenario: TestScenario) => {
    setIsRunning(true);

    try {
      const result = await testRunner.runSingleTest(scenario);
      
      setResults(prev => {
        if (!prev) {
          return {
            totalTests: 1,
            passed: result.passed ? 1 : 0,
            failed: result.passed ? 0 : 1,
            skipped: 0,
            duration: result.duration,
            timestamp: new Date().toISOString(),
            results: [result]
          };
        }
        
        const existingIndex = prev.results.findIndex(r => r.scenarioId === result.scenarioId);
        const newResults = [...prev.results];
        
        if (existingIndex >= 0) {
          newResults[existingIndex] = result;
        } else {
          newResults.push(result);
        }
        
        const passed = newResults.filter(r => r.passed).length;
        
        return {
          ...prev,
          passed,
          failed: newResults.length - passed,
          results: newResults
        };
      });
      
      setExpandedScenarios(prev => new Set([...prev, scenario.id]));
    } finally {
      setIsRunning(false);
    }
  };

  // Toggle scenario details
  const toggleScenario = (id: string) => {
    setExpandedScenarios(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Get result for scenario
  const getResult = (scenarioId: string): TestResult | undefined => {
    return results?.results.find(r => r.scenarioId === scenarioId);
  };

  // Status icon
  const StatusIcon: React.FC<{ passed?: boolean; running?: boolean }> = ({ passed, running }) => {
    if (running) return <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />;
    if (passed === undefined) return <AlertCircle size={16} color="#888" />;
    return passed ? <CheckCircle size={16} color="#4CAF50" /> : <XCircle size={16} color="#f44336" />;
  };

  // Export results
  const handleExport = () => {
    if (!results) return;
    
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-results-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.title}>
          <Beaker size={24} color="#4CAF50" />
          <span>Test Orchestrator</span>
        </div>
        <div style={styles.controls}>
          <button
            style={{ ...styles.button, ...styles.primaryButton }}
            onClick={handleRunAllTests}
            disabled={isRunning}
          >
            {isRunning ? <RefreshCw size={16} className="spin" /> : <Play size={16} />}
            {isRunning ? 'Running...' : 'Run Scenario Tests'}
          </button>
          {results && (
            <button
              style={{ ...styles.button, ...styles.secondaryButton }}
              onClick={handleExport}
            >
              <Download size={16} />
              Export
            </button>
          )}
          {onClose && (
            <button
              style={{ ...styles.button, ...styles.secondaryButton }}
              onClick={onClose}
            >
              <Square size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      {results && (
        <div style={styles.statsBar}>
          <div style={styles.stat}>
            <span style={{ ...styles.statValue, color: '#4CAF50' }}>{results.passed}</span>
            <span style={styles.statLabel}>Passed</span>
          </div>
          <div style={styles.stat}>
            <span style={{ ...styles.statValue, color: '#f44336' }}>{results.failed}</span>
            <span style={styles.statLabel}>Failed</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statValue}>{results.totalTests}</span>
            <span style={styles.statLabel}>Total</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statValue}>{(results.duration / 1000).toFixed(1)}s</span>
            <span style={styles.statLabel}>Duration</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statValue}>
              {Math.round((results.passed / results.totalTests) * 100)}%
            </span>
            <span style={styles.statLabel}>Success Rate</span>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {isRunning && (
        <>
          <div style={styles.progressBar}>
            <div 
              style={{ 
                ...styles.progressFill, 
                width: `${(progress.current / progress.total) * 100}%` 
              }} 
            />
          </div>
          <div style={styles.currentTest}>
            <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
            <span>Running: {progress.currentScenario}</span>
            <span style={{ marginLeft: 'auto', color: '#888' }}>
              {progress.current}/{progress.total}
            </span>
          </div>
        </>
      )}

      {/* Tag Filter */}
      <div style={{ marginBottom: '15px' }}>
        <span style={{ fontSize: '12px', color: '#888', marginRight: '10px' }}>Filter:</span>
        {allTags.map(tag => (
          <span
            key={tag}
            onClick={() => {
              setSelectedTags(prev => 
                prev.includes(tag) 
                  ? prev.filter(t => t !== tag)
                  : [...prev, tag]
              );
            }}
            style={{
              ...styles.tag,
              backgroundColor: selectedTags.includes(tag) ? '#4CAF50' : '#333',
              cursor: 'pointer'
            }}
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Scenario List */}
      <div style={styles.scenarioList}>
        {filteredScenarios.map(scenario => {
          const result = getResult(scenario.id);
          const isExpanded = expandedScenarios.has(scenario.id);
          const isCurrentlyRunning = isRunning && progress.currentScenario === scenario.name;

          return (
            <div 
              key={scenario.id} 
              style={{
                ...styles.scenarioItem,
                borderColor: result?.passed ? '#4CAF50' : result?.passed === false ? '#f44336' : '#333'
              }}
            >
              <div 
                style={styles.scenarioHeader}
                onClick={() => toggleScenario(scenario.id)}
              >
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <StatusIcon passed={result?.passed} running={isCurrentlyRunning} />
                <span style={styles.scenarioName}>{scenario.name}</span>
                {result && (
                  <span style={{ fontSize: '12px', color: '#888' }}>
                    <Clock size={12} style={{ marginRight: '4px' }} />
                    {result.duration}ms
                  </span>
                )}
                <button
                  style={{ ...styles.button, ...styles.secondaryButton, padding: '4px 8px' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRunSingleTest(scenario);
                  }}
                  disabled={isRunning}
                >
                  <Play size={12} />
                </button>
              </div>

              {isExpanded && (
                <div style={styles.scenarioDetails}>
                  <p style={{ fontSize: '13px', color: '#aaa', marginBottom: '10px' }}>
                    {scenario.description}
                  </p>
                  
                  <div style={{ marginBottom: '10px' }}>
                    {scenario.tags.map(tag => (
                      <span key={tag} style={styles.tag}>{tag}</span>
                    ))}
                  </div>

                  <div style={{ marginBottom: '10px' }}>
                    <strong style={{ fontSize: '12px', color: '#888' }}>Input:</strong>
                    <div style={styles.codeBlock}>{scenario.question}</div>
                  </div>

                  {scenario.previousContext && (
                    <div style={{ marginBottom: '10px' }}>
                      <strong style={{ fontSize: '12px', color: '#888' }}>Vorige context:</strong>
                      <div style={styles.codeBlock}>{scenario.previousContext}</div>
                    </div>
                  )}

                  <div style={{ marginBottom: '10px' }}>
                    <strong style={{ fontSize: '12px', color: '#888' }}>Validaties:</strong>
                    {scenario.validations.map((v, i) => {
                      const vResult = result?.validationResults[i];
                      return (
                        <div key={i} style={styles.validationItem}>
                          <StatusIcon passed={vResult?.passed} />
                          <span>{v.description}</span>
                          {vResult?.actualValue && !vResult.passed && (
                            <span style={{ color: '#f44336', fontSize: '11px' }}>
                              (was: {vResult.actualValue})
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {result?.sparqlGenerated && (
                    <div style={{ marginBottom: '10px' }}>
                      <strong style={{ fontSize: '12px', color: '#888' }}>Generated SPARQL:</strong>
                      <pre style={styles.codeBlock}>{result.sparqlGenerated}</pre>
                    </div>
                  )}

                  {result?.responseText && (
                    <div style={{ marginBottom: '10px' }}>
                      <strong style={{ fontSize: '12px', color: '#888' }}>Response:</strong>
                      <div style={styles.codeBlock}>{result.responseText}</div>
                    </div>
                  )}

                  {result?.consoleOutput && result.consoleOutput.length > 0 && (
                    <div>
                      <strong style={{ fontSize: '12px', color: '#888' }}>Console Output:</strong>
                      <pre style={styles.codeBlock}>
                        {result.consoleOutput.join('\n')}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* CSS Animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default TestDashboard;
