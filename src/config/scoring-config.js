// ============================================================
//  SPEECH SCORING KNOBS — tune these to make scoring easier/harder.
//  Scores run from 0 (nothing matched) to 1 (every word matched).
// ============================================================

export const SCORING = {
  standard: {
    great: 0.85, // at or above → "¡Excelente!"
    good: 0.55, // at or above → "¡Muy bien!" (counts as correct, gentle polish hint)
    wordMatch: 0.68, // how close one heard word must be to the target word (0–1)
    shortWordMatch: 0.5, // extra tolerance for words of 1–3 letters (sí, yo, el)
    polishBelow: 0.86, // a matched word below this similarity gets a "polish" highlight
  },
  // "Gentle" leniency, chosen in the grown-up settings.
  gentle: {
    great: 0.8,
    good: 0.45,
    wordMatch: 0.6,
    shortWordMatch: 0.4,
    polishBelow: 0.8,
  },
};

// After this many "not yet" tries on one item, offer "Keep going".
export const MAX_TRIES_BEFORE_SKIP = 2;
