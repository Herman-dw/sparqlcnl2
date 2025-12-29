/**
 * CompetentNL SPARQL Agent - v2.0.0
 * Met concept disambiguatie
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Send, Database, Download, Filter, Info, Trash2, Loader2,
  Settings, Save, Wifi, WifiOff, RefreshCcw, ShieldAlert, Server,
  HelpCircle, CheckCircle, ThumbsUp, ThumbsDown
} from 'lucide-react';
import { Message, ResourceType } from './types';
import { GRAPH_OPTIONS, EXAMPLES } from './constants';
import { 
  generateSparqlWithDisambiguation, 
  summarizeResults,
  DisambiguationData
} from './services/geminiService';
import { executeSparql, validateSparqlQuery, ProxyType } from './services/sparqlService';
import { downloadAsExcel } from './services/excelService';
import { saveFeedback, sendFeedbackToBackend } from './services/feedbackService';
import TestPage from './test-suite/components/TestPage';

const DEFAULT_URL = 'https://sparql.competentnl.nl';
const DEFAULT_LOCAL_BACKEND = 'http://localhost:3001';

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

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedGraphs, setSelectedGraphs] = useState<string[]>(GRAPH_OPTIONS.map(g => g.uri));
  const [resourceType, setResourceType] = useState<ResourceType>(ResourceType.All);
  const [showSparql, setShowSparql] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  
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

  const scrollRef = useRef<HTMLDivElement>(null);

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

  const handleSend = async (text: string = inputText) => {
    if (!text.trim()) return;

    const userMsg: Message = { 
      id: Date.now().toString(), 
      role: 'user', 
      text, 
      timestamp: new Date(), 
      status: 'success' 
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
          metadata: { isDisambiguation: true }
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
          metadata: { needsList: true }
        };
        setMessages(prev => [...prev, assistantMsg]);
        await persistMessage(assistantMsg);
        setIsLoading(false);
        return;
      }

      // We have SPARQL - execute it
      if (result.sparql) {
        const validation = validateSparqlQuery(result.sparql, selectedGraphs);
        if (!validation.valid) throw new Error(validation.error);

        const results = await executeSparql(result.sparql, sparqlEndpoint, authHeader, proxyMode, localBackendUrl);
        
        // Add resolved concepts info to summary
        let resolvedInfo = '';
        if (result.resolvedConcepts.length > 0) {
          resolvedInfo = result.resolvedConcepts
            .map(c => `_"${c.term}" → "${c.resolved}"_`)
            .join(', ') + '\n\n';
        }
        
        const summary = await summarizeResults(text, results);

        const assistantMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          text: resolvedInfo + summary,
          sparql: result.sparql,
          results: results,
          timestamp: new Date(),
          status: 'success'
        };
        setMessages(prev => [...prev, assistantMsg]);
        await persistMessage(assistantMsg);
      }
      
    } catch (error: any) {
      setPendingDisambiguation(null);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: `Fout: ${error.message}`,
        timestamp: new Date(),
        status: 'error'
      };
      setMessages(prev => [...prev, errorMsg]);
      await persistMessage(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Quick selection buttons for disambiguation
  const handleQuickSelect = (index: number) => {
    if (pendingDisambiguation) {
      handleSend((index + 1).toString());
    }
  };

  const handleShowList = async (message: Message) => {
    const sourceQuestion = message.sourceQuestion || message.text || 'Toon alle MBO kwalificaties';
    setIsLoading(true);

    try {
      const listResponse = await fetch(`${localBackendUrl}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: sourceQuestion,
          chatHistory: getChatHistory(),
          variant: 'list'
        })
      });

      const listData = listResponse.ok ? await listResponse.json() : {};
      const listSparql = listData.sparql || listData.listSparql || message.listSparql;

      if (!listSparql) {
        throw new Error('Geen SPARQL query beschikbaar voor de eerste 50 resultaten.');
      }

      const validation = validateSparqlQuery(listSparql, selectedGraphs);
      if (!validation.valid) throw new Error(validation.error);

      const results = await executeSparql(listSparql, sparqlEndpoint, authHeader, proxyMode, localBackendUrl);
      const summary = await summarizeResults(sourceQuestion, results);

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: `${listData.response || 'Hier zijn de eerste 50 resultaten:'}\n\n${summary}`,
        sparql: listSparql,
        results,
        timestamp: new Date(),
        status: 'success'
      };

      setMessages(prev => [...prev, assistantMsg]);
      await persistMessage(assistantMsg);
    } catch (error: any) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: `Fout bij laden van resultaten: ${error.message}`,
        timestamp: new Date(),
        status: 'error'
      };
      setMessages(prev => [...prev, errorMsg]);
      await persistMessage(errorMsg);
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
    const targetIndex = messages.findIndex(m => m.id === messageId);
    if (targetIndex === -1) return;

    const assistantMessage = messages[targetIndex];
    const lastQuestion = [...messages]
      .slice(0, targetIndex)
      .reverse()
      .find(m => m.role === 'user');

    // Update UI immediately
    setMessages(prev => prev.map(m => 
      m.id === messageId ? { ...m, feedback } : m
    ));

    // Update conversation log in database
    try {
      await fetch(`${localBackendUrl}/conversation/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, messageId, feedback })
      });
    } catch (error) {
      console.warn('Kon feedback niet opslaan in conversation log', error);
    }

    // Persist feedback locally
    try {
      saveFeedback({
        question: lastQuestion?.text || '(geen vraag gevonden)',
        sparqlQuery: assistantMessage.sparql || '',
        resultCount: assistantMessage.results?.length || 0,
        feedback
      });
    } catch (error) {
      console.warn('Kon feedback niet opslaan', error);
    }

    // Log feedback to backend with context
    await sendFeedbackToBackend({
      sessionId,
      messageId,
      feedback,
      context: {
        question: lastQuestion?.text,
        response: assistantMessage.text,
        sparql: assistantMessage.sparql,
        results: assistantMessage.results
      }
    });
  };

  // Show Test Dashboard if enabled
  if (showTests) {
    return <TestPage onClose={() => setShowTests(false)} backendUrl={localBackendUrl} />;
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-xl z-20">
        <div className="p-6 bg-indigo-700 text-white">
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
            <Server className="w-3 h-3" /> v2.0 met Disambiguatie
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {showSettings && (
            <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-3">
              <h4 className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest">Connectie</h4>
              <div className="space-y-2">
                <div>
                  <label className="block text-[10px] text-indigo-600 font-bold mb-1 uppercase">SPARQL Key</label>
                  <input type="password" value={authHeader} onChange={e => setAuthHeader(e.target.value)} className="w-full text-xs p-2 border border-indigo-200 rounded-md outline-none" placeholder="API Sleutel" />
                </div>
                <div>
                  <label className="block text-[10px] text-indigo-600 font-bold mb-1 uppercase">Methode</label>
                  <select value={proxyMode} onChange={e => setProxyMode(e.target.value as ProxyType)} className="w-full text-xs p-2 border border-indigo-200 rounded-md bg-white">
                    <option value="local">Eigen Backend (3001)</option>
                    <option value="none">Direct (CORS)</option>
                    <option value="codetabs">Publieke Proxy</option>
                  </select>
                </div>
              </div>
              <button onClick={saveSettings} className="w-full bg-indigo-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-indigo-700 flex items-center justify-center gap-2">
                <Save className="w-3 h-3" /> Opslaan
              </button>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Filter className="w-3 h-3" /> Graphs
            </h3>
            <div className="space-y-1">
              {GRAPH_OPTIONS.map(g => (
                <label key={g.id} className="flex items-center gap-2 text-[11px] p-1.5 hover:bg-slate-50 rounded cursor-pointer transition-colors">
                  <input 
                    type="checkbox" 
                    checked={selectedGraphs.includes(g.uri)} 
                    onChange={e => {
                      if (e.target.checked) setSelectedGraphs([...selectedGraphs, g.uri]);
                      else setSelectedGraphs(selectedGraphs.filter(u => u !== g.uri));
                    }}
                    className="rounded text-indigo-600"
                  />
                  <span className="truncate">{g.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Info className="w-3 h-3" /> Voorbeelden
            </h3>
            <div className="space-y-2">
              {EXAMPLES.map((ex, i) => (
                <button key={i} onClick={() => handleSend(ex.vraag)} className="w-full text-left text-[11px] p-3 rounded-lg border border-slate-200 bg-white hover:border-indigo-400 hover:bg-indigo-50 transition-all text-slate-600 leading-snug">
                  {ex.vraag}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
          <button onClick={handleClearChat} className="text-[10px] text-slate-400 font-bold hover:text-rose-500 flex items-center gap-1 uppercase">
            <Trash2 className="w-3 h-3" /> Wis Chat
          </button>
          <div onClick={checkConnectivity} className={`flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-full cursor-pointer shadow-sm ${
            apiStatus === 'online' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 
            apiStatus === 'checking' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-rose-100 text-rose-700 border border-rose-200'
          }`}>
            {apiStatus === 'online' ? <Wifi className="w-3 h-3" /> : 
             apiStatus === 'checking' ? <Loader2 className="w-3 h-3 animate-spin" /> : <WifiOff className="w-3 h-3" />}
            {apiStatus === 'online' ? 'ONLINE' : apiStatus === 'checking' ? 'BEZIG' : 'OFFLINE'}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative bg-slate-50">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-8 pb-32">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-8">
              <div className="relative">
                <div className="w-24 h-24 bg-indigo-600 rounded-[2rem] flex items-center justify-center rotate-6 shadow-2xl relative z-10">
                  <Database className="w-12 h-12 text-white" />
                </div>
              </div>
              <div className="space-y-4">
                <h2 className="text-4xl font-black text-slate-900 tracking-tight">CompetentNL AI Agent</h2>
                <p className="text-slate-500 text-base leading-relaxed">
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
                msg.role === 'user' ? 'bg-indigo-600 text-white border-transparent' : 
                msg.status === 'error' ? 'bg-rose-50 border-rose-200 text-rose-900' : 
                msg.metadata?.isDisambiguation ? 'bg-amber-50 border-amber-200 text-slate-800' :
                'bg-white border-slate-200 text-slate-800'
              }`}>
                {/* Disambiguation indicator */}
                {msg.metadata?.isDisambiguation && !msg.metadata?.isRiasec && (
                  <div className="flex items-center gap-2 mb-3 text-amber-600 text-sm font-bold">
                    <HelpCircle className="w-4 h-4" />
                    <span>Verduidelijking nodig</span>
                  </div>
                )}
                
                {/* Message text with markdown-like formatting */}
                <div className="text-[15px] leading-relaxed whitespace-pre-wrap">
                  {msg.text.split('\n').map((line, i) => {
                    // Bold text
                    if (line.startsWith('**') && line.includes('**')) {
                      const parts = line.split('**');
                      return (
                        <div key={i} className="my-1">
                          {parts.map((part, j) => 
                            j % 2 === 1 ? <strong key={j}>{part}</strong> : part
                          )}
                        </div>
                      );
                    }
                    // Italic text
                    if (line.startsWith('_') || line.includes('_(')) {
                      return <div key={i} className="my-1 text-slate-500 text-sm">{line.replace(/_/g, '')}</div>;
                    }
                    return <div key={i}>{line}</div>;
                  })}
                </div>

                {/* Quick selection buttons for disambiguation */}
                {msg.metadata?.isDisambiguation && pendingDisambiguation && !msg.metadata?.isRiasec && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {pendingDisambiguation.options.slice(0, 5).map((option, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleQuickSelect(idx)}
                        className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
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
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-sm font-semibold hover:bg-indigo-600 hover:text-white transition-colors"
                    onClick={() => handleShowList(msg)}
                    disabled={isLoading}
                  >
                    📄 Toon eerste 50 resultaten
                  </button>
                )}
                
                {/* Results table */}
                {msg.role === 'assistant' && msg.results && msg.results.length > 0 && (
                  <div className="mt-8 space-y-4 pt-6 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-emerald-500" />
                        Resultaten ({msg.results.length})
                      </span>
                      <button onClick={() => downloadAsExcel(msg.results || [], { vraag: msg.text, sparql: msg.sparql, timestamp: msg.timestamp, endpoint: sparqlEndpoint })} className="flex items-center gap-2 text-[10px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-xl hover:bg-indigo-600 hover:text-white transition-all">
                        <Download className="w-4 h-4" /> EXCEL EXPORT
                      </button>
                    </div>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50">
                      <table className="min-w-full text-[11px] text-left">
                        <thead className="bg-slate-200/50 text-slate-600 font-bold uppercase tracking-wider">
                          <tr>{Object.keys(msg.results[0]).map(k => <th key={k} className="px-5 py-3">{k}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {msg.results.slice(0, 10).map((row, i) => (
                            <tr key={i} className="hover:bg-white transition-colors">
                              {Object.values(row).map((val: any, j) => (
                                <td key={j} className="px-5 py-3 truncate max-w-[200px] text-slate-500" title={val}>{String(val)}</td>
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
                    <button onClick={() => setShowSparql(!showSparql)} className="text-[10px] font-black text-slate-400 hover:text-indigo-600 uppercase tracking-widest flex items-center gap-2">
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
              <div className="w-10 h-10 rounded-2xl bg-indigo-100 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
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
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-[2rem] blur opacity-20 group-focus-within:opacity-40 transition duration-1000"></div>
            <div className="relative flex items-end gap-3 bg-white border border-slate-200 rounded-[2rem] p-3 shadow-2xl">
              <textarea
                className="flex-1 p-4 text-base bg-transparent outline-none resize-none max-h-40 min-h-[56px] text-slate-800"
                placeholder={pendingDisambiguation ? "Typ je keuze (nummer of naam)..." : apiStatus === 'offline' ? "Wacht op verbinding..." : "Stel een vraag..."}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                rows={1}
                disabled={apiStatus === 'offline' || isLoading}
              />
              <button
                disabled={isLoading || !inputText.trim() || apiStatus === 'offline'}
                onClick={() => handleSend()}
                className="bg-indigo-600 text-white p-4.5 rounded-2xl hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 transition-all flex items-center justify-center min-w-[56px] h-[56px]"
              >
                {isLoading ? <RefreshCcw className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
              </button>
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
  );
};

export default App;
