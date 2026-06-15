import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { isNativeCapacitorRuntime } from "./engine/runtime.js";

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    if (isNativeCapacitorRuntime()) return;

    (async () => {
      try {
        await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
        const registrations = await navigator.serviceWorker.getRegistrations();

        await Promise.all(
          registrations
            .filter((registration) => {
              const scriptUrls = [
                registration.active?.scriptURL,
                registration.installing?.scriptURL,
                registration.waiting?.scriptURL,
              ].filter(Boolean);

              return scriptUrls.some((url) => url.endsWith("/sw.js"));
            })
            .map((registration) => registration.unregister())
        );
      } catch {
        // no-op: service worker setup failure should not block the game
      }
    })();
  });
}
