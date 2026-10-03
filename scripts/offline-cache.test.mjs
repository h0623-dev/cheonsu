import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../public/', import.meta.url);
const source = fs.readFileSync(new URL('service-worker.js', root), 'utf8');
function worker({ cached, offline = false, quota = false } = {}) {
  const handlers = {}, removed = [], pending = [], shell = [];
  let fetches = 0;
  const self = { location: { origin: 'https://game.test' }, skipWaiting() {}, clients: { claim() {} },
    addEventListener: (type, handler) => { handlers[type] = handler; } };
  const context = vm.createContext({ self, URL, Response,
    fetch: async () => { fetches++; if (offline) throw Error('offline'); return new Response('network'); },
    caches: {
      match: async () => cached,
      keys: async () => ['other-app-cache', 'cheonsu-old', vm.runInContext('APP_SHELL_CACHE', context)],
      delete: async key => { removed.push(key); },
      open: async () => ({ addAll: async files => shell.push(...files), put: async () => { if (quota) throw Error('quota'); } }),
    },
    importScripts: (...paths) => paths.forEach(path => vm.runInContext(fs.readFileSync(new URL(path.slice(1), root), 'utf8'), context)),
  });
  vm.runInContext(source, context);
  return { handlers, removed, pending, shell, get fetches() { return fetches; },
    event: { waitUntil: value => pending.push(value) },
    async request(path = '/audio/orchestra-v1/piano-60.mp3', mode = 'cors') {
      let response;
      handlers.fetch({ request: { url: `https://game.test${path}`, method: 'GET', mode },
        waitUntil: value => pending.push(value), respondWith: value => { response = value; } });
      const result = await response;
      await Promise.all(pending);
      return result;
    },
  };
}

test('offline cached music makes no network request, missing music returns an error response', async () => {
  const cached = worker({ offline: true, cached: new Response('sample') });
  assert.equal(await (await cached.request()).text(), 'sample');
  assert.equal(cached.fetches, 0);
  const missing = worker({ offline: true });
  assert.equal((await missing.request()).type, 'error');
});

test('quota errors do not reject successful game requests and cleanup preserves other apps', async () => {
  const state = worker({ quota: true });
  assert.equal(await (await state.request()).text(), 'network');
  state.handlers.activate(state.event);
  await Promise.all(state.pending);
  assert.deepEqual(state.removed, ['cheonsu-old']);
});

test('offline shell includes every music sample and web/app versions agree', async () => {
  const state = worker();
  state.handlers.install(state.event);
  await Promise.all(state.pending);
  const audio = state.shell.filter(path => path.endsWith('.mp3'));
  assert.equal(audio.length, 72);
  for (const path of audio) assert.ok(fs.existsSync(new URL(path.slice(1), root)), path);
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.webmanifest', root)));
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', root)));
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.orientation, 'any');
});
