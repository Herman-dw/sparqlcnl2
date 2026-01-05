/**
 * useExampleQuestions Hook
 * =========================
 * Laadt voorbeeldvragen dynamisch uit de database.
 * 
 * Gebruik:
 *   const { examples, loading, error, refetch, testQuestion } = useExampleQuestions();
 * 
 * Voeg dit bestand toe aan: src/hooks/useExampleQuestions.ts
 */

import { useState, useEffect, useCallback } from 'react';

export interface ExampleQuestion {
  id: number;
  vraag: string;
  category?: string;
  domain?: string;
  sparql_query?: string;
  usage_count?: number;
  success_rate?: number;
}

interface ExampleQuestionsResponse {
  source: string;
  count: number;
  examples: ExampleQuestion[];
  error?: string;
}

interface TestResult {
  question: string;
  success: boolean;
  domain?: string;
  sparql?: string;
  resultCount?: number;
  hasResults?: boolean;
  duration: number;
  needsDisambiguation?: boolean;
  error?: string;
}

interface UseExampleQuestionsReturn {
  examples: ExampleQuestion[];
  loading: boolean;
  error: string | null;
  source: string;
  refetch: () => Promise<void>;
  testQuestion: (question: string) => Promise<TestResult>;
  testAllQuestions: () => Promise<TestResult[]>;
}

const DEFAULT_BACKEND = 'http://localhost:3001';

export function useExampleQuestions(
  backendUrl: string = DEFAULT_BACKEND,
  limit: number = 14
): UseExampleQuestionsReturn {
  const [examples, setExamples] = useState<ExampleQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string>('');

  const fetchExamples = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${backendUrl}/api/example-questions?limit=${limit}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data: ExampleQuestionsResponse = await response.json();
      
      setExamples(data.examples || []);
      setSource(data.source);
      
      if (data.error) {
        setError(data.error);
      }
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Onbekende fout';
      setError(message);
      console.warn('[useExampleQuestions] Fout bij laden:', message);
      
      // Fallback naar hardcoded voorbeelden
      setExamples([
        { id: 1, vraag: 'Welke vaardigheden hebben RIASEC code R?', category: 'skill' },
        { id: 2, vraag: 'Toon alle 137 vaardigheden in de taxonomie', category: 'skill' },
        { id: 3, vraag: 'Hoeveel vaardigheden zijn er per RIASEC letter?', category: 'count' },
        { id: 4, vraag: 'Wat zijn de taken van een kapper?', category: 'task' },
        { id: 5, vraag: 'Wat zijn de werkomstandigheden van een piloot?', category: 'occupation' },
        { id: 6, vraag: 'Op welke manier komt het beroep docent mbo overeen met teamleider jeugdzorg?', category: 'comparison' },
        { id: 7, vraag: 'Wat zijn de taken en vaardigheden van een tandartsassistent?', category: 'task' },
        { id: 8, vraag: 'Toon 30 MBO kwalificaties', category: 'education' }
      ]);
      setSource('fallback');
    } finally {
      setLoading(false);
    }
  }, [backendUrl, limit]);

  const testQuestion = useCallback(async (question: string): Promise<TestResult> => {
    try {
      const response = await fetch(`${backendUrl}/api/test-example-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (err) {
      return {
        question,
        success: false,
        error: err instanceof Error ? err.message : 'Test failed',
        duration: 0
      };
    }
  }, [backendUrl]);

  const testAllQuestions = useCallback(async (): Promise<TestResult[]> => {
    const results: TestResult[] = [];
    
    for (const example of examples) {
      const result = await testQuestion(example.vraag);
      results.push(result);
      // Kleine delay om server niet te overbelasten
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return results;
  }, [examples, testQuestion]);

  useEffect(() => {
    fetchExamples();
  }, [fetchExamples]);

  return {
    examples,
    loading,
    error,
    source,
    refetch: fetchExamples,
    testQuestion,
    testAllQuestions
  };
}

export default useExampleQuestions;
