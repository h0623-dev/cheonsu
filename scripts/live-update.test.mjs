import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { createPatchManager, verifyPatchManifest, AUTO_UPDATE_KEY } from '../src/engine/liveUpdateEngine.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const trust = { publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(), repository: 'h0623-dev/cheonsu', minNativeVersion: 335, manifestUrl: 'https://raw.githubusercontent.com/h0623-dev/cheonsu/updates/latest.json' };
const sha256 = 'a'.repeat(64);
const base = { schema: 1, version: '1.99.137', bundleId: `1.99.137-${sha256.slice(0, 12)}`, sha256,
  url: 'https://github.com/h0623-dev/cheonsu/releases/download/v1.99.137/cheonsu_1.99.137_ota.zip',
  apkUrl: 'https://github.com/h0623-dev/cheonsu/releases/download/v1.99.137/cheonsu_1.99.137_update_debug.apk',
  size: 200000000, minNativeVersion: 335, maxNativeVersion: 336, bundleSignature: 'a'.repeat(344), notes: ['게임 패치'] };
function envelope(patch = base) {
  const bytes = Buffer.from(JSON.stringify(patch));
  return { payload: bytes.toString('base64'), signature: sign('RSA-SHA256', bytes, privateKey).toString('base64') };
}
function fixture({ patch = base, stored = {}, overrides = {}, fetcher } = {}) {
  const calls = [];
  const data = new Map([['cheonsu_v01_save', '{"version":"1.99.135","gold":99}'], ...Object.entries(stored)]);
  let pending = null;
  const native = {
    ready: async () => { calls.push('ready'); return {}; },
    getVersionCode: async () => ({ versionCode: '335' }),
    getBlockedBundles: async () => ({ bundleIds: [] }),
    getDownloadedBundles: async () => ({ bundleIds: [] }),
    getNextBundle: async () => ({ bundleId: pending }),
    addListener: async (name, handler) => { calls.push(name); handler({ bundleId: patch.bundleId, progress: 0.51 }); return { remove: async () => calls.push('remove') }; },
    downloadBundle: async args => { calls.push(['download', args]); },
    setNextBundle: async ({ bundleId }) => { pending = bundleId; calls.push('setNext'); },
    reload: async () => { calls.push('reload'); },
    ...overrides,
  };
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const manager = createPatchManager({ native, version: '1.99.136', trust, storage,
    fetcher: fetcher || (async () => { calls.push('fetch'); return { ok: true, text: async () => JSON.stringify(envelope(patch)) }; }), now: () => 1 });
  return { manager, calls, data, native };
}

test('valid signed metadata is verified without losing Korean notes', async () => assert.deepEqual(await verifyPatchManifest(envelope(), trust), base));
test('tampered manifest is rejected', async () => {
  const broken = envelope(); broken.payload = Buffer.from(JSON.stringify({ ...base, version: '9.9.9' })).toString('base64');
  await assert.rejects(verifyPatchManifest(broken, trust));
});
for (const [name, value] of Object.entries({ schema: 2, version: '1.2.3-beta', sha256: 'x', bundleId: '../public',
  url: 'https://evil.example/patch.zip', apkUrl: 'javascript:alert(1)', size: 999999999,
  minNativeVersion: 0, maxNativeVersion: 334, bundleSignature: '', notes: ['x'.repeat(401)] })) {
  test(`signed but invalid ${name} is rejected`, async () => assert.rejects(verifyPatchManifest(envelope({ ...base, [name]: value }), trust)));
}
test('oversized envelope rejected', async () => assert.rejects(verifyPatchManifest({ payload: 'x'.repeat(25000), signature: 'a' }, trust)));
test('bundle signatures use RSA SHA256 over file bytes, matching native verifier', () => {
  const bytes = Buffer.from('zip-file-fixture');
  const signature = sign('RSA-SHA256', bytes, privateKey);
  assert.equal(verify('RSA-SHA256', bytes, publicKey, signature), true);
  assert.equal(verify('RSA-SHA256', Buffer.from('tampered'), publicKey, signature), false);
});
test('auto update downloads, verifies, queues but never reloads or changes saves', async () => {
  const { manager, calls, data } = fixture();
  const originalSave = data.get('cheonsu_v01_save');
  await manager.check();
  assert.equal(manager.getState().status, 'pending');
  assert.equal(manager.getState().progress, 100);
  assert.equal(calls.includes('reload'), false);
  assert.equal(calls.filter(item => item === 'ready').length, 1);
  assert.equal(calls.find(Array.isArray)[1].signature, base.bundleSignature);
  assert.equal(data.get('cheonsu_v01_save'), originalSave);
  await manager.applyAtTitle(); assert.equal(calls.includes('reload'), true);
});
test('concurrent checks are deduplicated and auto checks rate limited', async () => {
  const { manager, calls } = fixture();
  await Promise.all([manager.check(), manager.check({ manual: true })]);
  await manager.check();
  assert.equal(calls.filter(item => item === 'fetch').length, 1);
  await manager.check({ manual: true });
  assert.equal(calls.filter(Array.isArray).length, 1);
});
test('disabled auto download is persisted but manual check remains available', async () => {
  const { manager, calls, data } = fixture({ stored: { [AUTO_UPDATE_KEY]: 'false' } });
  await manager.check(); assert.equal(calls.length, 0);
  await manager.check({ manual: true }); assert.equal(manager.getState().status, 'pending');
  manager.setEnabled(false); assert.equal(data.get(AUTO_UPDATE_KEY), 'false');
});
test('native mismatch offers APK without downloading web bundle', async () => {
  const { manager, calls } = fixture({ overrides: { getVersionCode: async () => ({ versionCode: '334' }) } });
  await manager.check(); assert.equal(manager.getState().status, 'native'); assert.equal(calls.some(Array.isArray), false);
});
test('a failed bundle is not downloaded again', async () => {
  const { manager, calls } = fixture({ overrides: { getBlockedBundles: async () => ({ bundleIds: [base.bundleId] }) } });
  await manager.check(); assert.equal(manager.getState().status, 'rollback'); assert.equal(calls.includes('setNext'), false);
});
test('existing validated bundle can be queued without downloading again', async () => {
  const { manager, calls } = fixture({ overrides: { getDownloadedBundles: async () => ({ bundleIds: [base.bundleId] }) } });
  await manager.check(); assert.equal(manager.getState().status, 'pending'); assert.equal(calls.some(Array.isArray), false);
});
test('offline failure does not change next bundle or saves and can be retried', async () => {
  let fail = true;
  const { manager, calls, data } = fixture({ fetcher: async () => { if (fail) throw new Error('offline'); return { ok: true, text: async () => JSON.stringify(envelope()) }; } });
  const before = [...data]; await manager.check();
  assert.equal(manager.getState().status, 'error'); assert.equal(calls.includes('setNext'), false); assert.deepEqual([...data], before);
  fail = false; await manager.check({ manual: true }); assert.equal(manager.getState().status, 'pending');
});
test('native download or signature failure never activates bundle', async () => {
  const { manager, calls } = fixture({ overrides: { downloadBundle: async () => { throw new Error('signature'); } } });
  await manager.check(); assert.equal(manager.getState().status, 'error'); assert.equal(calls.includes('setNext'), false); assert.equal(calls.includes('remove'), true);
});
test('current and older signed versions never trigger a downgrade', async () => {
  const { manager, calls } = fixture();
  const older = createPatchManager({ native: fixture().native, version: '1.99.138', trust, storage: new Map(), fetcher: async () => ({ ok: true, text: async () => JSON.stringify(envelope()) }) });
  await older.check(); assert.equal(older.getState().status, 'current');
  assert.equal(calls.length, 0); assert.equal(manager.getState().status, 'idle');
});
test('web runtime never invokes native download or checks the remote feed', async () => {
  const manager = createPatchManager({ native: null, version: '1.99.136', trust, storage: {}, fetcher: () => { throw new Error('must not run'); } });
  await manager.ready(); await manager.check({ manual: true }); assert.equal(manager.getState().status, 'web');
});
