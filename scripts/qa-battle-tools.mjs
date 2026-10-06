// Shared navigation for the existing automatic checks. Battle tools are only
// mounted while the information panel is expanded, so readiness must come from
// the battle itself rather than the presence of a Save button.
const battleSelector = '.battle-screen:not(.deployment-screen)';
const toolsSelector = '.cinematic-stage-actions.battle-information-tools';
const speedIds = ['normal', 'fast', 'turbo'];

export async function waitForBattleReady(page, { timeout = 120000 } = {}) {
  await page.waitForFunction(selector => document.querySelector(selector)?.dataset.saveReady === 'true', battleSelector, { timeout });
}

export async function ensureBattleInformationOpen(page) {
  await page.locator(battleSelector).waitFor();
  const reveal = page.getByRole('button', { name: '정보 표시', exact: true });
  const wasHidden = await reveal.isVisible();
  if (wasHidden) await reveal.click();
  await page.locator(toolsSelector).waitFor();
  return wasHidden;
}

export async function saveBattle(page) {
  await waitForBattleReady(page);
  const wasHidden = await ensureBattleInformationOpen(page);
  await page.locator(`${toolsSelector} .prominent-save`).click();
  if (wasHidden) await page.getByRole('button', { name: '정보 숨김', exact: true }).click();
}

export async function setBattleSpeed(page, speed) {
  if (!speedIds.includes(speed)) throw new Error(`알 수 없는 전투 속도: ${speed}`);
  await ensureBattleInformationOpen(page);
  const button = page.locator(`${toolsSelector} .battle-speed-cycle`);
  for (let click = 0; click < speedIds.length; click++) {
    const current = await button.getAttribute('data-battle-speed');
    if (current === speed) return button;
    const index = speedIds.indexOf(current);
    if (index < 0) throw new Error(`전투 속도 버튼의 현재 값이 없습니다: ${current}`);
    const next = speedIds[(index + 1) % speedIds.length];
    await button.click();
    await page.waitForFunction(next => document.querySelector('.battle-information-tools .battle-speed-cycle')?.dataset.battleSpeed === next, next);
  }
  throw new Error(`전투 속도를 ${speed}로 변경하지 못했습니다.`);
}
