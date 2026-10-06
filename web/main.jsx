import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import '../src/battle-art.css';
import '../src/world-art.css';
import '../src/combat-scene.css';
import '../src/interface-theme.css';
import '../src/battle-controls.css';
import '../src/discoveries.css';
import '../src/journey-ui.css';
import '../src/village-ui.css';
import '../src/armory-ui.css';
import '../src/native-insets.css';
import '../src/player-experience.css';
import '../src/battle-information-tools.css';
import WebGame from './WebGame.jsx';
import './safari.css';

createRoot(document.getElementById('root')).render(<StrictMode><WebGame /></StrictMode>);

// App also requests /sw.js on load; using the same URL and scope shares one worker.
// Register now because the welcome screen may outlive the window load event.
if (import.meta.env.PROD && window.isSecureContext && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
    .catch(() => { /* Online play remains available when caching is unavailable. */ });
}
