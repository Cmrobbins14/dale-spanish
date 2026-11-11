import { describe, it, expect } from 'vitest';
import {
  normalize, tokenize, soundKey, levenshtein, wordSimilarity,
  scoreAttempt, scoreOpen, outcomeFor,
} from '../../src/speech/scoring.js';
import { numberToSpanish } from '../../src/speech/numbers.js';

describe('numberToSpanish', () => {
  it.each([
    [0, 'cero'], [1, 'uno'], [11, 'once'], [16, 'dieciséis'], [21, 'veintiuno'],
    [22, 'veintidós'], [30, 'treinta'], [35, 'treinta y cinco'], [100, 'cien'],
    [101, 'ciento uno'], [500, 'quinientos'], [1000, 'mil'], [2026, 'dos mil veintiséis'],
  ])('%i → %s', (n, words) => expect(numberToSpanish(n)).toBe(words));
});

describe('normalize', () => {
  it('lowercases and strips accents and Spanish punctuation', () => {
    expect(normalize('¿Cómo estás?')).toBe('como estas');
    expect(normalize('¡Mucho gusto!')).toBe('mucho gusto');
    expect(normalize('Él   está  AQUÍ.')).toBe('el esta aqui');
  });
  it('turns ñ into n so años/anos match', () => {
    expect(normalize('años')).toBe('anos');
  });
  it('converts digits to Spanish words', () => {
    expect(normalize('Tengo 11 años')).toBe('tengo once anos');
    expect(normalize('1 2 3')).toBe('uno dos tres');
  });
  it('converts clock times', () => {
    expect(normalize('Son las 3:30')).toBe('son las tres treinta');
    expect(normalize('a las 7:00')).toBe('a las siete');
  });
  it('handles empty and odd input', () => {
    expect(normalize('')).toBe('');
    expect(normalize(null)).toBe('');
    expect(tokenize('  ¿?  ')).toEqual([]);
  });
});

describe('word similarity', () => {
  it('levenshtein basics', () => {
    expect(levenshtein('gato', 'gato')).toBe(0);
    expect(levenshtein('gato', 'pato')).toBe(1);
    expect(levenshtein('', 'abc')).toBe(3);
  });
  it('treats sound-alike spellings as the same', () => {
    expect(soundKey('hola')).toBe(soundKey('ola'));
    expect(soundKey('vaca')).toBe(soundKey('baca'));
    expect(soundKey('llamo')).toBe(soundKey('yamo'));
    expect(wordSimilarity('hola', 'ola')).toBe(1);
  });
  it('keeps "ch" when removing silent h', () => {
    expect(soundKey('mucho')).toBe('mucho');
  });
  it('gives aliases a passing-but-polish score', () => {
    expect(wordSimilarity('si', 'see')).toBeGreaterThanOrEqual(0.9);
    expect(wordSimilarity('yo', 'jo')).toBeGreaterThanOrEqual(0.9);
  });
  it('scores unrelated words low', () => {
    expect(wordSimilarity('fútbol', 'pizza')).toBeLessThan(0.4);
  });
});

describe('scoreAttempt', () => {
  it('exact match is great', () => {
    const r = scoreAttempt('¿Cómo estás?', ['cómo estás']);
    expect(r.outcome).toBe('great');
    expect(r.score).toBe(1);
    expect(r.words.every((w) => w.matched)).toBe(true);
  });

  it('accent-free and capitalized input still matches', () => {
    expect(scoreAttempt('Buenos días', ['BUENOS DIAS']).outcome).toBe('great');
  });

  it('digits from the recognizer match number words', () => {
    expect(scoreAttempt('Tengo once años', ['tengo 11 años']).outcome).toBe('great');
    expect(scoreAttempt('uno, dos, tres, cuatro, cinco', ['1 2 3 4 5']).outcome).toBe('great');
  });

  it('homophones count: hola/ola, sí/si', () => {
    expect(scoreAttempt('Hola', ['ola']).outcome).toBe('great');
    expect(scoreAttempt('Sí', ['si']).outcome).toBe('great');
  });

  it('accent-flavored near misses still count', () => {
    const r = scoreAttempt('Me gusta el fútbol', ['me gusta el futbal']);
    expect(['great', 'good']).toContain(r.outcome);
  });

  it('partial phrase is "good" with the missing word not matched', () => {
    const r = scoreAttempt('Quiero un taco, por favor', ['quiero un taco']);
    expect(r.outcome).toBe('good');
    const favor = r.words.find((w) => w.text.startsWith('favor'));
    expect(favor.matched).toBe(false);
  });

  it('missing only a tiny word stays positive', () => {
    expect(scoreAttempt('Me llamo Leo', ['llamo leo']).outcome).not.toBe('notyet');
  });

  it('unrelated speech is "not yet"', () => {
    expect(scoreAttempt('¿Quieres jugar al fútbol?', ['pizza con queso']).outcome).toBe('notyet');
    expect(scoreAttempt('Buenos días', ['']).outcome).toBe('notyet');
    expect(scoreAttempt('Buenos días', []).outcome).toBe('notyet');
  });

  it('extra words around the phrase are forgiven', () => {
    expect(scoreAttempt('Mucho gusto', ['eh mucho gusto amigo']).outcome).toBe('great');
  });

  it('uses the best of several alternatives', () => {
    const r = scoreAttempt('Tengo hambre', ['tango hombre', 'tengo hambre']);
    expect(r.score).toBe(1);
    expect(r.heard).toBe('tengo hambre');
  });

  it('word order matters: shuffled words are not all matched', () => {
    const r = scoreAttempt('uno dos tres cuatro', ['cuatro tres dos uno']);
    expect(r.score).toBeLessThan(0.55);
  });

  it('flags words to polish on a passing attempt', () => {
    // "bastebol" is close enough to count, but not close enough to be perfect.
    const r = scoreAttempt('Me gusta el básquetbol', ['me gusta el bastebol']);
    expect(r.outcome).not.toBe('notyet');
    expect(r.words.some((w) => w.polish)).toBe(true);
  });

  it('gentle leniency accepts a weaker attempt than standard', () => {
    const s = 0.5;
    expect(outcomeFor(s, 'standard')).toBe('notyet');
    expect(outcomeFor(s, 'gentle')).toBe('good');
  });

  it('keeps display words with accents and punctuation', () => {
    const r = scoreAttempt('¿Cómo estás?', ['como estas']);
    expect(r.words.map((w) => w.text)).toEqual(['¿Cómo', 'estás?']);
  });
});

describe('scoreOpen (answer on your own)', () => {
  const nameQ = ['me llamo {name}', 'soy {name}', 'mi nombre es {name}', '{name}'];

  it('accepts "me llamo" + any name and captures it', () => {
    const r = scoreOpen(['me llamo Mateo'], nameQ);
    expect(r.outcome).toBe('great');
    expect(r.values.name).toBe('Mateo');
  });

  it('accepts just a name', () => {
    const r = scoreOpen(['Diego'], nameQ);
    expect(r.outcome).toBe('great');
    expect(r.values.name).toBe('Diego');
  });

  it('number slot accepts digits or words', () => {
    const q = ['tengo {number} años', '{number} años', '{number}'];
    expect(scoreOpen(['tengo 11 años'], q).values.number).toBe('once');
    expect(scoreOpen(['tengo once años'], q).outcome).toBe('great');
    expect(scoreOpen(['once'], q).outcome).toBe('great');
  });

  it('number slot rejects non-numbers', () => {
    const r = scoreOpen(['tengo perro'], ['tengo {number} años']);
    expect(r.outcome).toBe('notyet');
  });

  it('typed list slot matches a listed option fuzzily', () => {
    const slots = { food: ['la pizza', 'los tacos', 'las quesadillas'] };
    const r = scoreOpen(['me gusta la piza'], ['me gusta {food}'], { slots });
    expect(r.outcome).toBe('great');
    expect(r.values.food).toBe('la pizza');
  });

  it('untyped slot accepts any noun', () => {
    const r = scoreOpen(['me gusta el ajedrez'], ['me gusta {any}']);
    expect(r.outcome).toBe('great');
  });

  it('unrelated speech does not fit a frame', () => {
    const r = scoreOpen(['buenas noches'], ['tengo {number} años']);
    expect(r.outcome).toBe('notyet');
  });

  it('frame without a filler is partial, not great', () => {
    const r = scoreOpen(['me gusta'], ['me gusta {any}']);
    expect(r.outcome).not.toBe('great');
  });
});
