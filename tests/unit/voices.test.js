import { describe, it, expect } from 'vitest';
import { rankVoice } from '../../src/speech/tts.js';

// Voice lists as an iPad reports them: "Enhanced" only appears in voiceURI.
const v = (name, lang, voiceURI) => ({ name, lang, voiceURI, localService: true });
const best = (voices, want) => [...voices].sort((a, b) => rankVoice(b, want) - rankVoice(a, want))[0];

describe('voice choice', () => {
  it('prefers the downloaded Enhanced Paulina over the standard one (iPad naming)', () => {
    const voices = [
      v('Paulina', 'es-MX', 'com.apple.voice.compact.es-MX.Paulina'),
      v('Paulina', 'es-MX', 'com.apple.voice.enhanced.es-MX.Paulina'),
      v('Mónica', 'es-ES', 'com.apple.voice.compact.es-ES.Monica'),
    ];
    expect(best(voices, 'es').voiceURI).toContain('enhanced');
  });

  it('prefers Premium over Enhanced', () => {
    const voices = [
      v('Ava', 'en-US', 'com.apple.voice.enhanced.en-US.Ava'),
      v('Ava', 'en-US', 'com.apple.voice.premium.en-US.Ava'),
    ];
    expect(best(voices, 'en').voiceURI).toContain('premium');
  });

  it('still prefers Mexican Spanish over an enhanced Spain voice', () => {
    const voices = [
      v('Mónica', 'es-ES', 'com.apple.voice.enhanced.es-ES.Monica'),
      v('Paulina', 'es-MX', 'com.apple.voice.compact.es-MX.Paulina'),
    ];
    expect(best(voices, 'es').lang).toBe('es-MX');
  });

  it('never picks novelty voices', () => {
    const voices = [v('Bubbles', 'en-US', 'com.apple.speech.synthesis.voice.Bubbles'), v('Samantha', 'en-US', 'com.apple.voice.compact.en-US.Samantha')];
    expect(best(voices, 'en').name).toBe('Samantha');
  });
});
