/**
 * ServiceStatusBar Component
 * Toont status van alle backend services: SPARQL, Backend, LLM, GLiNER, Database
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Wifi, WifiOff, Loader2, Database, Brain, Server,
  Shield, ChevronDown, ChevronUp, RefreshCw, Clock,
  CheckCircle, XCircle, AlertCircle
} from 'lucide-react';

export interface ServiceStatus {
  name: string;
  url: string;
  status: 'online' | 'offline' | 'error' | 'checking';
  responseTime?: number;
  error?: string;
  version?: string;
  modelLoaded?: boolean;
  statusCode?: number;
  database?: string;
}

export interface HealthCheckResponse {
  timestamp: string;
  services: {
    backend?: ServiceStatus;
    sparql?: ServiceStatus;
    gliner?: ServiceStatus;
    llm?: ServiceStatus;
    database?: ServiceStatus;
  };
  summary: {
    total: number;
    online: number;
    offline: number;
    allHealthy: boolean;
    totalResponseTime: number;
  };
}

interface ServiceStatusBarProps {
  backendUrl: string;
  refreshInterval?: number; // in milliseconds, default 30000 (30s)
  compact?: boolean;
}

const ServiceIcon: React.FC<{ service: string; className?: string }> = ({ service, className = "w-3 h-3" }) => {
  switch (service) {
    case 'backend': return <Server className={className} />;
    case 'sparql': return <Database className={className} />;
    case 'llm': return <Brain className={className} />;
    case 'gliner': return <Shield className={className} />;
    case 'database': return <Database className={className} />;
    default: return <Server className={className} />;
  }
};

const StatusIndicator: React.FC<{ status: ServiceStatus['status'] }> = ({ status }) => {
  switch (status) {
    case 'online':
      return <CheckCircle className="w-3 h-3 text-emerald-500" />;
    case 'checking':
      return <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />;
    case 'error':
      return <AlertCircle className="w-3 h-3 text-amber-500" />;
    case 'offline':
      return <XCircle className="w-3 h-3 text-rose-500" />;
    default:
      return <AlertCircle className="w-3 h-3 text-slate-400" />;
  }
};

const ServicePill: React.FC<{
  serviceKey: string;
  service: ServiceStatus;
  onClick?: () => void;
  showDetails?: boolean;
}> = ({ serviceKey, service, onClick, showDetails }) => {
  // Higher contrast colors for better visibility
  const statusColors = {
    online: 'bg-emerald-600 text-white border-emerald-700 shadow-sm',
    checking: 'bg-amber-500 text-white border-amber-600 shadow-sm',
    error: 'bg-orange-500 text-white border-orange-600 shadow-sm',
    offline: 'bg-rose-600 text-white border-rose-700 shadow-sm'
  };

  const shortNames: Record<string, string> = {
    backend: 'API',
    sparql: 'SPARQL',
    llm: 'LLM',
    gliner: 'PII',
    database: 'DB'
  };

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className={`flex items-center gap-1 px-2 py-1 text-[9px] font-bold rounded-full border transition-all ${statusColors[service.status]} hover:opacity-90`}
      >
        <ServiceIcon service={serviceKey} className="w-2.5 h-2.5" />
        <span className="uppercase">{shortNames[serviceKey] || serviceKey}</span>
      </button>

      {/* Tooltip on hover */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 dark:bg-slate-700 text-white text-[10px] rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
        <div className="font-bold mb-1">{service.name}</div>
        <div className="text-slate-300 space-y-0.5">
          <div>Status: <span className={service.status === 'online' ? 'text-emerald-400' : 'text-rose-400'}>{service.status}</span></div>
          {service.responseTime !== undefined && (
            <div>Response: {service.responseTime}ms</div>
          )}
          {service.error && (
            <div className="text-rose-400 max-w-[200px] truncate">{service.error}</div>
          )}
        </div>
        {/* Arrow */}
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800 dark:border-t-slate-700" />
      </div>
    </div>
  );
};

export const ServiceStatusBar: React.FC<ServiceStatusBarProps> = ({
  backendUrl,
  refreshInterval = 30000,
  compact = true
}) => {
  const [healthData, setHealthData] = useState<HealthCheckResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<{ key: string; service: ServiceStatus } | null>(null);

  const checkHealth = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${backendUrl}/api/health/all`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: HealthCheckResponse = await response.json();
      // Log to console for debugging
      console.log('[ServiceStatusBar] Health check response:', data);
      setHealthData(data);
      setLastChecked(new Date());
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Health check failed';
      console.error('[ServiceStatusBar] Health check failed:', errorMsg);
      setError(errorMsg);
      // Set all services as offline if backend unreachable
      setHealthData({
        timestamp: new Date().toISOString(),
        services: {
          backend: { name: 'Backend Server', url: backendUrl, status: 'offline', error: 'Unreachable' }
        },
        summary: { total: 1, online: 0, offline: 1, allHealthy: false, totalResponseTime: 0 }
      });
    } finally {
      setIsLoading(false);
    }
  }, [backendUrl]);

  // Handle service click - show debug modal
  const handleServiceClick = (key: string, service: ServiceStatus) => {
    console.log(`[ServiceStatusBar] Service clicked: ${key}`, service);
    setSelectedService({ key, service });
  };

  // Close debug modal
  const closeDebugModal = () => {
    setSelectedService(null);
  };

  // Initial check and interval
  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, refreshInterval);
    return () => clearInterval(interval);
  }, [checkHealth, refreshInterval]);

  const services = healthData?.services || {};
  const summary = healthData?.summary;
  const serviceCount = Object.keys(services).length;

  // Loading state - show spinner before first data
  if (isLoading && !healthData) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold rounded-full bg-slate-200 text-slate-600 border border-slate-300">
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
          <span>LADEN...</span>
        </div>
      </div>
    );
  }

  // Error state - backend unreachable
  if (error && serviceCount <= 1) {
    return (
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold rounded-full bg-rose-600 text-white border border-rose-700 shadow-sm">
          <XCircle className="w-2.5 h-2.5" />
          <span>BACKEND OFFLINE</span>
        </div>
        <button
          onClick={checkHealth}
          disabled={isLoading}
          className="p-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors disabled:opacity-50"
          title="Opnieuw proberen"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    );
  }

  // Debug Modal Component
  const DebugModal = () => {
    if (!selectedService) return null;
    const { key, service } = selectedService;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={closeDebugModal}>
        <div
          className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className={`px-4 py-3 flex items-center justify-between ${
            service.status === 'online' ? 'bg-emerald-600' :
            service.status === 'checking' ? 'bg-amber-500' :
            service.status === 'error' ? 'bg-orange-500' : 'bg-rose-600'
          } text-white`}>
            <div className="flex items-center gap-2">
              <ServiceIcon service={key} className="w-5 h-5" />
              <span className="font-bold">{service.name}</span>
            </div>
            <button onClick={closeDebugModal} className="hover:bg-white/20 rounded p-1">
              <XCircle className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-slate-500 dark:text-slate-400">Status:</div>
              <div className={`font-bold ${
                service.status === 'online' ? 'text-emerald-600' : 'text-rose-600'
              }`}>{service.status.toUpperCase()}</div>

              <div className="text-slate-500 dark:text-slate-400">URL:</div>
              <div className="font-mono text-xs break-all text-slate-700 dark:text-slate-300">{service.url}</div>

              {service.responseTime !== undefined && (
                <>
                  <div className="text-slate-500 dark:text-slate-400">Response tijd:</div>
                  <div className="text-slate-700 dark:text-slate-300">{service.responseTime}ms</div>
                </>
              )}

              {service.statusCode !== undefined && (
                <>
                  <div className="text-slate-500 dark:text-slate-400">HTTP Status:</div>
                  <div className="text-slate-700 dark:text-slate-300">{service.statusCode}</div>
                </>
              )}

              {service.version && (
                <>
                  <div className="text-slate-500 dark:text-slate-400">Versie:</div>
                  <div className="text-slate-700 dark:text-slate-300">{service.version}</div>
                </>
              )}

              {service.modelLoaded !== undefined && (
                <>
                  <div className="text-slate-500 dark:text-slate-400">Model geladen:</div>
                  <div className="text-slate-700 dark:text-slate-300">{service.modelLoaded ? 'Ja' : 'Nee'}</div>
                </>
              )}

              {service.database && (
                <>
                  <div className="text-slate-500 dark:text-slate-400">Database:</div>
                  <div className="text-slate-700 dark:text-slate-300">{service.database}</div>
                </>
              )}
            </div>

            {/* Error Section */}
            {service.error && (
              <div className="mt-3 p-3 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-lg">
                <div className="text-xs font-bold text-rose-600 dark:text-rose-400 mb-1">FOUTMELDING:</div>
                <div className="text-sm text-rose-700 dark:text-rose-300 font-mono break-all">{service.error}</div>
              </div>
            )}

            {/* Raw JSON */}
            <div className="mt-3">
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">RAW DATA (voor debugging):</div>
              <pre className="text-[10px] bg-slate-100 dark:bg-slate-900 p-2 rounded overflow-x-auto text-slate-600 dark:text-slate-400">
                {JSON.stringify(service, null, 2)}
              </pre>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-200 dark:border-slate-600 flex justify-end gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(service, null, 2));
                alert('Gekopieerd naar klembord!');
              }}
              className="px-3 py-1.5 text-xs font-bold bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-500"
            >
              Kopieer JSON
            </button>
            <button
              onClick={closeDebugModal}
              className="px-3 py-1.5 text-xs font-bold bg-slate-700 text-white rounded-lg hover:bg-slate-600"
            >
              Sluiten
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Compact view - just pills
  if (compact && !expanded) {
    return (
      <>
        <DebugModal />
        <div className="flex items-center gap-1">
          {Object.entries(services).map(([key, service]) => (
            <ServicePill
              key={key}
              serviceKey={key}
              service={service}
              onClick={() => handleServiceClick(key, service)}
            />
          ))}
          <button
            onClick={() => setExpanded(true)}
            className="p-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            title="Meer details"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
          <button
            onClick={checkHealth}
            disabled={isLoading}
            className="p-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors disabled:opacity-50"
            title="Ververs status"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </>
    );
  }

  // Expanded view - detailed panel
  return (
    <>
      <DebugModal />
      <div className="relative">
        {/* Compact toggle */}
        <button
          onClick={() => setExpanded(false)}
          className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          <span className="font-bold">Service Status</span>
          <ChevronUp className="w-3 h-3" />
        </button>

        {/* Expanded Panel */}
        <div className="absolute bottom-full right-0 mb-2 w-72 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50">
          {/* Header */}
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              <span className="font-bold text-sm text-slate-700 dark:text-slate-200">Service Status</span>
            </div>
            <button
              onClick={checkHealth}
              disabled={isLoading}
              className="p-1.5 rounded-lg bg-white dark:bg-slate-600 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-500 transition-colors disabled:opacity-50"
              title="Ververs"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-600 dark:text-slate-300 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Services List */}
          <div className="p-3 space-y-2">
            {Object.entries(services).map(([key, service]) => (
              <button
                key={key}
                onClick={() => handleServiceClick(key, service)}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg border cursor-pointer hover:opacity-80 transition-opacity ${
                  service.status === 'online'
                    ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800'
                    : service.status === 'checking'
                    ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800'
                    : 'bg-rose-50 border-rose-200 dark:bg-rose-900/20 dark:border-rose-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ServiceIcon service={key} className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  <div className="text-left">
                    <div className="font-semibold text-xs text-slate-700 dark:text-slate-200">{service.name}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[140px]">
                      {service.error ? <span className="text-rose-500">{service.error.substring(0, 30)}...</span> : service.url}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {service.responseTime !== undefined && service.status === 'online' && (
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">{service.responseTime}ms</span>
                  )}
                  <StatusIndicator status={service.status} />
                </div>
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-200 dark:border-slate-600 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {lastChecked ? `${Math.round((Date.now() - lastChecked.getTime()) / 1000)}s geleden` : 'Loading...'}
            </div>
            {summary && (
              <div className={`font-bold ${summary.allHealthy ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {summary.online}/{summary.total} online
              </div>
            )}
          </div>

          {/* Hint */}
          <div className="px-4 py-1.5 bg-slate-100 dark:bg-slate-900 text-[9px] text-slate-400 dark:text-slate-500 text-center">
            Klik op een service voor debug info
          </div>
        </div>
      </div>
    </>
  );
};

export default ServiceStatusBar;
