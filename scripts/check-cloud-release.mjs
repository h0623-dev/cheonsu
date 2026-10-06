import fs from 'node:fs';
import { verifyPatchManifest } from '../src/engine/liveUpdateEngine.js';
import { compareVersions } from '../src/engine/updateEngine.js';
import { validateReleaseNotes } from './release-notes.mjs';

const { version } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
const notesDocument = JSON.parse(fs.readFileSync(new URL('../docs/update-notes.json', import.meta.url)));
validateReleaseNotes(notesDocument, version);
const trust = JSON.parse(fs.readFileSync(new URL('../src/data/updateTrust.json', import.meta.url)));
const response = await fetch(trust.manifestUrl, { cache: 'no-store', signal: AbortSignal.timeout(60000) });
if (!response.ok) throw new Error(`Cannot verify public update channel: ${response.status}`);
const previous = await verifyPatchManifest(await response.json(), { ...trust, minNativeVersion: 1 });
if (compareVersions(version, previous.version) <= 0) throw new Error(`Use a new version above ${previous.version}; published versions are immutable.`);
console.log(`Release version verified: ${previous.version} -> ${version}`);
