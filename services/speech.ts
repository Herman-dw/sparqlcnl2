type SpeechRecognitionConstructor = new () => SpeechRecognition;

declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    SpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export type SpeechSupportStatus = 'supported' | 'unsupported';

export type SpeechCallbacks = {
  onStart?: () => void;
  onEnd?: () => void;
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (error: SpeechRecognitionErrorEvent) => void;
  shouldRestart?: () => boolean;
};

export type SpeechService = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  updateLang: (lang: string) => void;
};

const getSpeechRecognitionConstructor = (): SpeechRecognitionConstructor | null => {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

export const getSpeechSupport = (): SpeechSupportStatus => {
  return getSpeechRecognitionConstructor() ? 'supported' : 'unsupported';
};

export const createSpeechService = (
  lang: string,
  callbacks: SpeechCallbacks
): SpeechService | null => {
  const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
  if (!SpeechRecognitionCtor) return null;

  const recognition = new SpeechRecognitionCtor();
  recognition.lang = lang;
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => callbacks.onStart?.();
  recognition.onend = () => {
    callbacks.onEnd?.();
    if (callbacks.shouldRestart?.()) {
      recognition.start();
    }
  };
  recognition.onerror = (event) => callbacks.onError?.(event);
  recognition.onresult = (event: SpeechRecognitionEvent) => {
    let finalText = '';
    let interimText = '';

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalText += transcript;
      } else {
        interimText += transcript;
      }
    }

    if (interimText.trim()) {
      callbacks.onInterim?.(interimText.trim());
    } else {
      callbacks.onInterim?.('');
    }

    if (finalText.trim()) {
      callbacks.onFinal?.(finalText.trim());
    }
  };

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
    abort: () => recognition.abort(),
    updateLang: (nextLang: string) => {
      recognition.lang = nextLang;
    }
  };
};
