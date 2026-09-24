import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZipArchive } from 'archiver';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fsp.readFile(path.join(root, 'package.json'), 'utf8'));
const target = path.join(root, `cheonsu_development_${pkg.version}.zip`);
const allowed = ['src', 'public', 'android', 'docs', 'scripts', 'tests', '.github', '.gitignore', '.nvmrc', 'package.json', 'package-lock.json', 'index.html', 'vite.config.js', 'eslint.config.js', 'capacitor.config.json', 'README.md', 'CHEONSU_DEV_SUMMARY_SINGLE_FILE.md'];
const excludedNames = new Set(['node_modules', 'build', '.gradle', '.git', '.idea', 'local.properties', 'captures', 'release']);
const files = [];
async function collect(relative) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) return;
  const stat = await fsp.lstat(full);
  if (stat.isSymbolicLink()) return;
  const name = path.basename(relative);
  if (excludedNames.has(name) || name.startsWith('.env') || /\.(apk|aab|jks|keystore|log|pem|p12)$/i.test(name)) return;
  if (relative.replaceAll('\\', '/').startsWith('android/app/src/main/assets/public/')) return;
  if (stat.isDirectory()) for (const child of (await fsp.readdir(full)).sort()) await collect(path.join(relative, child));
  else files.push(relative);
}
for (const entry of [...allowed, 'AGENTS.md']) await collect(entry);
const archive = new ZipArchive({ zlib: { level: 6 } });
const output = fs.createWriteStream(target);
const finished = new Promise((resolve, reject) => { output.on('close', resolve); output.on('error', reject); archive.on('error', reject); archive.on('warning', reject); });
archive.pipe(output);
for (const file of files) archive.file(path.join(root, file), { name: `cheonsu/${file.replaceAll('\\', '/')}` });
archive.append(JSON.stringify({ version: pkg.version, created: new Date().toISOString(), files: files.map(file => file.replaceAll('\\', '/')) }, null, 2), { name: 'cheonsu/SOURCE_MANIFEST.json' });
await archive.finalize();
await finished;
console.log(`${target}\n${files.length} files; ${archive.pointer()} bytes; no credentials or machine-local build caches.`);
