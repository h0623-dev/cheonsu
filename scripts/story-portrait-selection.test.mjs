import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { getStoryPortrait, storySpeakerKeys } from '../src/data/storyArt.js';
import { getPaintedVisualProfile } from '../src/data/unitVisuals.js';
import { getGameCharacterArtKey, getExpansionArtIdentity } from '../src/data/expansionArtRegistry.js';
import { ADVANCED_CLASSES } from '../src/data/advancedClasses.js';

const source = (await readFile(new URL('../src/data/storyArt.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '').replaceAll('export ', '');
const fixtures = new Map();
for (const baseId of new Set(Object.values(storySpeakerKeys))) {
  fixtures.set(baseId, { dialogue: `/base/${baseId}/dialogue.webp`, portrait: `/base/${baseId}/portrait.webp`, map: `/idle/${baseId}.webp` });
}
for (const forms of Object.values(ADVANCED_CLASSES)) for (const form of forms) {
  const identity = getExpansionArtIdentity(form.id);
  fixtures.set(form.id, { dialogue: `/art/characters-v3/dialogue/${identity.assetId}.webp`,
    portrait: `/art/characters-v3/portraits/${identity.assetId}.webp`, map: identity.map });
}
function createHarness(catalogue = fixtures) {
  return vm.runInNewContext(`${source}\ngetStoryPortrait`, {
    getGameCharacterArtKey, getExpansionArtIdentity,
    getCharacterArt: key => catalogue.get(key) || null,
    getPaintedVisualProfile: key => { const art = catalogue.get(key); return art && { cutscene: art.dialogue, map: art.map }; },
  });
}

test('all 42 selected forms use their owner dialogue without mutating party saves or base idle artwork', () => {
  const portrait = createHarness();
  const catalogueBefore = structuredClone([...fixtures]);
  let checked = 0;
  for (const [id, forms] of Object.entries(ADVANCED_CLASSES)) for (const form of forms) {
    const speaker = Object.keys(storySpeakerKeys).find(name => storySpeakerKeys[name] === id);
    assert.ok(speaker, `${id}: registered story speaker`);
    const party = [{ id: 'hero', type: 'ally' }, { id, type: 'ally', advancedClass: form.id,
      hp: 7, maxHp: 53, level: 17, exp: 83, equipment: { weapon: 'kept' }, learnedTechniques: ['kept'], moved: true }];
    if (id === 'hero') party.shift();
    const before = structuredClone(party);
    assert.equal(portrait(speaker, party), fixtures.get(form.id).dialogue);
    assert.deepEqual(party, before);
    assert.equal(fixtures.get(form.id).map, getExpansionArtIdentity(form.id).map);
    checked++;
  }
  assert.equal(checked, 42);
  assert.deepEqual([...fixtures], catalogueBefore, 'dialogue selection leaves all idle paths and catalogue entries intact');
});

test('default callers and unknown speakers keep the original portraits even with a promoted hero in the party', () => {
  for (const speaker of Object.keys(storySpeakerKeys)) {
    assert.equal(getStoryPortrait(speaker), getPaintedVisualProfile(storySpeakerKeys[speaker])?.cutscene || getPaintedVisualProfile('hero').cutscene);
    assert.equal(getStoryPortrait(speaker, null), getStoryPortrait(speaker));
  }
  const party = [{ id: 'hero', type: 'ally', advancedClass: 'hero__form0' }];
  for (const speaker of ['알 수 없는 화자', '__proto__', 'constructor', undefined]) {
    assert.equal(getStoryPortrait(speaker, party), getStoryPortrait(speaker));
    assert.equal(getStoryPortrait(speaker), getPaintedVisualProfile('hero').cutscene);
  }
});

test('speaker aliases share the selected owner form, and another character cannot lend its form', () => {
  const portrait = createHarness();
  const irene = { id: 'irene', type: 'ally', advancedClass: 'irene__form1' };
  assert.equal(portrait('아이린', [irene]), fixtures.get(irene.advancedClass).dialogue);
  assert.equal(portrait('이레네', [irene]), portrait('아이린', [irene]));
  const sylvan = { id: 'sylvan', type: 'ally', advancedClass: 'sylvan__form0' };
  assert.match(portrait('실반', [sylvan]), /\/silvan__form0\.webp$/);
  assert.equal(portrait('카일', [{ id: 'hero', type: 'ally', advancedClass: 'bram__form0' }]), fixtures.get('hero').dialogue);
  assert.equal(portrait('카일', [{ id: 'bram', type: 'ally', advancedClass: 'bram__form0' }]), fixtures.get('hero').dialogue);
});

test('missing selected art falls back to the owner, portrait-only forms work, and new allies/bosses retain their base identities', () => {
  const catalogue = new Map(fixtures);
  catalogue.delete('hero__form0');
  catalogue.set('hero__form1', { portrait: '/portrait-only/hero.webp' });
  const portrait = createHarness(catalogue);
  assert.equal(portrait('카일', [{ id: 'hero', type: 'ally', advancedClass: 'hero__form0' }]), fixtures.get('hero').dialogue);
  assert.equal(portrait('카일', [{ id: 'hero', type: 'ally', advancedClass: 'hero__form1' }]), '/portrait-only/hero.webp');
  for (const [speaker, id] of [['마레','mare'], ['하린','harin'], ['에단','edan'], ['실반','sylvan'],
    ['심해 수문장 모르칸','tide_keeper'], ['빙정 여왕 세르카','frost_queen'],
    ['공명 집행관 아르켄','resonance_judge'], ['첫 맹세 수호체 아스테르','oath_guardian']]) {
    assert.equal(portrait(speaker), fixtures.get(id).dialogue);
    assert.equal(portrait(speaker, [{ id: 'hero', type: 'ally', advancedClass: 'hero__form1' }]), fixtures.get(id).dialogue);
  }
});
