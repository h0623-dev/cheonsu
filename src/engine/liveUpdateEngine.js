import { compareVersions } from './updateEngine.js';

export const AUTO_UPDATE_KEY = 'cheonsu_auto_patch';
const VERSION = /^\d{1,5}\.\d{1,5}\.\d{1,5}$/;
const decode = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

export async function verifyPatchManifest(envelope, trust, subtle = globalThis.crypto.subtle) {
  if (!envelope || typeof envelope.payload !== 'string' || envelope.payload.length > 24000 ||
      typeof envelope.signature !== 'string' || envelope.signature.length > 1024) {
    throw new Error('패치 안내 형식이 올바르지 않습니다.');
  }
  const keyBytes = decode(trust.publicKey.replace(/-----[^-]+-----|\s/g, ''));
  const key = await subtle.importKey('spki', keyBytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const bytes = decode(envelope.payload);
  if (!await subtle.verify('RSASSA-PKCS1-v1_5', key, decode(envelope.signature), bytes)) {
    throw new Error('패치 서명을 확인할 수 없습니다. 현재 버전을 유지합니다.');
  }
  const patch = JSON.parse(new TextDecoder().decode(bytes));
  const releaseRoot = `https://github.com/${trust.repository}/releases/download/v${patch.version}/`;
  if (patch.schema !== 1 || !VERSION.test(patch.version) || !/^[a-f0-9]{64}$/.test(patch.sha256) ||
      patch.bundleId !== `${patch.version}-${patch.sha256.slice(0, 12)}` ||
      patch.url !== `${releaseRoot}cheonsu_${patch.version}_ota.zip` ||
      patch.apkUrl !== `${releaseRoot}cheonsu_${patch.version}_update_debug.apk` ||
      !Number.isSafeInteger(patch.size) || patch.size <= 0 || patch.size > 512 * 1024 * 1024 ||
      !Number.isSafeInteger(patch.minNativeVersion) || patch.minNativeVersion < trust.minNativeVersion ||
      !Number.isSafeInteger(patch.maxNativeVersion) || patch.maxNativeVersion < patch.minNativeVersion ||
      typeof patch.bundleSignature !== 'string' || !/^[A-Za-z0-9+/=]{256,1024}$/.test(patch.bundleSignature) ||
      !Array.isArray(patch.notes) || patch.notes.length > 8 || patch.notes.some(note => typeof note !== 'string' || note.length > 400)) {
    throw new Error('패치 정보 또는 배포 주소가 올바르지 않습니다.');
  }
  return patch;
}

export function createPatchManager({ native, version, trust, storage, fetcher = globalThis.fetch, now = Date.now }) {
  let state = { status: native ? 'idle' : 'web', message: native ? '자동 패치 확인 대기' : '자동 패치는 Android 앱에서 제공됩니다.', progress: 0, latest: null };
  let enabled = true;
  try { enabled = storage.getItem(AUTO_UPDATE_KEY) !== 'false'; } catch { /* Restricted storage must not block startup. */ }
  let inFlight;
  let readyPromise;
  let lastCheck = -Infinity;
  const listeners = new Set();
  const emit = (next) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener({ ...state, enabled });
  };
  const ready = () => {
    if (!native) return Promise.resolve();
    if (!readyPromise) readyPromise = (async () => {
      const result = await native.ready();
      if (result.rollback) emit({ status: 'rollback', message: '패치 실행에 문제가 있어 기본 버전으로 복구했습니다. 저장 데이터는 유지됩니다.' });
    })().catch(() => { emit({ status: 'error', message: '패치 초기화에 실패했습니다. 앱을 다시 실행해 주세요.' }); throw new Error('패치 초기화 실패'); });
    return readyPromise;
  };
  const check = ({ manual = false } = {}) => {
    if (!native || (!manual && (!enabled || now() - lastCheck < 15 * 60 * 1000))) return Promise.resolve();
    if (inFlight) return inFlight;
    lastCheck = now();
    inFlight = (async () => {
      let progressListener;
      try {
        await ready();
        emit({ status: 'checking', message: '새 패치를 확인하고 있습니다.' });
        const response = await fetcher(trust.manifestUrl, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error('패치 서버에 연결하지 못했습니다.');
        const text = await response.text();
        if (text.length > 32000) throw new Error('패치 안내 크기가 올바르지 않습니다.');
        const patch = await verifyPatchManifest(JSON.parse(text), trust);
        emit({ latest: patch });
        if (compareVersions(patch.version, version) <= 0) {
          emit({ status: 'current', message: `최신 버전 v${version}`, progress: 0 });
          return;
        }
        const { versionCode } = await native.getVersionCode();
        if (Number(versionCode) < patch.minNativeVersion || Number(versionCode) > patch.maxNativeVersion) {
          emit({ status: 'native', message: '앱 기능이 변경되어 이번 업데이트는 APK 설치가 필요합니다.' });
          return;
        }
        const blocked = await native.getBlockedBundles();
        if (blocked.bundleIds.includes(patch.bundleId)) {
          emit({ status: 'rollback', message: '실행에 실패했던 패치입니다. 수정된 새 패치를 기다리고 있습니다.' });
          return;
        }
        const { bundleId: pending } = await native.getNextBundle();
        if (pending !== patch.bundleId) {
          emit({ status: 'downloading', message: `v${patch.version} 패치 다운로드 중`, progress: 0 });
          progressListener = await native.addListener('downloadBundleProgress', (event) => {
            if (event.bundleId === patch.bundleId) emit({ progress: Math.max(0, Math.min(100, Math.round(event.progress * 100))) });
          });
          const downloaded = await native.getDownloadedBundles();
          if (!downloaded.bundleIds.includes(patch.bundleId)) await native.downloadBundle({
            artifactType: 'zip', bundleId: patch.bundleId, url: patch.url,
            checksum: patch.sha256, signature: patch.bundleSignature,
          });
          await native.setNextBundle({ bundleId: patch.bundleId });
        }
        emit({ status: 'pending', progress: 100, message: `v${patch.version} 준비 완료. 앱을 완전히 종료한 뒤 다시 열면 적용됩니다.` });
      } catch {
        // Never replace the active bundle or touch game saves after a network/signature failure.
        emit({ status: 'error', message: '패치를 받지 못했습니다. 연결과 여유 공간을 확인해 주세요. 현재 게임은 계속 이용할 수 있습니다.' });
      } finally {
        if (progressListener) await progressListener.remove().catch(() => {});
      }
    })().finally(() => { inFlight = undefined; });
    return inFlight;
  };
  return {
    ready, check,
    getState: () => ({ ...state, enabled }),
    subscribe(listener) { listeners.add(listener); listener({ ...state, enabled }); return () => listeners.delete(listener); },
    setEnabled(value) {
      enabled = Boolean(value);
      try { storage.setItem(AUTO_UPDATE_KEY, String(enabled)); } catch { /* Keep session preference even when storage is full. */ }
      emit({});
      if (enabled) { lastCheck = -Infinity; void check(); }
    },
    async applyAtTitle() {
      if (state.status !== 'pending') return;
      try { await native.reload(); } catch { emit({ status: 'error', message: '앱을 완전히 종료한 뒤 다시 열어 주세요.' }); }
    },
  };
}
