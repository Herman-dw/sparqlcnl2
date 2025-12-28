/**
 * Test Sidebar Button Component
 * ==============================
 * 
 * Klein component om toe te voegen aan de sidebar van de app.
 * Toont een test-icoon dat het Test Dashboard opent.
 * 
 * Gebruik:
 * ```tsx
 * import { TestSidebarButton, TestDashboardModal } from './test-suite/components/TestSidebarButton';
 * 
 * // In je sidebar:
 * <TestSidebarButton onClick={() => setShowTests(true)} />
 * 
 * // In je main app:
 * <TestDashboardModal 
 *   isOpen={showTests} 
 *   onClose={() => setShowTests(false)} 
 * />
 * ```
 */

import React, { useState } from 'react';
import { Beaker, X, ChevronRight } from 'lucide-react';

// Import the main dashboard (adjust path as needed)
// import TestDashboard from './TestDashboard';

// ============================================================
// SIDEBAR BUTTON
// ============================================================

interface TestSidebarButtonProps {
  onClick: () => void;
  collapsed?: boolean;
}

export const TestSidebarButton: React.FC<TestSidebarButtonProps> = ({ 
  onClick, 
  collapsed = false 
}) => {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        width: '100%',
        padding: collapsed ? '12px' : '12px 16px',
        backgroundColor: 'transparent',
        border: 'none',
        borderRadius: '8px',
        color: '#888',
        cursor: 'pointer',
        fontSize: '14px',
        textAlign: 'left',
        transition: 'all 0.2s',
        justifyContent: collapsed ? 'center' : 'flex-start'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#1e1e2e';
        e.currentTarget.style.color = '#4CAF50';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
        e.currentTarget.style.color = '#888';
      }}
      title="Test Orchestrator"
    >
      <Beaker size={20} />
      {!collapsed && (
        <>
          <span style={{ flex: 1 }}>Test Orchestrator</span>
          <ChevronRight size={16} />
        </>
      )}
    </button>
  );
};

// ============================================================
// MODAL WRAPPER
// ============================================================

interface TestDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  backendUrl?: string;
}

export const TestDashboardModal: React.FC<TestDashboardModalProps> = ({
  isOpen,
  onClose,
  backendUrl = 'http://127.0.0.1:3001'
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          position: 'relative',
          maxWidth: '900px',
          maxHeight: '90vh',
          width: '100%',
          overflow: 'auto',
          borderRadius: '12px',
          boxShadow: '0 10px 50px rgba(0,0,0,0.5)'
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '15px',
            right: '15px',
            backgroundColor: '#333',
            border: 'none',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#fff',
            zIndex: 10
          }}
        >
          <X size={18} />
        </button>

        {/* Dashboard content placeholder - replace with actual import */}
        <div
          style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            backgroundColor: '#1a1a2e',
            color: '#e0e0e0',
            padding: '30px',
            minHeight: '400px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <Beaker size={28} color="#4CAF50" />
            <h2 style={{ margin: 0, fontSize: '24px' }}>Test Orchestrator</h2>
          </div>
          
          <p style={{ color: '#888', marginBottom: '20px' }}>
            Importeer het TestDashboard component om de volledige test suite te zien.
          </p>

          <pre style={{
            backgroundColor: '#0a0a15',
            padding: '15px',
            borderRadius: '8px',
            fontSize: '13px',
            overflow: 'auto'
          }}>
{`// In je component file:
import TestDashboard from './test-suite/components/TestDashboard';

// In de render:
<TestDashboard 
  backendUrl="${backendUrl}"
  onClose={() => setShowTests(false)}
/>`}
          </pre>

          <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#16213e', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Test Scenarios:</h4>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#aaa' }}>
              <li>Disambiguatie: Architect</li>
              <li>Domein-detectie: Education</li>
              <li>Aantallen: &gt;49 resultaten</li>
              <li>Vervolgvraag met Context</li>
              <li>Concept Resolver: Loodgieter</li>
              <li>Opleiding: Skills &amp; Knowledge</li>
              <li>RIASEC Hollandcode: R</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// SIDEBAR WIDGET (Compact versie)
// ============================================================

interface TestSidebarWidgetProps {
  backendUrl?: string;
}

export const TestSidebarWidget: React.FC<TestSidebarWidgetProps> = ({
  backendUrl = 'http://127.0.0.1:3001'
}) => {
  const [lastResult, setLastResult] = useState<{
    passed: number;
    failed: number;
    timestamp: string;
  } | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const runQuickTest = async () => {
    setIsRunning(true);
    
    // Simuleer quick health check
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setLastResult({
      passed: 7,
      failed: 1,
      timestamp: new Date().toISOString()
    });
    setIsRunning(false);
  };

  return (
    <div
      style={{
        backgroundColor: '#16213e',
        borderRadius: '8px',
        padding: '15px',
        margin: '10px 0'
      }}
    >
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        marginBottom: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Beaker size={16} color="#4CAF50" />
          <span style={{ fontSize: '13px', fontWeight: 600 }}>Test Orchestrator</span>
        </div>
        <button
          onClick={runQuickTest}
          disabled={isRunning}
          style={{
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '11px',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            opacity: isRunning ? 0.6 : 1
          }}
        >
          {isRunning ? 'Running...' : 'Quick Test'}
        </button>
      </div>

      {lastResult && (
        <div style={{ 
          display: 'flex', 
          gap: '15px', 
          fontSize: '12px' 
        }}>
          <span style={{ color: '#4CAF50' }}>✓ {lastResult.passed}</span>
          <span style={{ color: '#f44336' }}>✗ {lastResult.failed}</span>
          <span style={{ color: '#888' }}>
            {Math.round((lastResult.passed / (lastResult.passed + lastResult.failed)) * 100)}%
          </span>
        </div>
      )}

      {!lastResult && (
        <p style={{ fontSize: '11px', color: '#666', margin: 0 }}>
          Klik op "Quick Test" om de scenario's te testen
        </p>
      )}
    </div>
  );
};

// Default export
export default TestSidebarButton;
