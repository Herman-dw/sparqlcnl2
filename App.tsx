
import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Database, 
  Code, 
  Download, 
  Filter, 
  Info, 
  Trash2, 
  ThumbsUp,
  ThumbsDown,
  Loader2,
  Settings,
  AlertCircle,
  Save,
  Wifi,
  WifiOff,
  Globe,
  RefreshCcw,
  ShieldAlert,
  Server
} from 'lucide-react';
import { Message, ResourceType } from './types';
import { GRAPH_OPTIONS, EXAMPLES } from './constants';
import { generateSparql, summarizeResults } from './services/geminiService';
import { executeSparql, validateSparqlQuery, ProxyType } from './services/sparqlService';
import { downloadAsExcel } from './services/excelService';

const DEFAULT_URL = 'https://sparql.competentnl.nl';
const DEFAULT_KEY = 'l75b9cbddcd89941b4b9ef9480a5e68323';
const DEFAULT_LOCAL_BACKEND = 'http://localhost:3001';

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedGraphs, setSelectedGraphs] = useState<string[]>(GRAPH_OPTIONS.map(g => g.uri));
  const [resourceType, setResourceType] = useState<ResourceType>(ResourceType.All);
  const [showSparql, setShowSparql] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  
  // Settings
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
            <Server className="w-3 h-3" /> Modus: {proxyMode === 'local' ? 'Lokale Backend' : proxyMode}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {showSettings && (
            <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-3 animate-in fade-in zoom-in-95">
              <h4 className="text-[10px] font-bold text-indigo-700 uppercase">Geavanceerde Instellingen</h4>
              <div className="space-y-2">
                <div>
                  <label className="block text-[10px] text-indigo-600 font-bold mb-1">API KEY</label>
                  <input type="password" value={authHeader} onChange={e => setAuthHeader(e.target.value)} className="w-full text-xs p-2 border border-indigo-200 rounded-md outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] text-indigo-600 font-bold mb-1">PROXY SERVICE</label>
                  <select value={proxyMode} onChange={e => setProxyMode(e.target.value as ProxyType)} className="w-full text-xs p-2 border border-indigo-200 rounded-md outline-none bg-white">
                    <option value="local">Lokale Backend (Aanbevolen)</option>
                    <option value="codetabs">CodeTabs Proxy</option>
                    <option value="allorigins">AllOrigins Proxy</option>
                    <option value="none">Direct (Browser CORS)</option>
                  </select>
                </div>
                {proxyMode === 'local' && (
                  <div>
                    <label className="block text-[10px] text-indigo-600 font-bold mb-1">LOCAL BACKEND URL</label>
                    <input type="text" value={localBackendUrl} onChange={e => setLocalBackendUrl(e.target.value)} className="w-full text-xs p-2 border border-indigo-200 rounded-md outline-none" placeholder="http://localhost:3001" />
                  </div>
                )}
              </div>
              <button onClick={saveSettings} className="w-full bg-indigo-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-indigo-700 flex items-center justify-center gap-2">
                <Save className="w-3 h-3" /> Opslaan & Testen
              </button>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Filter className="w-3 h-3" /> Bron Filters
            </h3>
            <select className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-slate-50 outline-none" value={resourceType} onChange={e => setResourceType(e.target.value as ResourceType)}>
              <option value="">Alle Resource Types</option>
              <option value="cnlo:Occupation">Beroepen</option>
              <option value="cnlo:HumanCapability">Vaardigheden</option>
            </select>
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Info className="w-3 h-3" /> Voorbeelden
            </h3>
            <div className="space-y-2">
              {EXAMPLES.map((ex, i) => (
                <button key={i} onClick={() => handleSend(ex.vraag)} className="w-full text-left text-xs p-3 rounded-lg border border-slate-200 bg-white hover:border-indigo-400 hover:bg-indigo-50 transition-all text-slate-600 shadow-sm leading-relaxed">
                  {ex.vraag}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
          <button onClick={() => setMessages([])} className="text-[10px] text-slate-400 font-bold hover:text-red-500 flex items-center gap-1 uppercase">
            <Trash2 className="w-3 h-3" /> Wis Chat
          </button>
          <div onClick={checkConnectivity} className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-full cursor-pointer transition-all ${
            apiStatus === 'online' ? 'bg-emerald-100 text-emerald-700' : 
            apiStatus === 'checking' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
          }`}>
            {apiStatus === 'online' ? <Wifi className="w-3 h-3" /> : 
             apiStatus === 'checking' ? <Loader2 className="w-3 h-3 animate-spin" /> : <WifiOff className="w-3 h-3" />}
            {apiStatus === 'online' ? 'VERBONDEN' : apiStatus === 'checking' ? 'CHECK...' : 'OFFLINE'}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative bg-slate-50">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-8 pb-32">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-6">
              <div className="w-20 h-20 bg-indigo-100 rounded-3xl flex items-center justify-center rotate-3 shadow-xl">
                <Database className="w-10 h-10 text-indigo-600" />
              </div>
              <div className="space-y-4">
                <h2 className="text-3xl font-black text-slate-900 leading-tight">Vraag het de CompetentNL Kennisgraph</h2>
                <p className="text-slate-500 text-sm">
                  Met een lokale backend proxy omzeil je alle browser-beperkingen.
                </p>
                {apiStatus === 'offline' && (
                  <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs space-y-3 animate-in slide-in-from-bottom-2">
                    <div className="flex items-center gap-2 font-bold uppercase tracking-wider">
                      <ShieldAlert className="w-4 h-4" /> Verbinding Mislukt
                    </div>
                    <p className="opacity-90 leading-relaxed font-mono text-[10px] bg-white/50 p-2 rounded">
                      {lastError || "Kan geen verbinding maken met de backend."}
                    </p>
                    <div className="flex flex-col gap-2 pt-1">
                      <div className="text-left bg-slate-900 text-emerald-400 p-2 rounded font-mono text-[9px]">
                        # Start je lokale proxy:<br/>
                        node server.js
                      </div>
                      <button onClick={checkConnectivity} className="py-2 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700 transition-all shadow-lg flex items-center justify-center gap-2">
                        <RefreshCcw className="w-3.5 h-3.5" /> Opnieuw Testen
                      </button>
                    </div>
                  </div>
                )}
                {apiStatus === 'online' && (
                  <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                    <Wifi className="w-4 h-4" /> Systeem is klaar voor gebruik
                  </div>
                )}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[85%] p-5 rounded-2xl shadow-sm border ${
                msg.role === 'user' ? 'bg-indigo-600 text-white border-transparent' : 
                msg.status === 'error' ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-white border-slate-200 text-slate-800'
              }`}>
                {msg.status === 'error' && <div className="flex items-center gap-2 mb-2 text-rose-600 font-bold text-[10px] uppercase"><ShieldAlert className="w-4 h-4" /> ERROR</div>}
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</div>
                
                {msg.role === 'assistant' && msg.results && msg.results.length > 0 && (
                  <div className="mt-6 space-y-4 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bindings ({msg.results.length})</span>
                      <button onClick={() => downloadAsExcel(msg.results || [], { vraag: msg.text, sparql: msg.sparql, timestamp: msg.timestamp, endpoint: sparqlEndpoint })} className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition-all">
                        <Download className="w-3.5 h-3.5" /> EXCEL
                      </button>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/50">
                      <table className="min-w-full text-[10px] text-left">
                        <thead className="bg-slate-100 text-slate-500 font-bold">
                          <tr>{Object.keys(msg.results[0]).map(k => <th key={k} className="px-4 py-2">{k}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {msg.results.slice(0, 10).map((row, i) => (
                            <tr key={i} className="hover:bg-white transition-colors">
                              {Object.values(row).map((val: any, j) => (
                                <td key={j} className="px-4 py-2 truncate max-w-[150px]" title={val}>{val.toString()}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {msg.role === 'assistant' && msg.sparql && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <button onClick={() => setShowSparql(!showSparql)} className="text-[10px] font-black text-slate-400 hover:text-indigo-600 uppercase tracking-widest">
                      {showSparql ? 'Verberg' : 'Toon'} SPARQL QUERY
                    </button>
                    {showSparql && (
                      <pre className="mt-2 p-3 bg-slate-900 text-emerald-400 text-[9px] rounded-lg overflow-x-auto font-mono leading-relaxed border border-slate-800">
                        {msg.sparql}
                      </pre>
                    )}
                  </div>
                )}
              </div>
              <span className="mt-1.5 px-1 text-[9px] font-bold text-slate-300 uppercase tracking-widest">{msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-start gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
              </div>
              <div className="space-y-2 pt-2">
                <div className="h-2 w-32 bg-slate-200 rounded-full"></div>
                <div className="h-2 w-24 bg-slate-100 rounded-full"></div>
              </div>
            </div>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-50 to-transparent">
          <div className="max-w-4xl mx-auto flex items-end gap-3 bg-white border border-slate-200 rounded-2xl p-2 shadow-2xl focus-within:ring-2 focus-within:ring-indigo-500 transition-all">
            <textarea
              className="flex-1 p-3 text-sm bg-transparent outline-none resize-none max-h-32 min-h-[48px]"
              placeholder={apiStatus === 'offline' ? "Start eerst de lokale backend..." : "Stel een vraag aan de graph..."}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
              rows={1}
              disabled={apiStatus === 'offline' || isLoading}
            />
            <button
              disabled={isLoading || !inputText.trim() || apiStatus === 'offline'}
              onClick={() => handleSend()}
              className="bg-indigo-600 text-white p-3.5 rounded-xl hover:bg-indigo-700 disabled:bg-slate-200 transition-all shadow-lg flex items-center justify-center min-w-[48px]"
            >
              {isLoading ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
