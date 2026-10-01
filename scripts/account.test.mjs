import test from 'node:test';
import assert from 'node:assert/strict';
import { accountConfigured, accountError, createAccountManager } from '../src/engine/accountEngine.js';

test('unconfigured account never loads SDK and never pretends to sign in', async () => {
  const manager = createAccountManager({ configured: false, getAdapter: () => { throw new Error('must not load'); } });
  await manager.init();
  assert.equal(await manager.run('signIn'), false);
  assert.equal(manager.getState().user, null);
  assert.equal(manager.getState().available, false);
  assert.match(manager.getState().message, /준비 중/);
});
test('configuration requires explicit enable and complete public config', () => {
  assert.equal(accountConfigured({ enabled: true, firebase: {} }), false);
  const firebase = { apiKey: 'key', authDomain: 'project.firebaseapp.com', projectId: 'project', appId: '1:123:web:123' };
  assert.equal(accountConfigured({ enabled: false, firebase }), false);
  assert.equal(accountConfigured({ enabled: true, firebase }), true);
});
test('sign in is single-flight, strips tokens and does not touch game storage', async () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('save read'); }, setItem() { throw new Error('save write'); }, clear() { throw new Error('save erase'); } };
  let calls = 0; let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const manager = createAccountManager({ configured: true, getAdapter: async () => ({ current: async () => null, signIn: async () => { calls++; return pending; }, signOut: async () => {}, delete: async () => {} }) });
  try {
    await manager.init();
    const first = manager.run('signIn');
    assert.equal(await manager.run('signIn'), false);
    finish({ uid: 'u1', displayName: '기사', email: 'test@example.com', idToken: 'secret' });
    assert.equal(await first, true); assert.equal(calls, 1);
    assert.deepEqual(manager.getState().user, { uid: 'u1', displayName: '기사', email: 'test@example.com' });
    assert.equal(await manager.run('signOut'), true);
    assert.equal(manager.getState().user, null);
    await manager.run('signIn');
    assert.equal(await manager.run('delete'), true);
    assert.equal(manager.getState().user, null);
  } finally { if (original === undefined) delete globalThis.localStorage; else globalThis.localStorage = original; }
});
test('SDK failure/cancel does not invent login or erase existing account', async () => {
  const manager = createAccountManager({ configured: true, getAdapter: async () => ({ current: async () => ({ uid: 'u1' }), delete: async () => { throw { code: 'auth/requires-recent-login' }; }, signOut: async () => { throw { code: 'auth/network-request-failed' }; } }) });
  await manager.init();
  assert.equal(await manager.run('delete'), false);
  assert.equal(manager.getState().user.uid, 'u1'); assert.match(manager.getState().message, /같은 Google/);
  assert.equal(await manager.run('signOut'), false);
  assert.equal(manager.getState().user.uid, 'u1'); assert.equal(manager.getState().busy, false);
  assert.match(accountError({ code: 'auth/popup-closed-by-user' }), /취소/);
  assert.match(accountError({ code: 'auth/popup-blocked' }), /팝업/);
  assert.doesNotMatch(accountError({ message: 'secret token email' }), /secret|token|email/);
});
test('failed native config stays guest and a later init can retry', async () => {
  let calls = 0;
  const manager = createAccountManager({ configured: true, getAdapter: async () => { calls++; throw { code: 'auth/not-configured' }; } });
  await manager.init(); await manager.init();
  assert.equal(calls, 2); assert.equal(manager.getState().ready, true); assert.equal(manager.getState().user, null);
});
test('transient initialization failure can recover without restarting the game', async () => {
  let calls = 0;
  const manager = createAccountManager({ configured: true, getAdapter: async () => {
    if (++calls === 1) throw { code: 'auth/network-request-failed' };
    return { current: async () => null, signIn: async () => ({ uid: 'recovered' }) };
  } });
  await manager.init();
  assert.equal(manager.getState().available, true);
  assert.equal(await manager.run('signIn'), true);
  assert.equal(manager.getState().user.uid, 'recovered');
});
