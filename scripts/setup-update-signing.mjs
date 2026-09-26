import fs from 'node:fs';
import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keyPath = path.join(root, '.update-keys/private.pem');
if (fs.existsSync(keyPath)) throw new Error('기존 패치 서명 키를 덮어쓸 수 없습니다.');
const configPath = path.join(root, 'capacitor.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (config.plugins?.LiveUpdate?.publicKey) throw new Error('이미 등록된 공개 키가 있습니다. 기존 개인 키를 복원하세요.');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
fs.mkdirSync(path.dirname(keyPath), { recursive: true });
fs.writeFileSync(keyPath, privateKey, { flag: 'wx', mode: 0o600 });
config.plugins = { ...config.plugins, LiveUpdate: { publicKey, readyTimeout: 30000,
  autoBlockRolledBackBundles: true, autoDeleteBundles: true, autoUpdateStrategy: 'none', httpTimeout: 120000 } };
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'src/data/updateTrust.json'), JSON.stringify({
  publicKey, manifestUrl: 'https://raw.githubusercontent.com/h0623-dev/cheonsu/updates/latest.json',
  repository: 'h0623-dev/cheonsu', minNativeVersion: 335,
}, null, 2) + '\n');
console.log('패치 서명 키 생성 완료. .update-keys/private.pem은 공개하거나 소스 ZIP에 넣지 마세요.');
