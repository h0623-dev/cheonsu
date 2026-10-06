import { StrictMode, useEffect, useState } from 'react';
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
import App from '../src/App.jsx';
import { getAudioContext } from '../src/engine/audioEngine.js';
import './safari.css';

// This entry belongs only to the web build. Android continues to use src/main.jsx.
function getStartupAvailability() {
  const missingFeatures =
    typeof window.HTMLDialogElement?.prototype.showModal !== 'function' ||
    typeof window.ResizeObserver !== 'function' ||
    typeof window.PointerEvent !== 'function' ||
    typeof Array.prototype.at !== 'function' ||
    !window.CSS?.supports?.('height', '100dvh') ||
    !window.CSS?.supports?.('selector(:has(*))');

  if (missingFeatures) {
    return '이 브라우저에서는 전투 화면을 실행할 수 없습니다. iPhone을 업데이트한 뒤 Safari에서 다시 열어 주세요. iOS 16.4 이상을 권장합니다.';
  }
  if (!window.isSecureContext) {
    return '안전한 게임 주소로 접속해 주세요. 주소가 https://로 시작해야 합니다.';
  }

  const probeKey = `cheonsu_web_storage_probe_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  try {
    const storage = window.localStorage;
    storage.setItem(probeKey, 'ready');
    const available = storage.getItem(probeKey) === 'ready';
    storage.removeItem(probeKey);
    if (!available) throw new Error('Storage is unavailable');
  } catch {
    return '현재 Safari에 진행 상황을 저장할 수 없습니다. 일반 탭에서 다시 열거나 iPhone의 저장 공간을 확보한 뒤 다시 시도해 주세요.';
  }
  return '';
}

function useWebAudio(started) {
  useEffect(() => {
    if (!started) return undefined;
    let unlocked = false;
    const resume = (gesture = false) => {
      if (document.hidden || (!gesture && !unlocked)) return;
      if (gesture) unlocked = true;
      try {
        const context = getAudioContext();
        // Safari can report "interrupted" after a phone call or switching apps.
        if (context && context.state !== 'running' && context.state !== 'closed') {
          void context.resume().catch(() => {});
        }
      } catch {
        // Audio availability must not prevent playing or preserving progress.
      }
    };
    const gesture = () => resume(true);
    const foreground = () => resume(false);
    window.addEventListener('pointerdown', gesture, { capture: true, passive: true });
    window.addEventListener('touchend', gesture, { capture: true, passive: true });
    window.addEventListener('keydown', gesture, true);
    window.addEventListener('pageshow', foreground);
    document.addEventListener('visibilitychange', foreground);
    return () => {
      window.removeEventListener('pointerdown', gesture, true);
      window.removeEventListener('touchend', gesture, true);
      window.removeEventListener('keydown', gesture, true);
      window.removeEventListener('pageshow', foreground);
      document.removeEventListener('visibilitychange', foreground);
    };
  }, [started]);
}

function WebGame() {
  const [started, setStarted] = useState(false);
  const [unavailable, setUnavailable] = useState(getStartupAvailability);
  const [online, setOnline] = useState(navigator.onLine);
  const standalone = window.navigator.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches;
  useWebAudio(started);

  useEffect(() => {
    const refresh = () => setOnline(navigator.onLine);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, []);

  const start = () => {
    const issue = getStartupAvailability();
    setUnavailable(issue);
    if (issue) return;
    try {
      const context = getAudioContext();
      if (context && context.state !== 'running' && context.state !== 'closed') {
        void context.resume().catch(() => {});
      }
    } catch { /* Sound is optional; the game can still start. */ }
    // Browser storage persistence is optional and does not replace a save backup.
    void navigator.storage?.persist?.().catch(() => {});
    setStarted(true);
  };

  if (started) return <App />;

  return (
    <main className="web-welcome" aria-labelledby="web-welcome-title">
      <img className="web-welcome-art" src="/art/journey-v1/title.webp" alt="" fetchPriority="high" />
      <section className="web-welcome-card">
        <header>
          <p className="web-welcome-eyebrow">천수 기사단의 여정</p>
          <h1 id="web-welcome-title">천수</h1>
          <p className="web-welcome-subtitle">꺼지지 않은 봉화</p>
        </header>
        <p className="web-welcome-intro">50장의 여정을 아이폰에서도.<br />기사단을 이끌고 다음 전장으로 향하세요.</p>

        {unavailable ? (
          <div className="web-start-notice" role="alert">
            <p>{unavailable}</p>
            <button type="button" onClick={() => setUnavailable(getStartupAvailability())}>다시 시도</button>
          </div>
        ) : (
          <button type="button" className="web-start-button" onClick={start}>게임 시작</button>
        )}
        {!online && <p className="web-offline-notice" role="status">인터넷 연결이 끊겼습니다. 연결 후 게임을 시작해 주세요.</p>}

        {!standalone ? (
          <details className="web-install-guide" open>
            <summary>홈 화면에 추가하기</summary>
            <ol>
              <li>이 주소를 <strong>Safari</strong>에서 엽니다.</li>
              <li><strong>공유</strong> 버튼을 누르고 <strong>홈 화면에 추가</strong>를 선택합니다.</li>
              <li><strong>추가</strong>를 누른 뒤 천수 아이콘으로 실행합니다.</li>
            </ol>
            <p>가능하면 처음 플레이하기 전에 추가해 주세요.</p>
          </details>
        ) : <p className="web-installed-note">홈 화면 앱으로 실행 중입니다.</p>}

        <div className="web-play-notes">
          <p><strong>저장 안내</strong><br />진행 상황은 현재 브라우저 또는 홈 화면 앱에 저장됩니다. 같은 실행 방법을 계속 사용해 주세요. 안드로이드와 자동으로 동기화되지 않습니다.</p>
          <p>중요한 진행 상황은 게임의 저장 관리에서 내보내기로 보관해 주세요. Safari 웹사이트 데이터를 지우면 저장도 사라질 수 있습니다.</p>
          <p>인터넷에 연결한 상태에서 플레이해 주세요.<br />iOS 16.4 이상 Safari를 권장합니다.</p>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><WebGame /></StrictMode>);

// App also requests /sw.js on load; using the same URL and scope shares one worker.
// Register now because the welcome screen may outlive the window load event.
if (import.meta.env.PROD && window.isSecureContext && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
    .catch(() => { /* Online play remains available when caching is unavailable. */ });
}
