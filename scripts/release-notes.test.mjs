import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateReleaseNotes } from './release-notes.mjs';
import { verifyPatchManifest } from '../src/engine/liveUpdateEngine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const currentNotes = JSON.parse(readFileSync(path.join(root, 'docs/update-notes.json'), 'utf8'));
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const trust = { repository: 'h0623-dev/cheonsu', minNativeVersion: 1,
  publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
const bundle = Buffer.from('temporary release-notes integration fixture');
const sha256 = createHash('sha256').update(bundle).digest('hex');
const releaseRoot = `https://github.com/${trust.repository}/releases/download/v${version}/`;
const base = { schema: 1, version, bundleId: `${version}-${sha256.slice(0, 12)}`, sha256,
  url: `${releaseRoot}cheonsu_${version}_ota.zip`, apkUrl: `${releaseRoot}cheonsu_${version}_update_debug.apk`,
  size: bundle.length, minNativeVersion: 1, maxNativeVersion: 1,
  bundleSignature: sign('RSA-SHA256', bundle, privateKey).toString('base64'), notes: ['패치 안내'] };
function envelope(patch) {
  const bytes = Buffer.from(JSON.stringify(patch));
  return { payload: bytes.toString('base64'), signature: sign('RSA-SHA256', bytes, privateKey).toString('base64') };
}

test('current release notes pass the existing app verifier with an ephemeral RSA signature', async () => {
  const notes = validateReleaseNotes(currentNotes, version);
  const patch = { ...base, notes };
  assert.deepEqual(await verifyPatchManifest(envelope(patch), trust), patch);
  assert.deepEqual(notes, currentNotes.notes);
});

for (const count of [1, 8]) {
  test(`release accepts ${count} notes and existing verifier agrees`, async () => {
    const notes = Array.from({ length: count }, () => '한글 패치 안내');
    assert.deepEqual(validateReleaseNotes({ version, notes }, version), notes);
    assert.deepEqual((await verifyPatchManifest(envelope({ ...base, notes }), trust)).notes, notes);
  });
}
test('release rejects zero notes before signing', () => {
  assert.throws(() => validateReleaseNotes({ version, notes: [] }, version), /1~8/);
});
test('nine notes are rejected by preflight and the existing signed manifest verifier', async () => {
  const notes = Array(9).fill('패치 안내');
  assert.throws(() => validateReleaseNotes({ version, notes }, version), /1~8/);
  await assert.rejects(verifyPatchManifest(envelope({ ...base, notes }), trust));
});
test('400 characters are accepted by preflight and the existing verifier', async () => {
  const notes = ['가'.repeat(400)];
  assert.deepEqual(validateReleaseNotes({ version, notes }, version), notes);
  assert.deepEqual((await verifyPatchManifest(envelope({ ...base, notes }), trust)).notes, notes);
});
test('401 characters are rejected by preflight and the existing verifier', async () => {
  const notes = ['가'.repeat(401)];
  assert.throws(() => validateReleaseNotes({ version, notes }, version), /400/);
  await assert.rejects(verifyPatchManifest(envelope({ ...base, notes }), trust));
});

for (const [name, notes] of [['missing', undefined], ['null', null], ['string', '패치 안내'], ['object', { length: 1 }]]) {
  test(`release rejects a ${name} notes array`, () => {
    assert.throws(() => validateReleaseNotes({ version, notes }, version), /1~8/);
  });
}
for (const [name, note] of [['number', 1], ['boolean', true], ['null', null], ['object', {}], ['array', []]]) {
  test(`release rejects a ${name} note`, async () => {
    assert.throws(() => validateReleaseNotes({ version, notes: [note] }, version), /400/);
    await assert.rejects(verifyPatchManifest(envelope({ ...base, notes: [note] }), trust));
  });
}
test('release rejects sparse notes instead of skipping an absent string', () => {
  assert.throws(() => validateReleaseNotes({ version, notes: Array(1) }, version), /400/);
});
test('release rejects a notes version different from the package version', () => {
  assert.throws(() => validateReleaseNotes({ version: '0.0.1', notes: ['패치 안내'] }, version), /현재 버전/);
});
for (const invalidVersion of [null, 163, '1.99.163-beta', '999999.1.1']) {
  test(`release rejects invalid expected version ${JSON.stringify(invalidVersion)}`, () => {
    assert.throws(() => validateReleaseNotes({ version: invalidVersion, notes: ['패치 안내'] }, invalidVersion), /버전 형식/);
  });
}

for (const [name, changes] of [
  ['foreign OTA origin', { url: 'https://example.invalid/patch.zip' }],
  ['foreign APK origin', { apkUrl: 'https://example.invalid/app.apk' }],
  ['bundle larger than 512 MiB', { size: 512 * 1024 * 1024 + 1 }],
  ['native version below trust', { minNativeVersion: 0 }],
]) {
  test(`existing verifier rejects signed ${name} despite valid release notes`, async () => {
    const notes = validateReleaseNotes(currentNotes, version);
    await assert.rejects(verifyPatchManifest(envelope({ ...base, notes, ...changes }), trust));
  });
}
test('existing verifier accepts the 512 MiB metadata limit', async () => {
  const patch = { ...base, size: 512 * 1024 * 1024 };
  assert.deepEqual(await verifyPatchManifest(envelope(patch), trust), patch);
});
test('existing verifier rejects a tampered envelope after release notes preflight', async () => {
  const signed = envelope({ ...base, notes: validateReleaseNotes(currentNotes, version) });
  signed.payload = Buffer.from(JSON.stringify({ ...base, notes: ['변조된 안내'] })).toString('base64');
  await assert.rejects(verifyPatchManifest(signed, trust));
});

for (const script of ['package-update.mjs', 'check-cloud-release.mjs']) {
  test(`${script} rejects invalid notes before build, trust, signing-key or network access`, () => {
    const fixture = mkdtempSync(path.join(tmpdir(), 'cheonsu-release-notes-'));
    try {
      for (const directory of ['scripts', 'src/engine', 'docs']) mkdirSync(path.join(fixture, directory), { recursive: true });
      for (const file of ['scripts/package-update.mjs', 'scripts/check-cloud-release.mjs', 'scripts/release-notes.mjs',
        'scripts/update-build-info.mjs', 'src/engine/liveUpdateEngine.js', 'src/engine/updateEngine.js']) {
        copyFileSync(path.join(root, file), path.join(fixture, file));
      }
      symlinkSync(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
      writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ type: 'module', version }));
      writeFileSync(path.join(fixture, 'docs/update-notes.json'), JSON.stringify({ version, notes: Array(9).fill('패치 안내') }));
      const child = spawnSync(process.execPath, [path.join(fixture, 'scripts', script)], { cwd: fixture, encoding: 'utf8', timeout: 10000,
        env: { ...process.env, CHEONSU_UPDATE_PRIVATE_KEY_PATH: path.join(fixture, 'absent-test-key.pem') } });
      assert.equal(child.error, undefined);
      assert.equal(child.status, 1);
      assert.match(child.stderr, /패치 노트는 1~8개/);
      assert.doesNotMatch(child.stderr, /ENOENT|필수 파일 없음/);
    } finally { rmSync(fixture, { recursive: true, force: true }); }
  });
}
