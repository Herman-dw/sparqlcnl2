/**
 * CompetentNL SPARQL Agent - v2.2.0
 * Met concept disambiguatie, profiel matching EN dynamische voorbeeldvragen
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Send, Database, Download, Filter, Info, Trash2, Loader2,
  Settings, Save, Wifi, WifiOff, RefreshCcw, ShieldAlert, Server,
  HelpCircle, CheckCircle, ThumbsUp, ThumbsDown, Target, ListChecks,
  Mic, MicOff, InfoIcon, RefreshCw, AlertCircle, Moon, Sun, Upload, FileText,
  Sparkles
} from 'lucide-react';
import { Message, ResourceType } from './types';
import { GRAPH_OPTIONS } from './constants';  // EXAMPLES verwijderd - nu dynamisch
import {
  generateSparqlWithDisambiguation, 
  summarizeResults,
  DisambiguationData,
  generateCountQuery,
  generateExpandedQuery
} from './services/geminiService';
import { executeSparql, validateSparqlQuery, ProxyType } from './services/sparqlService';
import { downloadAsExcel } from './services/excelService';
import { saveFeedback, sendFeedbackToBackend } from './services/feedbackService';
import { createSpeechService, getSpeechSupport, SpeechService } from './services/speech';
import TestPage from './test-suite/components/TestPage';
import RiasecTest, { RiasecResult } from './components/RiasecTest';
import RiasecSkillSelector, { SelectedCapability } from './components/RiasecSkillSelector';
import MatchModal from './components/MatchModal';
import ProfileHistoryWizard from './components/ProfileHistoryWizard';
import CVUploadModal from './components/CVUploadModal';
import CVReviewScreen from './components/CVReviewScreen';
import CVParsingWizard from './components/CVParsingWizard';
import ServiceStatusBar from './components/ServiceStatusBar';
import { QuickUploadMatchModal } from './components/QuickUploadMatch';
import ProfilePanel from './components/ProfilePanel';
import { Zap } from 'lucide-react';
import { useProfileStore } from './state/profileStore';
import { ProfileItemWithSource, SessionProfile } from './types/profile';
import { mergeProfileLists } from './state/profileUtils';

const DEFAULT_URL = 'https://sparql.competentnl.nl';
const DEFAULT_LOCAL_BACKEND = 'http://localhost:3001';

// =====================================================
// INLINE HOOK: useExampleQuestions
// =====================================================
interface ExampleQuestion {
  id: number;
  vraag: string;
  category?: string;
  domain?: string;
}

interface UseExampleQuestionsReturn {
  examples: ExampleQuestion[];
  loading: boolean;
  error: string | null;
  source: string;
  refetch: () => Promise<void>;
}

function useExampleQuestions(backendUrl: string, limit: number = 14): UseExampleQuestionsReturn {
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
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      setExamples(data.examples || []);
      setSource(data.source || 'api');
      
      if (data.error) {
        setError(data.error);
      }
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fout bij laden';
      setError(message);
      console.warn('[useExampleQuestions] Fallback naar defaults:', message);
      
      // Fallback voorbeelden - alle vragen zijn getest en werken!
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

  useEffect(() => {
    fetchExamples();
  }, [fetchExamples]);

  return { examples, loading, error, source, refetch: fetchExamples };
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

const detectRiasecContext = (text: string) => {
  const normalized = text.toLowerCase();
  const isRiasec = normalized.includes('riasec') || normalized.includes('hollandcode') || 
    (normalized.includes('holland') && normalized.includes('code'));

  if (!isRiasec) {
    return { isRiasec: false, letter: null as string | null };
  }

  const letterMatch = normalized.match(/\b([riasec])\b(?!\w)/i) || 
    normalized.match(/met\s+([riasec])\b/i) ||
    normalized.match(/code\s+([riasec])/i) ||
    normalized.match(/letter\s+['"]?([riasec])['"]?/i);

  const letter = letterMatch ? letterMatch[1].toUpperCase() : 'R';
  return { isRiasec: true, letter };
};

const getRiasecFallbackResults = (letter: string | null) => {
  const safeLetter = letter || 'R';
  return [
    { skill: `urn:riasec:${safeLetter.toLowerCase()}:1`, skillLabel: `Voorbeeldvaardigheid ${safeLetter} 1` },
    { skill: `urn:riasec:${safeLetter.toLowerCase()}:2`, skillLabel: `Voorbeeldvaardigheid ${safeLetter} 2` },
    { skill: `urn:riasec:${safeLetter.toLowerCase()}:3`, skillLabel: `Voorbeeldvaardigheid ${safeLetter} 3` },
  ];
};

// =====================================================
// MAIN APP COMPONENT
// =====================================================

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedGraphs, setSelectedGraphs] = useState<string[]>(GRAPH_OPTIONS.map(g => g.uri));
  const [resourceType, setResourceType] = useState<ResourceType>(ResourceType.All);
  const [showSparql, setShowSparql] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [activePage, setActivePage] = useState<'chat' | 'riasec' | 'riasec-skills'>('chat');
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  // Dark mode persistence
  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(!darkMode);

  // RIASEC flow state
  const [riasecResult, setRiasecResult] = useState<RiasecResult | null>(null);
  const [riasecSelectedCapabilities, setRiasecSelectedCapabilities] = useState<SelectedCapability[]>([]);
  
  const [sparqlEndpoint, setSparqlEndpoint] = useState(() => localStorage.getItem('sparql_url') || DEFAULT_URL);
  const [authHeader, setAuthHeader] = useState(() => localStorage.getItem('sparql_auth') || '');
  const [proxyMode, setProxyMode] = useState<ProxyType>(() => (localStorage.getItem('proxy_mode') as ProxyType) || 'local');
  const [localBackendUrl, setLocalBackendUrl] = useState(() => localStorage.getItem('local_backend_url') || DEFAULT_LOCAL_BACKEND);
  const [showSettings, setShowSettings] = useState(false);
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [sessionId] = useState(() => {
    const existing = localStorage.getItem('session_id');
    if (existing) return existing;
    const generated = `session_${Date.now()}`;
    localStorage.setItem('session_id', generated);
    return generated;
  });
  
  // Disambiguation state
  const [pendingDisambiguation, setPendingDisambiguation] = useState<DisambiguationData | null>(null);

  // Test Dashboard state
  const [showTests, setShowTests] = useState(false);

  // Match Modal state
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [showProfileWizard, setShowProfileWizard] = useState(false);

  // CV Upload flow state
  const [showCVUpload, setShowCVUpload] = useState(false);
  const [showCVWizard, setShowCVWizard] = useState(false);
  const [showCVReview, setShowCVReview] = useState(false);
  const [currentCvId, setCurrentCvId] = useState<number | null>(null);
  const [cvMatchResults, setCvMatchResults] = useState<any>(null);

  // Quick Upload & Match state
  const [showQuickMatch, setShowQuickMatch] = useState(false);

  const { profile, mergeProfile, clearProfile } = useProfileStore();

  // =====================================================
  // DYNAMISCHE VOORBEELDVRAGEN
  // =====================================================
  const { 
    examples: dynamicExamples, 
    loading: examplesLoading, 
    error: examplesError, 
    source: examplesSource,
    refetch: refetchExamples 
  } = useExampleQuestions(localBackendUrl, 14);

  const riasecProfileItems = useMemo<ProfileItemWithSource[]>(() => {
    return riasecSelectedCapabilities.map((cap) => ({
      uri: cap.uri,
      label: cap.label,
      type: 'skill',
      sources: [
        {
          id: `riasec-${cap.uri || cap.label}`,
          label: 'RIASEC selectie',
          type: 'riasec'
        }
      ]
    }));
  }, [riasecSelectedCapabilities]);

  const combinedProfile = useMemo<SessionProfile>(() => {
    return {
      skills: mergeProfileLists(profile.skills, riasecProfileItems),
      knowledge: profile.knowledge,
      tasks: profile.tasks,
      workConditions: profile.workConditions
    };
  }, [profile, riasecProfileItems]);

  const totalProfileItems =
    combinedProfile.skills.length +
    combinedProfile.knowledge.length +
    combinedProfile.tasks.length +
    combinedProfile.workConditions.length;

  const scrollRef = useRef<HTMLDivElement>(null);
  const speechServiceRef = useRef<SpeechService | null>(null);
  const [speechSupport, setSpeechSupport] = useState<'checking' | 'supported' | 'unsupported'>('checking');
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [speechError, setSpeechError] = useState('');
  const [speechStatus, setSpeechStatus] = useState('');
  const [speechLang, setSpeechLang] = useState<'nl-NL' | 'en-US'>('nl-NL');
  const [capturedTranscript, setCapturedTranscript] = useState('');
  const [shouldContinueListening, setShouldContinueListening] = useState(false);
  const userStoppedRef = useRef(false);
  const silenceStopRef = useRef(false);
  const handleSendRef = useRef<(text?: string, options?: { exampleId?: number }) => Promise<void>>(async () => {});

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const persistMessage = useCallback(async (message: Message) => {
    try {
      await fetch(`${localBackendUrl}/conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: {
            ...message,
            timestamp: message.timestamp.toISOString()
          }
        })
      });
    } catch (error) {
      console.warn('Kon bericht niet opslaan in de database', error);
    }
  }, [localBackendUrl, sessionId]);

  const loadConversation = useCallback(async () => {
    try {
      const response = await fetch(`${localBackendUrl}/conversation/${sessionId}`);
      if (!response.ok) return;
      const data = await response.json();
      const restored: Message[] = data.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp || msg.created_at || msg.createdAt),
        results: msg.results || [],
        feedback: msg.feedback === 'none' ? undefined : msg.feedback,
        status: msg.status || 'success'
      }));
      setMessages(restored);
    } catch (error) {
      console.warn('Kon gesprek niet laden uit de database', error);
    }
  }, [localBackendUrl, sessionId]);

  // Restore conversation from database on load
  useEffect(() => {
    loadConversation();
  }, [loadConversation]);

  useEffect(() => {
    const support = getSpeechSupport();
    setSpeechSupport(support);
  }, []);

  const checkConnectivity = async () => {
    setApiStatus('checking');
    try {
      await executeSparql("ASK { ?s ?p ?o }", sparqlEndpoint, authHeader, proxyMode, localBackendUrl);
      setApiStatus('online');
    } catch (e) {
      setApiStatus('offline');
    }
  };

  useEffect(() => { checkConnectivity(); }, []);

  const saveSettings = () => {
    localStorage.setItem('sparql_url', sparqlEndpoint);
    localStorage.setItem('sparql_auth', authHeader);
    localStorage.setItem('proxy_mode', proxyMode);
    localStorage.setItem('local_backend_url', localBackendUrl);
    setShowSettings(false);
    checkConnectivity();
  };

  // Build chat history for context
  const getChatHistory = (nextMessage?: Message) => {
    const source = nextMessage ? [...messages, nextMessage] : messages;
    return source
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-6)
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.text,
        sparql: m.sparql
      }));
  };

  const handleRiasecQuestion = async (question: string, letter: string | null) => {
    setPendingDisambiguation(null);

    let sparql = '';
    let responseText = '';
    let domain = 'taxonomy';

    try {
      const generateRes = await fetch(`${localBackendUrl}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          chatHistory: getChatHistory(),
          domain: 'taxonomy'
        })
      });

      if (generateRes.ok) {
        const data = await generateRes.json();
        sparql = data.sparql || sparql;
        responseText = data.response || responseText;
        domain = data.domain || domain;
      }
    } catch (error) {
      console.warn('Kon /generate niet bereiken voor RIASEC vraag', error);
    }

    if (!sparql || !responseText) {
      const fallbackGeneration = await generateSparqlWithDisambiguation(
        question,
        { graphs: selectedGraphs, type: resourceType, status: 'Current' },
        getChatHistory()
      );
      sparql = sparql || fallbackGeneration.sparql || '';
      responseText = responseText || fallbackGeneration.response;
      domain = fallbackGeneration.domain || domain;
    }

    if (!sparql) {
      throw new Error('Geen SPARQL query voor RIASEC beschikbaar.');
    }

    const validation = validateSparqlQuery(sparql, selectedGraphs);
    if (!validation.valid) throw new Error(validation.error);

    let results: any[] = [];
    let usedFallbackResults = false;

    try {
      results = await executeSparql(sparql, sparqlEndpoint, authHeader, proxyMode, localBackendUrl);
    } catch (error) {
      console.warn('Kon RIASEC query niet uitvoeren, toon voorbeeldresultaten', error);
      usedFallbackResults = true;
      results = getRiasecFallbackResults(letter);
    }

    if (!usedFallbackResults && results.length === 0) {
      usedFallbackResults = true;
      results = getRiasecFallbackResults(letter);
    }

    const summary = await summarizeResults(question, results);
    const baseResponse = responseText || `Vaardigheden met RIASEC code "${letter || 'R'}":`;
    const assistantMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      text: `${baseResponse}\n\n${summary}${usedFallbackResults ? '\n\n_(voorbeeldresultaten getoond terwijl live query geen resultaten opleverde.)_' : ''}`,
      sparql,
      results,
      timestamp: new Date(),
      status: 'success',
      metadata: {
        domain,
        isRiasec: true,
        riasecLetter: letter || undefined
      }
    };

    setMessages(prev => [...prev, assistantMsg]);
    await persistMessage(assistantMsg);
  };

  const handleSend = async (text: string = inputText, options?: { exampleId?: number }) => {
    if (!text.trim()) return;

    const exampleQuestionId = options?.exampleId;
    const baseMetadata = exampleQuestionId ? { exampleQuestionId } : undefined;

    const userMsg: Message = { 
      id: Date.now().toString(), 
      role: 'user', 
      text, 
      timestamp: new Date(), 
      status: 'success',
      metadata: baseMetadata
    };
    setMessages(prev => [...prev, userMsg]);
    await persistMessage(userMsg);
    setInputText('');
    setIsLoading(true);

    try {
      const riasecDetection = detectRiasecContext(text);
      if (riasecDetection.isRiasec) {
        await handleRiasecQuestion(text, riasecDetection.letter);
        return;
      }

      // Generate SPARQL with disambiguation support
      const chatHistory = getChatHistory(userMsg);
      const result = await generateSparqlWithDisambiguation(
        text, 
        { graphs: selectedGraphs, type: resourceType, status: 'Current' },
        chatHistory,
        pendingDisambiguation || undefined,
        sessionId
      );

      // Check if disambiguation is needed
      if (result.needsDisambiguation && result.disambiguationData) {
        setPendingDisambiguation(result.disambiguationData);
        
        const disambigMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          text: result.response,
          timestamp: new Date(),
          status: 'success',
          metadata: { ...(baseMetadata || {}), isDisambiguation: true }
        };
        setMessages(prev => [...prev, disambigMsg]);
        await persistMessage(disambigMsg);
        setIsLoading(false);
        return;
      }

      // Clear disambiguation state
      setPendingDisambiguation(null);

      // Count-only response with CTA for first 50 results
      if (result.needsCount && result.listSparql) {
        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
        text: result.response,
        sparql: result.sparql || undefined,
        timestamp: new Date(),
        status: 'success',
        needsList: true,
        listSparql: result.listSparql,
        sourceQuestion: text,
        metadata: { ...(baseMetadata || {}), domain: result.domain }
      };
      setMessages(prev => [...prev, assistantMsg]);
      await persistMessage(assistantMsg);
      setIsLoading(false);
      return;
      }

      // Normal flow: execute SPARQL
      if (!result.sparql) {
        const fallbackMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          text: result.response || 'Ik kon geen SPARQL query genereren voor deze vraag.',
          timestamp: new Date(),
          status: 'error',
          metadata: baseMetadata
        };
        setMessages(prev => [...prev, fallbackMsg]);
        await persistMessage(fallbackMsg);
        setIsLoading(false);
        return;
      }

      const validation = validateSparqlQuery(result.sparql, selectedGraphs);
      if (!validation.valid) throw new Error(validation.error);

      const results = await executeSparql(result.sparql, sparqlEndpoint, authHeader, proxyMode, localBackendUrl);

      // Determine limits and counts for full retrieval
      const limitMatch = result.sparql.match(/LIMIT\s+(\d+)/i);
      const limitUsed = limitMatch ? parseInt(limitMatch[1], 10) : undefined;
      const shouldCheckCount = (limitUsed && results.length >= limitUsed) || results.length >= 50 || /toon\s+alle/i.test(text) || /toon\s+\d+/i.test(text);

      let totalCount: number | undefined;
      let countQuery: string | undefined;
      let fullResultSparql: string | undefined;
      let resultsTruncated = false;

      if (shouldCheckCount) {
        try {
          countQuery = generateCountQuery(result.sparql);
          const countResults = await executeSparql(countQuery, sparqlEndpoint, authHeader, proxyMode, localBackendUrl);
          const countValue = countResults[0]?.total || countResults[0]?.aantal || countResults[0]?.count;
          const parsed = typeof countValue === 'string' ? parseInt(countValue, 10) : Number(countValue);
          if (!isNaN(parsed)) {
            totalCount = parsed;
            resultsTruncated = parsed > results.length;
            fullResultSparql = generateExpandedQuery(result.sparql, parsed);
          }
        } catch (err) {
          console.warn('Kon count query niet uitvoeren', err);
        }
      }

      if (!fullResultSparql) {
        const targetLimit = totalCount || (limitUsed ? limitUsed * 4 : 200);
        fullResultSparql = generateExpandedQuery(result.sparql, targetLimit);
        resultsTruncated = resultsTruncated || (limitUsed ? results.length >= limitUsed : false);
      }

      // Summarize results
      const summary = await summarizeResults(text, results, totalCount);
      const baseResponse = result.response || 'Hier zijn de resultaten:';

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: `${baseResponse}\n\n${summary}`,
        sparql: result.sparql,
        results,
        timestamp: new Date(),
        status: 'success',
        metadata: { 
          ...(baseMetadata || {}), 
          domain: result.domain,
          limitUsed,
          totalCount,
          countQuery,
          fullResultSparql,
          resultsTruncated
        }
      };

      setMessages(prev => [...prev, assistantMsg]);
      await persistMessage(assistantMsg);

    } catch (error: any) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: `Er is een fout opgetreden: ${error.message}`,
        timestamp: new Date(),
        status: 'error',
        metadata: baseMetadata
      };
      setMessages(prev => [...prev, errorMsg]);
      await persistMessage(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  handleSendRef.current = handleSend;

  const handleShowList = async (msg: Message) => {
    if (!msg.listSparql) return;
    setIsLoading(true);

    try {
      const validation = validateSparqlQuery(msg.listSparql, selectedGraphs);
      if (!validation.valid) throw new Error(validation.error);

      const results = await executeSparql(msg.listSparql, sparqlEndpoint, authHeader, proxyMode, localBackendUrl);
      const limitMatch = msg.listSparql.match(/LIMIT\s+(\d+)/i);
      const limitUsed = limitMatch ? parseInt(limitMatch[1], 10) : undefined;

      let totalCount: number | undefined;
      let countQuery: string | undefined;
      let fullResultSparql: string | undefined;
      let resultsTruncated = false;

      try {
        countQuery = generateCountQuery(msg.listSparql);
        const countResults = await executeSparql(countQuery, sparqlEndpoint, authHeader, proxyMode, localBackendUrl);
        const countValue = countResults[0]?.total || countResults[0]?.aantal || countResults[0]?.count;
        const parsed = typeof countValue === 'string' ? parseInt(countValue, 10) : Number(countValue);
        if (!isNaN(parsed)) {
          totalCount = parsed;
          resultsTruncated = parsed > results.length;
          fullResultSparql = generateExpandedQuery(msg.listSparql, parsed);
        }
      } catch (err) {
        console.warn('Kon count query niet uitvoeren voor lijst', err);
      }

      if (!fullResultSparql) {
        const targetLimit = totalCount || (limitUsed ? limitUsed * 4 : 200);
        fullResultSparql = generateExpandedQuery(msg.listSparql, targetLimit);
        resultsTruncated = resultsTruncated || (limitUsed ? results.length >= limitUsed : false);
      }

      const summary = await summarizeResults(msg.sourceQuestion || 'Toon resultaten', results, totalCount);

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: `Hier zijn de eerste 50 resultaten:\n\n${summary}`,
        sparql: msg.listSparql,
        results,
        timestamp: new Date(),
        status: 'success',
        metadata: {
          limitUsed,
          totalCount,
          countQuery,
          fullResultSparql,
          resultsTruncated
        }
      };

      setMessages(prev => [...prev, assistantMsg]);
      await persistMessage(assistantMsg);

    } catch (error: any) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: `Kon lijst niet ophalen: ${error.message}`,
        timestamp: new Date(),
        status: 'error'
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadAll = async (msg: Message) => {
    if (!msg.metadata?.fullResultSparql) return;
    setIsLoading(true);
    try {
      const results = await executeSparql(msg.metadata.fullResultSparql, sparqlEndpoint, authHeader, proxyMode, localBackendUrl);
      downloadAsExcel(results, { 
        vraag: msg.text, 
        sparql: msg.metadata.fullResultSparql, 
        timestamp: new Date(),
        endpoint: sparqlEndpoint,
        graphs: selectedGraphs
      });
    } catch (error) {
      console.warn('Kon alle resultaten niet downloaden', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = async () => {
    setMessages([]);
    setPendingDisambiguation(null);
    try {
      await fetch(`${localBackendUrl}/conversation/${sessionId}`, { method: 'DELETE' });
    } catch (error) {
      console.warn('Kon gesprek niet verwijderen uit de database', error);
    }
  };

  const handleFeedback = async (messageId: string, feedback: 'like' | 'dislike') => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, feedback } : msg
    ));

    const msg = messages.find(m => m.id === messageId);
    if (msg) {
      await saveFeedback({
        question: msg.text,
        sparqlQuery: msg.sparql || '',
        resultCount: msg.results?.length || 0,
        feedback
      });
      try {
        await fetch(`${localBackendUrl}/conversation/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, messageId, feedback })
        });
      } catch (error) {
        console.warn('Kon feedback niet opslaan in conversation_messages', error);
      }

      await sendFeedbackToBackend(localBackendUrl, {
        sessionId,
        messageId,
        feedback,
        questionEmbeddingId: msg.metadata?.exampleQuestionId,
        context: {
          question: msg.text,
          sparql: msg.sparql,
          resultsCount: msg.results?.length || 0,
          metadata: msg.metadata
        }
      });
    }
  };

  // Speech recognition handlers
  const startListening = useCallback(() => {
    userStoppedRef.current = false;
    silenceStopRef.current = false;
    setSpeechError('');
    setSpeechStatus('Initialiseren...');

    if (!speechServiceRef.current) {
      speechServiceRef.current = createSpeechService(speechLang, {
        onStart: () => {
          setIsListening(true);
          setSpeechStatus('Luistert...');
        },
        onEnd: () => {
          setIsListening(false);
          setSpeechStatus('');
          if (!userStoppedRef.current && shouldContinueListening && !silenceStopRef.current) {
            speechServiceRef.current?.start();
          }
        },
        onInterim: (text) => {
          setInterimTranscript(text);
        },
        onFinal: (text) => {
          setCapturedTranscript(prev => (prev ? prev + ' ' : '') + text);
          setInterimTranscript('');
        },
        onError: (error) => {
          setSpeechError(error.message || 'Speech error');
          setSpeechStatus('');
          setIsListening(false);
        },
        onSilenceTimeout: () => {
          silenceStopRef.current = true;
          speechServiceRef.current?.stop();
          setSpeechStatus('Gestopt door stilte');
        },
        shouldRestart: () => !userStoppedRef.current && shouldContinueListening && !silenceStopRef.current
      });
    }

    speechServiceRef.current.updateLang(speechLang);
    setShouldContinueListening(true);
    speechServiceRef.current.start();
  }, [speechLang, shouldContinueListening]);

  const stopListening = useCallback(() => {
    userStoppedRef.current = true;
    setShouldContinueListening(false);
    speechServiceRef.current?.stop();
    setSpeechStatus('Gepauzeerd');
  }, []);

  const confirmTranscript = useCallback(() => {
    if (capturedTranscript) {
      setInputText(prev => (prev ? prev + ' ' : '') + capturedTranscript);
      setCapturedTranscript('');
      setInterimTranscript('');
      setSpeechStatus('');
    }
  }, [capturedTranscript]);

  // =====================================================
  // RENDER
  // =====================================================

  if (showTests) {
    return <TestPage onBack={() => setShowTests(false)} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-emerald-50 dark:from-slate-900 dark:via-slate-800 dark:to-emerald-950 font-sans transition-colors">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 via-emerald-700 to-green-700 text-white shadow-lg relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,...')] opacity-10"></div>
        <div className="relative px-8 py-6 flex items-center justify-between max-w-[1800px] mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
              <Database className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">CompetentNL SPARQL Agent</h1>
              <p className="text-emerald-200 text-sm font-medium">Natuurlijke taal naar SPARQL • CompetentNL Knowledge Graph</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 transition"
              title={darkMode ? 'Schakel naar lichte modus' : 'Schakel naar donkere modus'}
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setActivePage('chat')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${
                activePage === 'chat'
                  ? 'bg-white text-emerald-700 border-white shadow-md'
                  : 'bg-emerald-600/80 text-white border-emerald-400/50 hover:bg-emerald-600'
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setActivePage('riasec')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${
                activePage === 'riasec'
                  ? 'bg-emerald-500 text-white border-emerald-400 shadow-md'
                  : 'bg-emerald-600/80 text-white border-emerald-400/50 hover:bg-emerald-600'
              }`}
            >
              RIASEC-zelftest
            </button>
          </div>
        </div>
      </div>

      {activePage === 'riasec' ? (
        <RiasecTest 
          onBack={() => setActivePage('chat')} 
          onResultComplete={(result) => {
            setRiasecResult(result);
            setActivePage('riasec-skills');
          }}
        />
      ) : activePage === 'riasec-skills' && riasecResult ? (
        <div className="bg-slate-50 min-h-[calc(100vh-88px)] py-8 px-4">
          <div className="max-w-5xl mx-auto">
            <RiasecSkillSelector
              riasecResult={riasecResult}
              onBack={() => setActivePage('riasec')}
              onSkillsSelected={(capabilities) => {
                mergeProfile({
                  skills: capabilities.map((cap) => ({
                    uri: cap.uri,
                    label: cap.label,
                    type: 'skill',
                    sources: [
                      { id: `riasec-${cap.uri || cap.label}`, label: 'RIASEC selectie', type: 'riasec' }
                    ]
                  }))
                });
                setRiasecSelectedCapabilities(capabilities);
                setShowMatchModal(true);
                setActivePage('chat');
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex overflow-hidden" style={{ minHeight: 'calc(100vh - 88px)' }}>
      {/* Sidebar */}
      <aside className="w-80 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 flex flex-col shadow-xl z-20">
        <div className="p-6 bg-emerald-700 text-white">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Database className="w-6 h-6" />
              <h1 className="text-xl font-bold tracking-tight">CompetentNL AI</h1>
            </div>
            <button onClick={() => setShowSettings(!showSettings)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
              <Settings className="w-5 h-5" />
            </button>
          </div>
          <div className="text-[10px] font-bold opacity-80 uppercase tracking-widest flex items-center gap-1">
            <Server className="w-3 h-3" /> v2.2 met Matching
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {showSettings && (
            <div className="p-4 bg-emerald-50 dark:bg-slate-800 border border-emerald-100 dark:border-slate-700 rounded-xl space-y-3">
              <h4 className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Connectie</h4>
              <div className="space-y-2">
                <div>
                  <label className="block text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mb-1 uppercase">SPARQL Key</label>
                  <input type="password" value={authHeader} onChange={e => setAuthHeader(e.target.value)} className="w-full text-xs p-2 border border-emerald-200 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-md outline-none" placeholder="API Sleutel" />
                </div>
                <div>
                  <label className="block text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mb-1 uppercase">Methode</label>
                  <select value={proxyMode} onChange={e => setProxyMode(e.target.value as ProxyType)} className="w-full text-xs p-2 border border-emerald-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 dark:text-white">
                    <option value="local">Eigen Backend (3001)</option>
                    <option value="none">Direct (CORS)</option>
                    <option value="codetabs">Publieke Proxy</option>
                  </select>
                </div>
              </div>
              <button onClick={saveSettings} className="w-full bg-emerald-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-emerald-700 flex items-center justify-center gap-2">
                <Save className="w-3 h-3" /> Opslaan
              </button>
            </div>
          )}

          {/* Match Profiel Section */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Target className="w-3 h-3" /> Matching
            </h3>

            {/* CV Upload Options */}
            <div className="space-y-2">
              <button
                onClick={() => setShowCVWizard(true)}
                className="w-full flex items-center justify-center gap-2 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg shadow-blue-500/25"
              >
                <FileText className="w-4 h-4" />
                CV Wizard (stap-voor-stap)
              </button>
              <button
                onClick={() => setShowQuickMatch(true)}
                className="w-full flex items-center justify-center gap-2 text-sm font-bold text-white bg-gradient-to-r from-amber-500 via-emerald-500 to-green-500 px-4 py-3 rounded-xl hover:from-amber-600 hover:via-emerald-600 hover:to-green-600 transition-all shadow-lg shadow-emerald-500/25"
              >
                <Zap className="w-4 h-4" />
                Snelle upload & match
              </button>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
              Wizard: bekijk en bevestig elke stap. Snelle upload: direct van CV naar resultaat.
            </p>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-3 mt-3">
              <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-2">Of bouw handmatig:</p>
            </div>

            <button
              onClick={() => setShowProfileWizard(true)}
              className="w-full flex items-center justify-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-slate-700 border border-emerald-100 dark:border-slate-600 px-4 py-3 rounded-xl hover:bg-emerald-100 dark:hover:bg-slate-600 transition-all"
            >
              <ListChecks className="w-4 h-4" />
              Bouw profiel (werk/opleiding)
            </button>
            <button
              onClick={() => setShowMatchModal(true)}
              className="w-full flex items-center justify-center gap-2 text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-green-600 px-4 py-3 rounded-xl hover:from-emerald-700 hover:to-green-700 transition-all shadow-lg shadow-emerald-500/25"
            >
              <Target className="w-4 h-4" />
              Match mijn Profiel
            </button>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
              Selecteer vaardigheden en ontdek welke beroepen bij je passen. Actief profiel: {totalProfileItems} items.
            </p>
          </div>

          {/* Profiel Weergave */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Sparkles className="w-3 h-3" /> Mijn Profiel
            </h3>
            <ProfilePanel
              profile={combinedProfile}
              onRemoveItem={(category, uri) => {
                // Remove item from profile
                const updatedCategory = profile[category].filter(item => item.uri !== uri);
                mergeProfile({ [category]: updatedCategory });
              }}
              onClearProfile={clearProfile}
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Filter className="w-3 h-3" /> Graphs
            </h3>
            <div className="space-y-1">
              {GRAPH_OPTIONS.map(g => (
                <label key={g.id} className="flex items-center gap-2 text-[11px] p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer transition-colors">
                  <input 
                    type="checkbox" 
                    checked={selectedGraphs.includes(g.uri)} 
                    onChange={e => {
                      if (e.target.checked) setSelectedGraphs([...selectedGraphs, g.uri]);
                      else setSelectedGraphs(selectedGraphs.filter(u => u !== g.uri));
                    }}
                    className="rounded text-emerald-600"
                  />
                  <span className="truncate dark:text-slate-300">{g.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* =====================================================
              DYNAMISCHE VOORBEELDVRAGEN SECTIE
              ===================================================== */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Info className="w-3 h-3" /> Voorbeelden
                {examplesSource && (
                  <span className="text-[8px] font-normal text-slate-300 lowercase">
                    ({examplesSource})
                  </span>
                )}
              </h3>
              <button
                onClick={refetchExamples}
                disabled={examplesLoading}
                className="p-1 hover:bg-slate-100 rounded transition-colors disabled:opacity-50"
                title="Herlaad voorbeelden"
              >
                <RefreshCw className={`w-3 h-3 text-slate-400 ${examplesLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            
            {examplesError && (
              <div className="flex items-center gap-2 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{examplesError}</span>
              </div>
            )}
            
            <div className="space-y-2">
              {examplesLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                </div>
              ) : dynamicExamples.length > 0 ? (
                dynamicExamples.map((ex, i) => (
                  <button
                    key={ex.id || i}
                    onClick={() => handleSend(ex.vraag, { exampleId: ex.id })}
                    className="w-full text-left text-[11px] p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-slate-700 transition-all text-slate-600 dark:text-slate-300 leading-snug group"
                  >
                    <span className="flex items-start gap-2">
                      <span className="flex-1">{ex.vraag}</span>
                      {ex.category && (
                        <span className="flex-shrink-0 text-[8px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded uppercase">
                          {ex.category}
                        </span>
                      )}
                    </span>
                  </button>
                ))
              ) : (
                <div className="text-[11px] text-slate-400 text-center py-4">
                  Geen voorbeelden beschikbaar
                </div>
              )}
            </div>
          </div>
          {/* EINDE VOORBEELDVRAGEN SECTIE */}
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-800">
          <button onClick={handleClearChat} className="text-[10px] text-slate-400 font-bold hover:text-rose-500 flex items-center gap-1 uppercase">
            <Trash2 className="w-3 h-3" /> Wis Chat
          </button>
          <ServiceStatusBar
            backendUrl={localBackendUrl}
            refreshInterval={30000}
            compact={true}
          />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative bg-slate-50 dark:bg-slate-900">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-8 pb-32">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-8">
              <div className="relative">
                <div className="w-24 h-24 bg-emerald-600 rounded-[2rem] flex items-center justify-center rotate-6 shadow-2xl relative z-10">
                  <Database className="w-12 h-12 text-white" />
                </div>
              </div>
              <div className="space-y-4">
                <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">CompetentNL AI Agent</h2>
                <p className="text-slate-500 dark:text-slate-400 text-base leading-relaxed">
                  Stel vragen in natuurlijk Nederlands. Bij onduidelijkheid vraag ik door welk concept je precies bedoelt.
                </p>
                {apiStatus === 'offline' && (
                  <div className="mt-8 p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-sm space-y-4">
                    <div className="flex items-center gap-2 font-black uppercase tracking-widest text-xs text-rose-600">
                      <ShieldAlert className="w-5 h-5" /> Verbindingsfout
                    </div>
                    <button onClick={checkConnectivity} className="w-full py-2.5 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 flex items-center justify-center gap-2">
                      <RefreshCcw className="w-4 h-4" /> Opnieuw Proberen
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[90%] p-6 rounded-3xl shadow-lg border ${
                msg.role === 'user' ? 'bg-emerald-600 text-white border-transparent' :
                msg.status === 'error' ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200' :
                msg.metadata?.isDisambiguation ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-slate-800 dark:text-white' :
                'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white'
              }`}>
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</div>

                {/* Disambiguation options */}
                {msg.metadata?.isDisambiguation && pendingDisambiguation?.options && (
                  <div className="mt-4 space-y-2">
                    {pendingDisambiguation.options.map((option, idx) => (
                      <button
                        key={option.uri}
                        onClick={() => handleSend(`${idx + 1}`)}
                        className="w-full text-left p-3 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-700 rounded-xl hover:bg-amber-50 dark:hover:bg-slate-700 hover:border-amber-400 transition-all flex items-center gap-2 text-sm dark:text-white"
                      >
                        <span className="w-5 h-5 bg-amber-200 rounded-full flex items-center justify-center text-[10px]">
                          {idx + 1}
                        </span>
                        {option.prefLabel.length > 25 ? option.prefLabel.substring(0, 25) + '...' : option.prefLabel}
                      </button>
                    ))}
                  </div>
                )}

                {msg.needsList && (
                  <button
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 rounded-xl text-sm font-semibold hover:bg-emerald-600 hover:text-white transition-colors"
                    onClick={() => handleShowList(msg)}
                    disabled={isLoading}
                  >
                    📄 Toon eerste 50 resultaten
                  </button>
                )}

                {msg.metadata?.resultsTruncated && msg.metadata?.fullResultSparql && (
                  <div className="mt-3">
                    <button
                      className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 rounded-xl text-xs font-semibold hover:bg-emerald-600 hover:text-white transition-colors"
                      onClick={() => handleDownloadAll(msg)}
                      disabled={isLoading}
                    >
                      ⬇️ Download alles
                    </button>
                  </div>
                )}
                
                {/* Results table */}
                {msg.role === 'assistant' && msg.results && msg.results.length > 0 && (
                  <div className="mt-8 space-y-4 pt-6 border-t border-slate-100 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-emerald-500" />
                        Resultaten ({msg.results.length})
                      </span>
                      <button onClick={() => downloadAsExcel(msg.results || [], { vraag: msg.text, sparql: msg.sparql, timestamp: msg.timestamp, endpoint: sparqlEndpoint })} className="flex items-center gap-2 text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-700 px-4 py-2 rounded-xl hover:bg-emerald-600 hover:text-white transition-all">
                        <Download className="w-4 h-4" /> EXCEL EXPORT
                      </button>
                    </div>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                      <table className="min-w-full text-[11px] text-left">
                        <thead className="bg-slate-200/50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider">
                          <tr>{Object.keys(msg.results[0]).map(k => <th key={k} className="px-5 py-3">{k}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          {msg.results.slice(0, 10).map((row, i) => (
                            <tr key={i} className="hover:bg-white dark:hover:bg-slate-700 transition-colors">
                              {Object.values(row).map((val: any, j) => (
                                <td key={j} className="px-5 py-3 truncate max-w-[200px] text-slate-500 dark:text-slate-400" title={val}>{String(val)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* SPARQL query */}
                {msg.role === 'assistant' && msg.sparql && (
                  <div className="mt-6 pt-6 border-t border-slate-100">
                    <button onClick={() => setShowSparql(!showSparql)} className="text-[10px] font-black text-slate-400 hover:text-emerald-600 uppercase tracking-widest flex items-center gap-2">
                      <Server className="w-3 h-3" /> {showSparql ? 'Verberg' : 'Bekijk'} Query
                    </button>
                    {showSparql && (
                      <pre className="mt-3 p-4 bg-slate-900 text-emerald-400 text-[10px] rounded-2xl overflow-x-auto font-mono border border-slate-800">
                        {msg.sparql}
                      </pre>
                    )}
                  </div>
                )}

                {/* Feedback controls */}
                {msg.role === 'assistant' && !msg.metadata?.isDisambiguation && (
                  <div className="mt-4 flex items-center gap-3 pt-4 border-t border-slate-100">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Feedback</span>
                    <button
                      className={`flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                        msg.feedback === 'like' 
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                          : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-700'
                      }`}
                      onClick={() => handleFeedback(msg.id, 'like')}
                      disabled={!!msg.feedback}
                    >
                      <ThumbsUp className="w-4 h-4" /> Handig
                    </button>
                    <button
                      className={`flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                        msg.feedback === 'dislike' 
                          ? 'bg-rose-50 border-rose-200 text-rose-700' 
                          : 'bg-white border-slate-200 text-slate-500 hover:border-rose-300 hover:text-rose-700'
                      }`}
                      onClick={() => handleFeedback(msg.id, 'dislike')}
                      disabled={!!msg.feedback}
                    >
                      <ThumbsDown className="w-4 h-4" /> Niet nuttig
                    </button>
                    {msg.feedback && (
                      <span className="text-xs font-semibold text-slate-500">Bedankt! Feedback opgeslagen.</span>
                    )}
                  </div>
                )}
              </div>
              <span className="mt-2 px-3 text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                {msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </span>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
              </div>
              <div className="space-y-3 pt-2">
                <div className="h-2 w-48 bg-slate-200 rounded-full animate-pulse"></div>
                <div className="h-2 w-32 bg-slate-100 rounded-full animate-pulse"></div>
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent">
          {/* Disambiguation hint */}
          {pendingDisambiguation && (
            <div className="max-w-4xl mx-auto mb-3 px-4 py-2 bg-amber-100 text-amber-800 text-xs font-bold rounded-xl flex items-center gap-2">
              <HelpCircle className="w-4 h-4" />
              Typ een nummer of naam om je keuze te bevestigen
            </div>
          )}

          <div className="max-w-4xl mx-auto relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-green-500 rounded-[2rem] blur opacity-20 group-focus-within:opacity-40 transition duration-1000"></div>
            <div className="relative flex flex-col gap-3 bg-white border border-slate-200 rounded-[2rem] p-3 shadow-2xl">
              <div className="flex items-end gap-3">
                <textarea
                  className="flex-1 p-4 text-base bg-transparent outline-none resize-none max-h-40 min-h-[56px] text-slate-800"
                  placeholder={pendingDisambiguation ? "Typ je keuze (nummer of naam)..." : apiStatus === 'offline' ? "Wacht op verbinding..." : "Stel een vraag of gebruik dicteren..."}
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                  rows={1}
                  disabled={apiStatus === 'offline' || isLoading}
                />
                <div className="flex flex-col items-end gap-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={startListening}
                      disabled={isListening || apiStatus === 'offline' || speechSupport !== 'supported'}
                      className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-colors border ${
                        isListening
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      } ${speechSupport !== 'supported' ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <Mic className="w-4 h-4" />
                      {isListening ? 'Luistert...' : 'Dicteer'}
                    </button>
                    {isListening && (
                      <button
                        type="button"
                        onClick={stopListening}
                        className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-colors border bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                      >
                        <MicOff className="w-4 h-4" />
                        Pauzeer
                      </button>
                    )}
                    {!isListening && capturedTranscript && (
                      <button
                        type="button"
                        onClick={startListening}
                        className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-colors border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                      >
                        <Mic className="w-4 h-4" />
                        Hervat
                      </button>
                    )}
                    <button
                      disabled={isLoading || !inputText.trim() || apiStatus === 'offline'}
                      onClick={() => handleSend()}
                      className="bg-emerald-600 text-white p-4.5 rounded-2xl hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-400 transition-all flex items-center justify-center min-w-[56px] h-[56px]"
                    >
                      {isLoading ? <RefreshCcw className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <label className="font-semibold text-slate-600">Taal</label>
                    <select
                      value={speechLang}
                      onChange={(e) => setSpeechLang(e.target.value as 'nl-NL' | 'en-US')}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white"
                    >
                      <option value="nl-NL">Nederlands (nl-NL)</option>
                      <option value="en-US">English (en-US)</option>
                    </select>
                  </div>
                </div>
              </div>
              {(speechStatus || interimTranscript || capturedTranscript) && (
                <div className="px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-800 flex items-start gap-2">
                  <Loader2 className={`w-4 h-4 mt-0.5 text-emerald-500 ${isListening ? 'animate-spin' : ''}`} />
                  <div className="space-y-1">
                    <div className="font-semibold">{speechStatus || 'Live transcriptie'}</div>
                    {capturedTranscript && (
                      <div className="text-slate-700">
                        <strong>Ingesproken:</strong> {capturedTranscript}
                      </div>
                    )}
                    {interimTranscript && <div className="text-slate-700">{interimTranscript}</div>}
                  </div>
                </div>
              )}
              {speechError && (
                <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 mt-0.5" />
                  <div>{speechError}</div>
                </div>
              )}
              {speechSupport === 'unsupported' && (
                <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 flex items-start gap-2">
                  <InfoIcon className="w-4 h-4 mt-0.5" />
                  <div>
                    Spraakherkenning wordt niet ondersteund in deze browser. Gebruik Chrome of Edge en activeer microfoontoegang.
                  </div>
                </div>
              )}
              {capturedTranscript && (
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={confirmTranscript}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors border bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Bevestig transcriptie naar invoerveld
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCapturedTranscript('');
                      setInterimTranscript('');
                    }}
                    className="text-xs font-semibold text-slate-500 hover:text-rose-600"
                  >
                    Wis transcriptie
                  </button>
                </div>
              )}
              <div className="flex items-start gap-2 text-[11px] text-slate-500">
                <InfoIcon className="w-4 h-4 mt-0.5 text-slate-400" />
                <p>
                  Audio via de Web Speech API blijft in je browser en wordt niet naar onze servers gestuurd. Mocht later een externe fallback
                  beschikbaar komen, dan krijg je eerst expliciet toestemming om audio naar de server of API te verzenden.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Test Dashboard Button */}
        <button
          onClick={() => setShowTests(true)}
          className="fixed bottom-6 right-6 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-lg transition-all flex items-center gap-2 font-bold text-sm z-50"
        >
          🧪 Tests
        </button>
      </main>
        </div>
      )}

      {/* Match Modal */}
      <MatchModal
        isOpen={showMatchModal}
        onClose={() => {
          setShowMatchModal(false);
          // Reset RIASEC selectie en CV match results als modal gesloten wordt
          setRiasecSelectedCapabilities([]);
          setCvMatchResults(null);
        }}
        onMatchComplete={(results) => {
          console.log('Match complete:', results.length, 'beroepen gevonden');
        }}
        initialSkills={riasecSelectedCapabilities.map(cap => cap.label)}
        presetProfile={combinedProfile}
        cvMatchData={cvMatchResults}
        onAddToProfile={(extractedData, aggregatedSkills) => {
          console.log('[App] onAddToProfile from MatchModal called');
          console.log('  - extractedData:', extractedData);
          console.log('  - aggregatedSkills:', aggregatedSkills);

          // Convert CV data to profile items
          const skillsToAdd: ProfileItemWithSource[] = [];

          // Add skills from aggregatedSkills
          if (aggregatedSkills?.combined && aggregatedSkills.combined.length > 0) {
            console.log('[App] Adding', aggregatedSkills.combined.length, 'skills from combined array');
            aggregatedSkills.combined.forEach((skillLabel: string) => {
              // Find the skill with its URI if available
              const directSkill = aggregatedSkills.direct?.find((s: any) => s.label === skillLabel);
              const eduSkill = aggregatedSkills.fromEducation?.find((s: any) => s.label === skillLabel);
              const occSkill = aggregatedSkills.fromOccupation?.find((s: any) => s.label === skillLabel);

              const skill = directSkill || eduSkill || occSkill;
              if (skill) {
                skillsToAdd.push({
                  uri: skill.uri || `cv-skill-${skillLabel}`,
                  label: skillLabel,
                  type: 'skill',
                  sources: [{
                    id: 'cv-import',
                    label: skill.sourceLabel || 'CV Upload',
                    type: 'import' as const
                  }]
                });
              } else {
                skillsToAdd.push({
                  uri: `cv-skill-${skillLabel}`,
                  label: skillLabel,
                  type: 'skill',
                  sources: [{
                    id: 'cv-import',
                    label: 'CV Upload',
                    type: 'import' as const
                  }]
                });
              }
            });
          }

          // Merge with current profile
          if (skillsToAdd.length > 0) {
            mergeProfile({ skills: skillsToAdd });
            console.log('[App] Added', skillsToAdd.length, 'skills from CV to profile');
          }
        }}
      />
      <ProfileHistoryWizard
        isOpen={showProfileWizard}
        onClose={() => setShowProfileWizard(false)}
        onProfileReady={() => setShowMatchModal(true)}
      />

      {/* CV Upload Modal (Quick Mode) */}
      <CVUploadModal
        isOpen={showCVUpload}
        sessionId={sessionId}
        backendUrl={localBackendUrl}
        onClose={() => setShowCVUpload(false)}
        onComplete={(cvId) => {
          setCurrentCvId(cvId);
          setShowCVUpload(false);
          setShowCVReview(true);
        }}
      />

      {/* CV Parsing Wizard (Step-by-step Mode) */}
      <CVParsingWizard
        isOpen={showCVWizard}
        sessionId={sessionId}
        backendUrl={localBackendUrl}
        onClose={() => setShowCVWizard(false)}
        onComplete={(cvId) => {
          setCurrentCvId(cvId);
          setShowCVWizard(false);
          setShowCVReview(true);
        }}
      />

      {/* Quick Upload & Match Modal */}
      <QuickUploadMatchModal
        isOpen={showQuickMatch}
        sessionId={sessionId}
        onClose={() => setShowQuickMatch(false)}
        onGoToWizard={() => {
          setShowQuickMatch(false);
          setShowCVWizard(true);
        }}
        onComplete={(result) => {
          setShowQuickMatch(false);
          // Store match results and open match modal with results
          if (result && result.matches) {
            console.log('[App] Quick match results received:', result.matchCount, 'matches');
            console.log('[App] Result extraction:', result.extraction);
            console.log('[App] Result skillSources:', result.skillSources);
            setCvMatchResults({
              matches: result.matches,
              matchCount: result.matchCount || result.matches.length,
              profile: result.skillSources ? {
                capabilities: result.skillSources.combined?.length || 0,
                knowledge: 0,
                tasks: 0
              } : undefined,
              // Pass extraction data for "add to profile" feature
              extraction: result.extraction,
              skillSources: result.skillSources
            });
          }
          setShowMatchModal(true);
        }}
      />

      {/* CV Review Screen - shown as full page overlay */}
      {showCVReview && currentCvId && (
        <div className="fixed inset-0 bg-white dark:bg-slate-900 z-50 overflow-y-auto">
          <CVReviewScreen
            cvId={currentCvId}
            onBack={() => {
              setShowCVReview(false);
              setCurrentCvId(null);
            }}
            onComplete={(matchResults) => {
              setShowCVReview(false);
              // Store match results and open match modal
              if (matchResults) {
                console.log('[App] CV match results received:', matchResults.matchCount, 'matches');
                setCvMatchResults(matchResults);
              }
              setShowMatchModal(true);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default App;
