import fs from 'node:fs';
import path from 'node:path';
import { createPublicKey, X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { root } from './setup.mjs';

export const androidCertificate = '1d4b2f3f8e7b30e2b9202121def34d4da6e39b4119bdd93c44a01aebfcd0518f';
export function verifyOtaKey(privateKey, expectedPublicKey) {
  const actual = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  const expected = createPublicKey(expectedPublicKey).export({ type: 'spki', format: 'der' });
  if (!actual.equals(expected)) throw new Error('OTA signing key does not match updateTrust.json.');
}

function main() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.platform !== 'linux' || !process.env.RUNNER_TEMP) {
    throw new Error('Signing restore is restricted to ephemeral Linux GitHub Actions runners.');
  }
  const directory = path.join(process.env.RUNNER_TEMP, 'cheonsu-signing');
  const keystore = path.join(directory, 'debug.keystore');
  if (process.argv.includes('--cleanup')) {
    for (const name of ['debug.keystore', 'private.pem']) fs.rmSync(path.join(directory, name), { force: true });
    return;
  }
  const encoded = process.env.ANDROID_DEBUG_KEYSTORE_BASE64;
  const privateKey = process.env.OTA_PRIVATE_KEY_PEM;
  if (!encoded || !privateKey) throw new Error('Both Android and OTA signing secrets are required.');
  verifyOtaKey(privateKey, JSON.parse(fs.readFileSync(path.join(root, 'src/data/updateTrust.json'))).publicKey);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(keystore, Buffer.from(encoded, 'base64'), { mode: 0o600, flag: 'wx' });
  const certificate = execFileSync(path.join(process.env.JAVA_HOME, 'bin/keytool'), [
    '-exportcert', '-keystore', keystore, '-alias', 'androiddebugkey', '-storepass', 'android',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  if (new X509Certificate(certificate).fingerprint256.replaceAll(':', '').toLowerCase() !== androidCertificate) {
    throw new Error('Android certificate does not match the installed app.');
  }
  fs.writeFileSync(path.join(directory, 'private.pem'), privateKey, { mode: 0o600, flag: 'wx' });
  // Pin Android's preferences directory so runner defaults cannot choose another debug key.
  fs.appendFileSync(process.env.GITHUB_ENV, `ANDROID_USER_HOME=${directory}\nCHEONSU_UPDATE_PRIVATE_KEY_PATH=${path.join(directory, 'private.pem')}\n`);
  console.log('Android certificate and OTA public key match. Signing files restored for this job only.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
