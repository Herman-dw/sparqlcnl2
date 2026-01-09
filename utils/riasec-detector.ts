/**
 * Centrale RIASEC Detector
 * ========================
 * Single source of truth voor het detecteren van RIASEC/Holland-gerelateerde vragen.
 *
 * RIASEC (Holland-codes) zijn persoonlijkheidstypen voor beroepskeuze:
 * - R (Realistic): Praktisch werk
 * - I (Investigative): Onderzoekend werk
 * - A (Artistic): Creatief werk
 * - S (Social): Sociaal werk
 * - E (Enterprising): Ondernemend werk
 * - C (Conventional): Administratief werk
 */

/**
 * Patterns for detecting RIASEC-related questions
 */
const RIASEC_PATTERNS = [
  // Direct mentions
  /\briasec\b/i,
  /\bholland\s*code\b/i,
  /\bholland\s*type\b/i,
  /\bholland[\s\-]*code\b/i,

  // RIASEC codes
  /\briasec[\s\-:]*[riasec]\b/i,
  /\btype\s+[riasec]\b/i,
  /\b[riasec][\s\-]type\b/i,
  /\b[riasec][\s\-]profiel\b/i,

  // Holland-related variants
  /\bholland\s*typologie\b/i,
  /\bholland\s*model\b/i,
  /\bholland\s*theorie\b/i,

  // Letter references in context
  /\b(letter|code|type)\s+[riasec]\b/i,
  /\b[riasec]\s+(letter|code)\b/i,

  // Questions about RIASEC relationships
  /\brelatie\s+(hebben\s+)?met\s+[riasec]\b/i,
  /\b[riasec]\s+hebben\b/i,
];

/**
 * Check if text contains RIASEC-related keywords
 * @param {string} text - Text to check
 * @returns {boolean} - True if RIASEC-related
 */
function isRiasecQuestion(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const normalized = text.toLowerCase().trim();

  // Check against all patterns
  return RIASEC_PATTERNS.some(pattern => pattern.test(normalized));
}

/**
 * Extract RIASEC letter from text (R, I, A, S, E, or C)
 * @param {string} text - Text to extract from
 * @returns {string|null} - Extracted RIASEC letter or null
 */
function extractRiasecLetter(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const normalized = text.toLowerCase();

  // Look for explicit RIASEC letter mentions
  const letterMatch = normalized.match(/\b([riasec])\b/i);
  if (letterMatch) {
    return letterMatch[1].toUpperCase();
  }

  return null;
}

/**
 * Get human-readable name for RIASEC letter
 * @param {string} letter - RIASEC letter (R, I, A, S, E, C)
 * @returns {string} - Dutch name
 */
function getRiasecName(letter) {
  const names = {
    'R': 'Realistisch (Realistic)',
    'I': 'Onderzoekend (Investigative)',
    'A': 'Artistiek (Artistic)',
    'S': 'Sociaal (Social)',
    'E': 'Ondernemend (Enterprising)',
    'C': 'Conventioneel (Conventional)'
  };

  return names[letter?.toUpperCase()] || 'Onbekend';
}

/**
 * Check multiple text fields for RIASEC
 * @param {...string} texts - Multiple text fields to check
 * @returns {boolean} - True if any field is RIASEC-related
 */
function isRiasecInAnyField(...texts) {
  return texts.some(text => isRiasecQuestion(text));
}

export {
  isRiasecQuestion,
  extractRiasecLetter,
  getRiasecName,
  isRiasecInAnyField,
  RIASEC_PATTERNS
};
