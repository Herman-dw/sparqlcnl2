/**
 * Feedback Service
 * ================
 * Logt gebruikersfeedback (like/dislike) voor analyse en verbetering.
 * Data wordt lokaal opgeslagen in localStorage en kan geëxporteerd worden.
 */

export interface FeedbackEntry {
  id: string;
  timestamp: Date;
  question: string;
  sparqlQuery: string;
  resultCount: number;
  feedback: 'like' | 'dislike';
  comment?: string;
}

const STORAGE_KEY = 'competentnl_feedback';
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Haal alle feedback op uit localStorage
export const getAllFeedback = (): FeedbackEntry[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const entries = JSON.parse(stored);
    // Converteer timestamp strings terug naar Date objects
    return entries.map((e: any) => ({
      ...e,
      timestamp: new Date(e.timestamp)
    }));
  } catch (error) {
    console.error('Error reading feedback:', error);
    return [];
  }
};

// Sla feedback op
export const saveFeedback = (entry: Omit<FeedbackEntry, 'id' | 'timestamp'>): FeedbackEntry => {
  const newEntry: FeedbackEntry = {
    ...entry,
    id: `fb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date()
  };
  
  try {
    const existing = getAllFeedback();
    existing.push(newEntry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    
    // Log ook naar console voor debugging
    console.log('[Feedback]', newEntry.feedback, {
      question: newEntry.question,
      resultCount: newEntry.resultCount
    });
    
    return newEntry;
  } catch (error) {
    console.error('Error saving feedback:', error);
    throw error;
  }
};

// Haal feedback statistieken op
export const getFeedbackStats = () => {
  const all = getAllFeedback();
  const likes = all.filter(f => f.feedback === 'like').length;
  const dislikes = all.filter(f => f.feedback === 'dislike').length;
  
  return {
    total: all.length,
    likes,
    dislikes,
    likePercentage: all.length > 0 ? Math.round((likes / all.length) * 100) : 0
  };
};

// Exporteer feedback als JSON
export const exportFeedbackAsJson = (): string => {
  const all = getAllFeedback();
  return JSON.stringify(all, null, 2);
};

// Exporteer feedback als CSV
export const exportFeedbackAsCsv = (): string => {
  const all = getAllFeedback();
  if (all.length === 0) return '';
  
  const headers = ['timestamp', 'feedback', 'question', 'resultCount', 'sparqlQuery'];
  const rows = all.map(entry => [
    entry.timestamp.toISOString(),
    entry.feedback,
    `"${entry.question.replace(/"/g, '""')}"`,
    entry.resultCount,
    `"${entry.sparqlQuery.replace(/"/g, '""').replace(/\n/g, ' ')}"`
  ]);
  
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
};

// Verwijder alle feedback (voor testing)
export const clearAllFeedback = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

interface FeedbackPayload {
  sessionId: string;
  messageId: string;
  feedback: 'like' | 'dislike';
  context?: Record<string, any>;
}

// Stuur feedback door naar backend voor logging
export const sendFeedbackToBackend = async (payload: FeedbackPayload): Promise<void> => {
  const rating = payload.feedback === 'like' ? 5 : 1;
  const feedbackType = payload.feedback === 'like' ? 'helpful' : 'not_helpful';

  try {
    await fetch(`${BACKEND_URL}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: payload.sessionId,
        messageId: payload.messageId,
        rating,
        feedbackType,
        context: payload.context
      })
    });
  } catch (error) {
    // Niet kritiek voor de UI, log alleen
    console.warn('Feedback kon niet naar de backend worden gestuurd', error);
  }
};

// Haal queries op die negatieve feedback kregen (voor analyse)
export const getDislikedQueries = (): FeedbackEntry[] => {
  return getAllFeedback().filter(f => f.feedback === 'dislike');
};

// Haal de meest recente feedback op
export const getRecentFeedback = (limit: number = 10): FeedbackEntry[] => {
  return getAllFeedback()
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit);
};
