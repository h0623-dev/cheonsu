import { useEffect, useState } from 'react';
import { getPatchManager } from './patchRuntime.js';

export function usePatchLifecycle() {
  const manager = getPatchManager();
  useEffect(() => {
    // Commit the first rendered UI before acknowledging the native rollback timer.
    const timer = setTimeout(() => { void manager.ready().then(() => manager.check()).catch(() => {}); }, 750);
    const resume = () => { if (document.visibilityState === 'visible') void manager.check(); };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume); };
  }, [manager]);
}

// Only the visible update status subscribes, never the battlefield or app root.
export function usePatchUpdates() {
  const manager = getPatchManager();
  const [state, setState] = useState(manager.getState);
  useEffect(() => manager.subscribe(setState), [manager]);
  return { ...state, manager };
}
