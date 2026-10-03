import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { githubToken } from './github-auth.mjs';
import { findAndroidEnvironment } from './setup.mjs';
import { verifyOtaKey } from './cloud-signing.mjs';

test('cloud token uses scoped Actions token without reading desktop credentials', () => {
  const unexpected = () => { throw new Error('must not read local credentials'); };
  assert.equal(githubToken({ GH_TOKEN: ' scoped ', GITHUB_TOKEN: 'fallback' }, unexpected), 'scoped');
  assert.equal(githubToken({ GITHUB_TOKEN: 'job' }, unexpected), 'job');
  assert.throws(() => githubToken({ GITHUB_ACTIONS: 'true' }, unexpected), /token is required/);
});
test('desktop publishing retains the existing Git credential helper', () => {
  assert.equal(githubToken({}, (command, args, options) => {
    assert.equal(command, 'git');
    assert.equal(options.env.GIT_TERMINAL_PROMPT, '0');
    assert.ok(args.includes('credential.interactive=never'));
    return 'protocol=https\nusername=test\npassword=local-token\n';
  }), 'local-token');
  assert.throws(() => githubToken({}, () => 'username=test'), /login is required/);
});
test('Android environment requires the project compile SDK, not historical SDK 35', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cheonsu-sdk-test-'));
  try {
    fs.mkdirSync(path.join(temp, 'android'), { recursive: true });
    fs.writeFileSync(path.join(temp, 'android/variables.gradle'), 'ext { compileSdkVersion = 36 }');
    const sdk = path.join(temp, 'sdk');
    fs.mkdirSync(path.join(sdk, 'platforms/android-35'), { recursive: true });
    const options = { env: { ANDROID_HOME: sdk }, home: temp, projectRoot: temp };
    assert.equal(findAndroidEnvironment(options).sdk, undefined);
    fs.mkdirSync(path.join(sdk, 'platforms/android-36'));
    assert.equal(findAndroidEnvironment(options).sdk, sdk);
    fs.writeFileSync(path.join(temp, 'android/variables.gradle'), 'ext {}');
    assert.throws(() => findAndroidEnvironment(options), /compileSdkVersion/);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
test('OTA secret restoration rejects a different key before signing', () => {
  const first = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const second = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicPem = first.publicKey.export({ type: 'spki', format: 'pem' });
  assert.doesNotThrow(() => verifyOtaKey(first.privateKey, publicPem));
  assert.throws(() => verifyOtaKey(second.privateKey, publicPem), /does not match/);
});
