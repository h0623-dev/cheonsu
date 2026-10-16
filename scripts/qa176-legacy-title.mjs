// 구형 저장의 타이틀 표시·읽기 전용 이어하기·수동 저장을 독립 브라우저에서 검사합니다.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { getInitialParty } from '../src/engine/partyEngine.js';

const url = process.env.QA_URL || 'http://127.0.0.1:4173';
const beforeFix = process.env.QA_LEGACY_EXPECT_BUG === '1';
const out = process.env.QA_OUT || '/workspace/work/qa176/dev/legacy-title';
await mkdir(out, { recursive: true });
const key = 'cheonsu_v01_save';
const seed = { version: '0.12', screen: 'campaign', currentStageId: 1,
  party: getInitialParty(), gold: 4567, campWalkerId: 'lina' };
const raw = JSON.stringify(seed);
const report = { version: '1.99.176', url, startedAt: new Date().toISOString(), beforeFix,
  scope: 'clearedStages 미기록 구형 저장의 타이틀·기록실·도감·이어하기·수동 저장',
  isolatedSyntheticSave: true, errors: [], passed: false };
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
  hasTouch: true, serviceWorkers: 'block' });
const page = await context.newPage();
page.setDefaultTimeout(18000);
page.on('pageerror', error => report.errors.push({ message: error.message, stack: error.stack }));
page.on('dialog', dialog => dialog.accept());
await page.addInitScript(() => {
  localStorage.setItem('cheonsu_auto_patch', 'false');
  localStorage.setItem('cheonsu_settings_v1', JSON.stringify({ soundOn: false, musicOn: false }));
});
const readRaw = () => page.evaluate(key => localStorage.getItem(key), key);
try {
  await page.goto(url);
  await page.locator('.journey-title').waitFor();
  report.bundle = await page.locator('script[type="module"][src]').getAttribute('src');
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw });
  await page.reload();
  if (beforeFix) {
    await page.waitForFunction(() => document.querySelector('.runtime-error') || !document.querySelector('.journey-title'));
    assert.ok(report.errors.some(error => error.message.includes('length')), '구형 저장의 완료 장 수 접근 오류 재현');
    assert.equal(await readRaw(), raw, '타이틀 오류가 저장 원문을 변경하지 않음');
    report.observed = 'clearedStages.length TypeError';
    report.storageUnchanged = true;
    await page.screenshot({ path: `${out}/before-title.png` });
  } else {
    const resume = page.getByRole('button', { name: '이어하기', exact: true });
    await resume.waitFor();
    report.title = await page.locator('.journey-resume small').innerText();
    assert.ok(report.title.includes('0/50장 완료'));
    assert.equal(await readRaw(), raw, '구형 타이틀 표시는 저장을 변경하지 않음');
    await page.screenshot({ path: `${out}/after-title.png` });
    await page.getByRole('button', { name: '기록실', exact: true }).click();
    await page.locator('.journey-library').waitFor();
    await page.getByRole('button', { name: '도감·기록', exact: true }).click();
    assert.ok((await page.locator('.library-checkpoint').innerText()).includes('0/50장 완료'));
    await page.getByRole('button', { name: '뒤로', exact: true }).click();
    await page.getByRole('button', { name: '도감', exact: true }).click();
    await page.locator('.character-codex').waitFor();
    await page.getByRole('button', { name: '뒤로', exact: true }).click();
    assert.equal(await readRaw(), raw, '기록실·도감 열람은 구형 원문을 변경하지 않음');
    await page.getByRole('button', { name: '이어하기', exact: true }).click();
    await page.locator('.campaign-screen').waitFor();
    assert.equal(await readRaw(), raw, '구형 이어하기는 저장을 즉시 덮어쓰지 않음');
    await page.locator('.campaign-header').getByRole('button', { name: '저장', exact: true }).click();
    const saved = JSON.parse(await readRaw());
    assert.equal(saved.gold, seed.gold);
    assert.deepEqual(saved.clearedStages, []);
    assert.equal(saved.campWalkerId, seed.campWalkerId);
    const preserve = unit => Object.fromEntries(['id', 'name', 'level', 'exp', 'hp', 'maxHp', 'atk', 'def',
      'baseAtk', 'baseDef', 'equipment', 'gearEnhance'].map(field => [field, unit[field]]));
    assert.deepEqual(saved.party.map(preserve), seed.party.map(preserve));
    report.preserved = { gold: saved.gold, characterIds: saved.party.map(unit => unit.id),
      fields: ['이름', '레벨', '경험치', 'HP', '기본 능력', '장비', '강화', '마을 캐릭터'],
      clearedStages: saved.clearedStages, readOnlyUntilManualSave: true };
    await page.screenshot({ path: `${out}/after-continued-saved.png` });
    assert.deepEqual(report.errors, []);
  }
  report.passed = true;
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  await context.close(); await browser.close();
}
