/**
 * ChatInterface Component v4.0.0
 * ==============================
 * React component voor de chat interface met ondersteuning voor:
 * 
 * SCENARIO 1: Disambiguatie met keuze-opties
 * SCENARIO 1a: Feedback na elke interactie
 * SCENARIO 2a: Count indicator bij grote resultaten
 * SCENARIO 3: Context-aware vervolgvragen
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  generateSPARQL, 
  handleDisambiguationSelection, 
  submitFeedback,
  generateCountQuery,
  ChatMessage,
  DisambiguationData,
  GenerateResult
} from '../services/geminiService';
import { colors, spacing, radii, shadows } from '../src/theme/tokens';

interface ChatInterfaceProps {
  apiKey: string;
  onSparqlGenerated?: (sparql: string) => void;
  onQueryExecute?: (sparql: string) => Promise<any>;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  apiKey,
  onSparqlGenerated,
  onQueryExecute
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentDisambiguation, setCurrentDisambiguation] = useState<DisambiguationData | null>(null);
  const [sessionId] = useState(() => `session_${Date.now()}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /**
   * Handle message submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    // Add user message
    const newUserMessage: ChatMessage = {
      role: 'user',
      content: userMessage
    };
    setMessages(prev => [...prev, newUserMessage]);

    try {
      let result: GenerateResult;

      // Check if this is a disambiguation response
      if (currentDisambiguation) {
        result = await handleDisambiguationSelection(
          userMessage,
          currentDisambiguation,
          apiKey
        );
        
        if (!result.needsDisambiguation) {
          setCurrentDisambiguation(null);
        }
      } else {
        // Regular query generation
        result = await generateSPARQL(apiKey, userMessage, messages);
      }

      // Add assistant message
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: result.response,
        sparql: result.sparql || undefined,
        isDisambiguation: result.needsDisambiguation,
        disambiguationData: result.disambiguationData,
        feedbackEnabled: true,
        showCountOption: result.needsCount
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Handle disambiguation
      if (result.needsDisambiguation && result.disambiguationData) {
        setCurrentDisambiguation(result.disambiguationData);
      }

      // Execute SPARQL if available
      if (result.sparql && onSparqlGenerated) {
        onSparqlGenerated(result.sparql);
      }

      if (result.sparql && onQueryExecute) {
        const queryResult = await onQueryExecute(result.sparql);
        
        // SCENARIO 2a: Check if count query needed
        if (queryResult?.results?.bindings?.length >= 50) {
          const countMessage: ChatMessage = {
            role: 'assistant',
            content: `📊 Er zijn **${queryResult.results.bindings.length}** of meer resultaten gevonden. Wil je het exacte aantal weten? Vraag "hoeveel zijn er?"`,
            showCountOption: true,
            feedbackEnabled: true
          };
          setMessages(prev => [...prev, countMessage]);
        }
      }

    } catch (error) {
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `❌ Er is een fout opgetreden: ${error instanceof Error ? error.message : 'Onbekende fout'}`,
        feedbackEnabled: true
      };
      setMessages(prev => [...prev, errorMessage]);
    }

    setIsLoading(false);
  };

  /**
   * Handle feedback submission (SCENARIO 1a)
   */
  const handleFeedback = async (
    messageIndex: number,
    feedbackType: 'helpful' | 'not_helpful' | 'incorrect' | 'suggestion',
    comment?: string
  ) => {
    const message = messages[messageIndex];
    
    await submitFeedback({
      sessionId,
      messageId: `msg_${messageIndex}`,
      feedbackType,
      comment,
      context: {
        question: messages[messageIndex - 1]?.content,
        response: message.content,
        sparql: message.sparql
      }
    });

    // Update message to show feedback received
    setMessages(prev => prev.map((m, i) => 
      i === messageIndex 
        ? { ...m, feedbackReceived: true, feedbackType }
        : m
    ));
  };

  /**
   * Quick selection for disambiguation options
   */
  const handleQuickSelect = (option: string) => {
    setInput(option);
  };

  /**
   * Request count query (SCENARIO 2a)
   */
  const handleRequestCount = () => {
    setInput('Hoeveel zijn er?');
  };

  return (
    <div className="chat-interface">
      {/* Messages */}
      <div className="messages-container">
        {messages.length === 0 && (
          <div className="welcome-message">
            <h3>👋 Welkom bij CompetentNL AI</h3>
            <p>Stel een vraag over beroepen, vaardigheden of opleidingen.</p>
            <div className="example-questions">
              <p><strong>Voorbeelden:</strong></p>
              <button onClick={() => setInput('Welke vaardigheden hebben RIASEC code R?')}>
                🏷️ Vaardigheden met RIASEC code R
              </button>
              <button onClick={() => setInput('Hoeveel vaardigheden zijn er per RIASEC letter?')}>
                🔢 Vaardigheden per RIASEC letter
              </button>
              <button onClick={() => setInput('Wat zijn de taken van een kapper?')}>
                ✂️ Taken van een kapper
              </button>
              <button onClick={() => setInput('Wat zijn de werkomstandigheden van een piloot?')}>
                🛫 Werkomstandigheden voor piloten
              </button>
              <button onClick={() => setInput('Wat zijn de taken en vaardigheden van een tandartsassistent?')}>
                🦷 Taken en skills van een tandartsassistent
              </button>
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div 
            key={index} 
            className={`message ${message.role} ${message.isDisambiguation ? 'disambiguation' : ''}`}
          >
            <div className="message-content">
              {message.role === 'assistant' && (
                <span className="avatar">🤖</span>
              )}
              {message.role === 'user' && (
                <span className="avatar">👤</span>
              )}
              
              <div className="message-text">
                <MarkdownRenderer content={message.content} />
                
                {/* SPARQL Query Display */}
                {message.sparql && (
                  <details className="sparql-details">
                    <summary>🔍 SPARQL Query</summary>
                    <pre><code>{message.sparql}</code></pre>
                  </details>
                )}

                {/* Disambiguation Quick Options (SCENARIO 1) */}
                {message.isDisambiguation && message.disambiguationData && (
                  <div className="disambiguation-options">
                    <p className="options-hint">Klik om te kiezen:</p>
                    <div className="options-grid">
                      {message.disambiguationData.options.slice(0, 6).map((opt, i) => (
                        <button 
                          key={i}
                          className="option-button"
                          onClick={() => handleQuickSelect((i + 1).toString())}
                        >
                          {i + 1}. {opt.prefLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Count Option (SCENARIO 2a) */}
                {message.showCountOption && (
                  <button 
                    className="count-button"
                    onClick={handleRequestCount}
                  >
                    🔢 Hoeveel zijn er in totaal?
                  </button>
                )}

                {/* Feedback Section (SCENARIO 1a) */}
                {message.role === 'assistant' && message.feedbackEnabled && !message.feedbackReceived && (
                  <div className="feedback-section">
                    <span className="feedback-label">Was dit nuttig?</span>
                    <button 
                      className="feedback-btn helpful"
                      onClick={() => handleFeedback(index, 'helpful')}
                      title="Nuttig"
                    >
                      👍
                    </button>
                    <button 
                      className="feedback-btn not-helpful"
                      onClick={() => handleFeedback(index, 'not_helpful')}
                      title="Niet nuttig"
                    >
                      👎
                    </button>
                    <button 
                      className="feedback-btn incorrect"
                      onClick={() => handleFeedback(index, 'incorrect')}
                      title="Onjuist"
                    >
                      ⚠️
                    </button>
                  </div>
                )}

                {/* Feedback Received Indicator */}
                {message.feedbackReceived && (
                  <div className="feedback-received">
                    ✓ Bedankt voor je feedback!
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="message assistant loading">
            <span className="avatar">🤖</span>
            <div className="loading-indicator">
              <span>●</span><span>●</span><span>●</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            currentDisambiguation 
              ? "Typ je keuze (nummer of naam)..." 
              : "Stel een vraag over CompetentNL..."
          }
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          {isLoading ? '⏳' : '➤'}
        </button>
      </form>

      {/* Context Indicator (SCENARIO 3) */}
      {messages.length > 0 && (
        <div className="context-indicator">
          💬 {messages.filter(m => m.role === 'user').length} berichten in context
        </div>
      )}
    </div>
  );
};

/**
 * Simple Markdown renderer
 */
const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  // Basic markdown parsing
  const html = content
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>');
  
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
};

/**
 * CSS Styles (can be moved to separate file)
 */
export const chatStyles = `
.chat-interface {
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 800px;
  border: 1px solid ${colors.border.subtle};
  border-radius: ${radii.md}px;
  overflow: hidden;
  background: ${colors.surface.base};
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: ${spacing.md}px;
}

.welcome-message {
  text-align: center;
  padding: ${spacing.xl}px;
}

.welcome-message h3 {
  margin-bottom: ${spacing.sm}px;
}

.example-questions {
  margin-top: ${spacing.md}px;
}

.example-questions button {
  display: block;
  width: 100%;
  padding: ${spacing.md}px;
  margin: ${spacing.sm}px 0;
  border: 1px solid ${colors.border.default};
  border-radius: ${radii.sm}px;
  background: ${colors.surface.raised};
  cursor: pointer;
  text-align: left;
  transition: background 0.2s;
}

.example-questions button:hover {
  background: ${colors.surface.muted};
}

.message {
  display: flex;
  margin-bottom: ${spacing.md}px;
}

.message.user {
  justify-content: flex-end;
}

.message.assistant {
  justify-content: flex-start;
}

.message-content {
  display: flex;
  max-width: 80%;
}

.message.user .message-content {
  flex-direction: row-reverse;
}

.avatar {
  font-size: 24px;
  margin: 0 ${spacing.sm}px;
}

.message-text {
  padding: ${spacing.md}px ${spacing.lg}px;
  border-radius: ${radii.lg}px;
  background: ${colors.surface.raised};
  box-shadow: ${shadows.soft};
}

.message.user .message-text {
  background: ${colors.primary.default};
  color: ${colors.text.inverse};
}

.message.disambiguation .message-text {
  background: ${colors.surface.attention};
  border: 1px solid ${colors.border.warning};
}

.sparql-details {
  margin-top: ${spacing.md}px;
  padding: ${spacing.sm}px;
  background: ${colors.surface.muted};
  border-radius: ${radii.sm}px;
}

.sparql-details summary {
  cursor: pointer;
  font-weight: 500;
}

.sparql-details pre {
  margin: ${spacing.sm}px 0 0;
  padding: ${spacing.md}px;
  background: ${colors.surface.inverse};
  color: ${colors.text.code};
  border-radius: ${radii.sm}px;
  overflow-x: auto;
  font-size: 12px;
}

.disambiguation-options {
  margin-top: ${spacing.md}px;
}

.options-hint {
  font-size: 12px;
  color: ${colors.text.secondary};
  margin-bottom: ${spacing.sm}px;
}

.options-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: ${spacing.sm}px;
}

.option-button {
  padding: ${spacing.sm}px ${spacing.md}px;
  border: 1px solid ${colors.border.default};
  border-radius: ${radii.sm}px;
  background: ${colors.surface.raised};
  cursor: pointer;
  text-align: left;
  font-size: 13px;
  transition: all 0.2s;
}

.option-button:hover {
  background: ${colors.surface.muted};
  border-color: ${colors.primary.default};
}

.count-button {
  margin-top: ${spacing.md}px;
  padding: ${spacing.sm}px ${spacing.lg}px;
  border: 1px solid ${colors.support.default};
  border-radius: ${radii.pill}px;
  background: ${colors.surface.raised};
  color: ${colors.support.default};
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.count-button:hover {
  background: ${colors.support.default};
  color: ${colors.text.inverse};
}

.feedback-section {
  margin-top: ${spacing.md}px;
  padding-top: ${spacing.md}px;
  border-top: 1px solid ${colors.border.subtle};
  display: flex;
  align-items: center;
  gap: ${spacing.sm}px;
}

.feedback-label {
  font-size: 12px;
  color: ${colors.text.secondary};
}

.feedback-btn {
  padding: ${spacing.xs}px ${spacing.sm}px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 16px;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.feedback-btn:hover {
  opacity: 1;
}

.feedback-received {
  margin-top: ${spacing.sm}px;
  font-size: 12px;
  color: ${colors.states.success};
}

.loading-indicator {
  display: flex;
  gap: ${spacing.xs}px;
  padding: ${spacing.md}px ${spacing.lg}px;
}

.loading-indicator span {
  animation: bounce 1.4s infinite ease-in-out both;
}

.loading-indicator span:nth-child(1) { animation-delay: -0.32s; }
.loading-indicator span:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

.input-form {
  display: flex;
  padding: ${spacing.md}px;
  background: ${colors.surface.raised};
  border-top: 1px solid ${colors.border.subtle};
}

.input-form input {
  flex: 1;
  padding: ${spacing.md}px ${spacing.lg}px;
  border: 1px solid ${colors.border.default};
  border-radius: ${radii.pill}px;
  font-size: 14px;
  outline: none;
}

.input-form input:focus {
  border-color: ${colors.primary.default};
}

.input-form button {
  margin-left: ${spacing.sm}px;
  padding: ${spacing.md}px ${spacing.lg}px;
  border: none;
  border-radius: ${radii.pill}px;
  background: ${colors.primary.default};
  color: ${colors.text.inverse};
  font-size: 16px;
  cursor: pointer;
  transition: background 0.2s;
}

.input-form button:hover:not(:disabled) {
  background: ${colors.primary.hover};
}

.input-form button:disabled {
  background: ${colors.states.disabled};
  cursor: not-allowed;
}

.context-indicator {
  padding: ${spacing.sm}px ${spacing.lg}px;
  font-size: 11px;
  color: ${colors.text.secondary};
  background: ${colors.surface.muted};
  text-align: center;
}
`;

export default ChatInterface;
