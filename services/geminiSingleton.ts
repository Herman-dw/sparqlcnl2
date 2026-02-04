/**
 * Gemini AI Singleton Service
 * ============================
 * Provides a single reusable instance of the GoogleGenAI client
 * to prevent repeated initialization and reduce API overhead.
 *
 * Features:
 * - Lazy initialization
 * - Singleton pattern
 * - Retry logic with exponential backoff for 429 errors
 * - Configurable retry settings
 */

import { GoogleGenAI } from '@google/genai';

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatusCodes: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 4,
  baseDelayMs: 1000,      // Start with 1 second
  maxDelayMs: 16000,      // Max 16 seconds
  retryableStatusCodes: [429, 500, 502, 503, 504]
};

// ============================================================================
// SINGLETON CLASS
// ============================================================================

class GeminiSingletonService {
  private static instance: GeminiSingletonService | null = null;
  private client: GoogleGenAI | null = null;
  private apiKey: string | null = null;
  private retryConfig: RetryConfig;
  private initialized = false;

  private constructor() {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG };
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): GeminiSingletonService {
    if (!GeminiSingletonService.instance) {
      GeminiSingletonService.instance = new GeminiSingletonService();
    }
    return GeminiSingletonService.instance;
  }

  /**
   * Initialize with API key (called once at startup)
   */
  initialize(apiKey?: string): boolean {
    if (this.initialized && this.client) {
      return true;
    }

    // Try multiple environment variable names for compatibility
    const key = apiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.VITE_GEMINI_API_KEY;

    if (!key) {
      console.warn('[GeminiSingleton] No API key found - Gemini AI will not be available');
      return false;
    }

    try {
      this.apiKey = key;
      this.client = new GoogleGenAI({ apiKey: key });
      this.initialized = true;
      console.log('[GeminiSingleton] ✓ Gemini AI client initialized (singleton)');
      return true;
    } catch (error) {
      console.error('[GeminiSingleton] Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Get the Gemini client (lazy initialization)
   */
  getClient(): GoogleGenAI | null {
    if (!this.initialized) {
      this.initialize();
    }
    return this.client;
  }

  /**
   * Check if client is available
   */
  isAvailable(): boolean {
    return this.initialized && this.client !== null;
  }

  /**
   * Configure retry settings
   */
  setRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config };
  }

  /**
   * Get current retry configuration
   */
  getRetryConfig(): RetryConfig {
    return { ...this.retryConfig };
  }

  /**
   * Generate content with automatic retry on transient errors
   */
  async generateContentWithRetry(options: {
    model: string;
    contents: string;
    config?: {
      temperature?: number;
      maxOutputTokens?: number;
    };
  }): Promise<{ text: string; retryCount: number }> {
    const client = this.getClient();
    if (!client) {
      throw new Error('Gemini AI client not initialized');
    }

    let lastError: Error | null = null;
    let retryCount = 0;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const result = await client.models.generateContent({
          model: options.model,
          contents: options.contents,
          config: options.config
        });

        return {
          text: result.text || '',
          retryCount
        };

      } catch (error: any) {
        lastError = error;
        const statusCode = error?.status || error?.statusCode || 0;

        // Check if this is a retryable error
        const isRetryable = this.retryConfig.retryableStatusCodes.includes(statusCode) ||
          error?.message?.includes('RESOURCE_EXHAUSTED') ||
          error?.message?.includes('429') ||
          error?.message?.includes('quota');

        if (!isRetryable || attempt === this.retryConfig.maxRetries) {
          // Not retryable or max retries reached
          console.warn(`[GeminiSingleton] Request failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}):`,
            error?.message || error);
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          this.retryConfig.baseDelayMs * Math.pow(2, attempt),
          this.retryConfig.maxDelayMs
        );

        retryCount++;
        console.log(`[GeminiSingleton] Rate limited (429), retrying in ${delay}ms (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1})`);

        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Unknown error during Gemini API call');
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset the singleton (for testing purposes)
   */
  static reset(): void {
    if (GeminiSingletonService.instance) {
      GeminiSingletonService.instance.client = null;
      GeminiSingletonService.instance.apiKey = null;
      GeminiSingletonService.instance.initialized = false;
      GeminiSingletonService.instance = null;
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Export singleton getter
export const getGeminiSingleton = (): GeminiSingletonService => {
  return GeminiSingletonService.getInstance();
};

// Export convenience functions
export const getGeminiClient = (): GoogleGenAI | null => {
  return GeminiSingletonService.getInstance().getClient();
};

export const isGeminiAvailable = (): boolean => {
  return GeminiSingletonService.getInstance().isAvailable();
};

export const generateContentWithRetry = async (options: {
  model: string;
  contents: string;
  config?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
}): Promise<{ text: string; retryCount: number }> => {
  return GeminiSingletonService.getInstance().generateContentWithRetry(options);
};

// Export default instance
export default GeminiSingletonService;
