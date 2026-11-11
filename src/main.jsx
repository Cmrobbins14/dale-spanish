import { render } from 'preact';
// Fonts are bundled with the app (no requests to font services).
// Latin subset only (covers Spanish: á é í ó ú ñ ¿ ¡).
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './app/App.jsx';
import { startApp } from './data/store.js';
import { checkWorker } from './services/worker.js';
import { pickVoices, unlockAudio } from './speech/tts.js';
import { unlockSfx } from './ui/sfx.js';
import { registerServiceWorker } from './app/pwa.js';

render(<App />, document.getElementById('app'));
startApp();
checkWorker();
pickVoices();

// iOS only allows sound after a tap: unlock speech + effects on the first one.
window.addEventListener('pointerdown', () => { unlockAudio(); unlockSfx(); }, { once: true, capture: true });

registerServiceWorker();
