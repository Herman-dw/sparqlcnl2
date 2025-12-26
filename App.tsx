
import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Database, 
  Download, 
  Filter, 
  Info, 
  Trash2, 
  Loader2,
  Settings,
  Save,
  Wifi,
  WifiOff,
  RefreshCcw,
  ShieldAlert,
  Server
} from 'lucide-react';
import { Message, ResourceType } from './types';
import { GRAPH_OPTIONS, EXAMPLES } from './constants';
import { generateSparql, summarizeResults } from './services/geminiService';
import { executeSparql, validateSparqlQuery, ProxyType } from './services/sparqlService';
import { downloadAsExcel } from './services/excelService';

// Gebruik poort 3000 voor de frontend zoals ingesteld in vite.config.mts
const DEFAULT_URL = 'https://sparql.competentnl.nl';
const DEFAULT_KEY = '';
const DEFAULT_LOCAL_BACKEND = 'http://localhost:3001';

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedGraphs, setSelectedGraphs] = useState<string[]>(GRAPH_OPTIONS.map(g => g.uri));
  const [resourceType, setResourceType] = useState<ResourceType>(ResourceType.All);
  const [showSparql, setShowSparql] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  
  const [sparqlEndpoint, setSparqlEndpoint] = useState(() => localStorage.getItem('sparql_url') || DEFAULT_URL);
  const [authHeader, setAuthHeader] = useState(() => localStorage.getItem('sparql_auth') || DEFAULT_KEY);
  const [proxyMode, setProxyMode] = useState<ProxyType>(() => (localStorage.getItem('proxy_mode') as ProxyType) || 'local');
  const [localBackendUrl, setLocalBackendUrl] = useState(() => localStorage.getItem('local_backend_url') || DEFAULT_LOCAL_BACKEND);
  const [showSettings, setShowSettings] = useState(false);
  
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [lastError, setLastError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const checkConnectivity = async () => {
    setApiStatus('checking');
    setLastError(null);
    try {
      await executeSparql("ASK { ?s ?p ?o }", sparqlEndpoint, authHeader, proxyMode, localBackendUrl);
      setApiStatus('online');
    } catch (e: any) {
      setApiStatus('offline');
      setLastError(e.message);
    }
  };

  useEffect(() => {
    checkConnectivity();
  }, []);

  const saveSettings = () => {
    localStorage.setItem('sparql_url', sparqlEndpoint);
    localStorage.setItem('sparql_auth', authHeader);
    localStorage.setItem('proxy_mode', proxyMode);
    localStorage.setItem('local_backend_url', localBackendUrl);
    setShowSettings(false);
    checkConnectivity();
  };

  const handleSend = async (text: string = inputText) => {
    if (!text.trim()) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text, timestamp: new Date(), status: 'success' };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const sparql = await generateSparql(text, { graphs: selectedGraphs, type: resourceType, status: 'Current' });
      const validation = validateSparqlQuery(sparql, selectedGraphs);
      if (!validation.valid) throw new Error(validation.error);

      const results = await executeSparql(sparql, sparqlEndpoint, authHeader, proxyMode, localBackendUrl);
      const summary = await summarizeResults(text, results);

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: summary,
        sparql: sparql,
        results: results,
        timestamp: new Date(),
        status: 'success'
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (error: any) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: `Fout: ${error.message}`,
        timestamp: new Date(),
        status: 'error'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
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
            <Server className="w-3 h-3" /> Status: {proxyMode === 'local' ? 'Lokale Backend' : 'Proxy'}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {showSettings && (
            <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-3 animate-in fade-in zoom-in-95">
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
          <button onClick={() => setMessages([])} className="text-[10px] text-slate-400 font-bold hover:text-rose-500 flex items-center gap-1 uppercase">
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

      <main className="flex-1 flex flex-col relative bg-slate-50">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-8 pb-32">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-8">
              <div className="relative">
                <div className="w-24 h-24 bg-indigo-600 rounded-[2rem] flex items-center justify-center rotate-6 shadow-2xl relative z-10">
                  <Database className="w-12 h-12 text-white" />
                </div>
                <div className="absolute inset-0 bg-indigo-200 rounded-[2rem] -rotate-3 blur-sm"></div>
              </div>
              <div className="space-y-4">
                <h2 className="text-4xl font-black text-slate-900 tracking-tight leading-tight">CompetentNL AI Agent</h2>
                <p className="text-slate-500 text-base leading-relaxed">
                  Stel vragen in natuurlijk Nederlands over beroepen en vaardigheden.
                </p>
                {apiStatus === 'offline' && (
                  <div className="mt-8 p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-sm space-y-4">
                    <div className="flex items-center gap-2 font-black uppercase tracking-widest text-xs text-rose-600">
                      <ShieldAlert className="w-5 h-5" /> Verbindingsfout
                    </div>
                    <p className="opacity-90 font-mono text-[10px] bg-white/60 p-3 rounded-lg text-left overflow-x-auto">
                      De site op poort 3000 kan niet praten met de backend op 3001. 
                      Voer 'npm start' uit in je terminal.
                    </p>
                    <button onClick={checkConnectivity} className="w-full py-2.5 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 flex items-center justify-center gap-2">
                      <RefreshCcw className="w-4 h-4" /> Opnieuw Proberen
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2`}>
              <div className={`max-w-[90%] p-6 rounded-3xl shadow-lg border ${
                msg.role === 'user' ? 'bg-indigo-600 text-white border-transparent' : 
                msg.status === 'error' ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-white border-slate-200 text-slate-800'
              }`}>
                <div className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.text}</div>
                
                {msg.role === 'assistant' && msg.results && msg.results.length > 0 && (
                  <div className="mt-8 space-y-4 pt-6 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resultaten ({msg.results.length})</span>
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
                                <td key={j} className="px-5 py-3 truncate max-w-[200px] text-slate-500" title={val}>{val.toString()}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

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
              </div>
              <span className="mt-2 px-3 text-[10px] font-bold text-slate-300 uppercase tracking-widest">{msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
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

        <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent">
          <div className="max-w-4xl mx-auto relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-[2rem] blur opacity-20 group-focus-within:opacity-40 transition duration-1000"></div>
            <div className="relative flex items-end gap-3 bg-white border border-slate-200 rounded-[2rem] p-3 shadow-2xl">
              <textarea
                className="flex-1 p-4 text-base bg-transparent outline-none resize-none max-h-40 min-h-[56px] text-slate-800"
                placeholder={apiStatus === 'offline' ? "Wacht op verbinding..." : "Stel een vraag..."}
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
      </main>
    </div>
  );
};

export default App;
