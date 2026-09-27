import test from 'node:test';
import assert from 'node:assert/strict';
import { installNativeInsets, usesFittedNativeViewport } from '../src/engine/nativeInsets.js';

const root = () => {
  const classes = new Set();
  return { classes, classList: {
    add: value => classes.add(value), remove: (...values) => values.forEach(value => classes.delete(value)),
    replace: (old, next) => { classes.delete(old); classes.add(next); },
  } };
};
const settle = () => new Promise(resolve => setImmediate(resolve));

test('only native APK 336+ owns the system-bar fitting; OTA web version is irrelevant', () => {
  for (const value of [null, undefined, '', '1.99.137', 'bad', 335, 335.9]) assert.equal(usesFittedNativeViewport(value), false);
  for (const value of [336, '336', 337]) assert.equal(usesFittedNativeViewport(value), true);
});
for (const code of [334, 335, 336]) test(`native ${code} chooses correct safe-area policy`, async () => {
  const element = root();
  const cleanup = installNativeInsets(element, { native: true, readVersionCode: async () => ({ versionCode: String(code) }) });
  assert.ok(element.classes.has('native-legacy-insets'));
  await settle();
  assert.deepEqual([...element.classes], [code >= 336 ? 'native-fitted-insets' : 'native-legacy-insets']);
  cleanup(); assert.equal(element.classes.size, 0);
});
test('bridge failure keeps fallback rather than exposing controls to system buttons', async () => {
  const element = root(); installNativeInsets(element, { native: true, readVersionCode: async () => { throw Error('offline bridge'); } });
  await settle(); assert.ok(element.classes.has('native-legacy-insets'));
});
test('unmounted startup never applies late version result', async () => {
  const element = root();
  const cleanup = installNativeInsets(element, { native: true, readVersionCode: async () => ({ versionCode: 336 }) });
  cleanup(); await settle(); assert.equal(element.classes.size, 0);
});
test('web browsers do not query Android or get fallback margins', async () => {
  const element = root();
  installNativeInsets(element, { native: false, readVersionCode: () => { assert.fail('native call from web'); } });
  await settle(); assert.equal(element.classes.size, 0);
});
