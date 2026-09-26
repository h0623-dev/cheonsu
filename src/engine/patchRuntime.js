import { LiveUpdate } from '@capawesome/capacitor-live-update';
import { isNativeCapacitorRuntime } from './runtime.js';
import { createPatchManager } from './liveUpdateEngine.js';
import trust from '../data/updateTrust.json';
import { version } from '../../package.json';

let manager;
export function getPatchManager() {
  if (!manager) {
    let storage;
    try { storage = window.localStorage; } catch { storage = { getItem: () => null, setItem: () => {} }; }
    manager = createPatchManager({ native: isNativeCapacitorRuntime() ? LiveUpdate : null, version, trust, storage });
  }
  return manager;
}
