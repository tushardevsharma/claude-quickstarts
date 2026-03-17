/**
 * SentenceSplitter: Buffers streaming Claude tokens and emits complete sentences
 * for TTS processing. Key innovation for low-latency pipeline.
 */

const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'vs', 'etc',
  'i.e', 'e.g', 'u.s', 'u.k', 'u.s.a', 'a.m', 'p.m', 'fig',
  'approx', 'dept', 'est', 'govt', 'inc', 'corp', 'ltd', 'co',
  'st', 'ave', 'blvd', 'apt'
]);

const SENTENCE_ENDERS = /[.!?]\s+/g;
const MIN_CHUNK_LENGTH = 20;
const MAX_CHUNK_LENGTH = 200;

export class SentenceSplitter {
  constructor() {
    this.buffer = '';
    this.onSentence = null; // Callback: (sentence: string) => void
  }

  /**
   * Ingest a token from Claude's streaming output.
   * Returns a sentence if one was completed, or null if still buffering.
   */
  ingest(token) {
    this.buffer += token;
    return this._tryExtract();
  }

  /**
   * Called when Claude finishes streaming. Emits remaining buffer.
   */
  flush() {
    const remaining = this.buffer.trim();
    this.buffer = '';
    if (remaining.length > 0) {
      return remaining;
    }
    return null;
  }

  reset() {
    this.buffer = '';
  }

  _tryExtract() {
    // Don't emit if buffer is too short
    if (this.buffer.length < MIN_CHUNK_LENGTH) {
      return null;
    }

    // Check for code blocks - skip TTS for code
    if (this.buffer.includes('```')) {
      return null;
    }

    // Find all sentence-ending positions
    SENTENCE_ENDERS.lastIndex = 0;
    let match;
    let lastValidSplit = -1;

    while ((match = SENTENCE_ENDERS.exec(this.buffer)) !== null) {
      const splitPos = match.index + 1;
      const beforeSplit = this.buffer.slice(0, splitPos).trim().toLowerCase();

      // Check if this is an abbreviation (word before period is in abbreviation list)
      const wordsBeforePeriod = beforeSplit.split(/\s+/);
      const lastWord = wordsBeforePeriod[wordsBeforePeriod.length - 1]
        .replace(/[^a-z.]/g, '');

      if (ABBREVIATIONS.has(lastWord.replace(/\.$/, ''))) {
        continue; // Skip abbreviation periods
      }

      // Check for numbered list patterns (e.g., "1. First item")
      if (/^\d+$/.test(wordsBeforePeriod[wordsBeforePeriod.length - 1])) {
        continue;
      }

      lastValidSplit = splitPos;
    }

    if (lastValidSplit > 0) {
      const sentence = this.buffer.slice(0, lastValidSplit).trim();
      this.buffer = this.buffer.slice(lastValidSplit).trim();
      return sentence;
    }

    // Force split if buffer is very long (no sentence ender found)
    if (this.buffer.length > MAX_CHUNK_LENGTH) {
      // Try to split at comma or conjunction
      const commaPos = this.buffer.lastIndexOf(',', MAX_CHUNK_LENGTH);
      const andPos = this.buffer.lastIndexOf(' and ', MAX_CHUNK_LENGTH);
      const butPos = this.buffer.lastIndexOf(' but ', MAX_CHUNK_LENGTH);
      const splitPos = Math.max(commaPos, andPos, butPos);

      if (splitPos > MIN_CHUNK_LENGTH) {
        const chunk = this.buffer.slice(0, splitPos + 1).trim();
        this.buffer = this.buffer.slice(splitPos + 1).trim();
        return chunk;
      }

      // Hard split at max length
      const chunk = this.buffer.slice(0, MAX_CHUNK_LENGTH).trim();
      this.buffer = this.buffer.slice(MAX_CHUNK_LENGTH).trim();
      return chunk;
    }

    return null;
  }
}
