// Spanish number words.
// Speech recognizers often return digits ("tengo 11 años") even when the
// learner said the words. Scoring converts digits to words so both match.

const UNDER_30 = [
  'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete',
  'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés',
  'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
];
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

/** 11 → "once", 35 → "treinta y cinco", 2026 → "dos mil veintiséis" */
export function numberToSpanish(n) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n) || n < 0) return String(n);
  if (n < 30) return UNDER_30[n];
  if (n < 100) {
    const t = Math.floor(n / 10), u = n % 10;
    return u ? `${TENS[t]} y ${UNDER_30[u]}` : TENS[t];
  }
  if (n === 100) return 'cien';
  if (n < 1000) {
    const h = Math.floor(n / 100), r = n % 100;
    return r ? `${HUNDREDS[h]} ${numberToSpanish(r)}` : HUNDREDS[h];
  }
  if (n < 1_000_000) {
    const th = Math.floor(n / 1000), r = n % 1000;
    const head = th === 1 ? 'mil' : `${numberToSpanish(th)} mil`;
    return r ? `${head} ${numberToSpanish(r)}` : head;
  }
  return String(n);
}

/** Set of accent-free number words 0–100, used by the {number} answer slot. */
export const NUMBER_WORDS = new Set(
  Array.from({ length: 101 }, (_, i) => numberToSpanish(i))
    .flatMap((w) => w.split(' '))
    .filter((w) => w !== 'y') // "treinta y cinco": the "y" alone is not a number
    .map((w) => w.normalize('NFD').replace(/[̀-ͯ]/g, ''))
    .concat(['un', 'una', 'veintiun'])
);
