// Shared navigation for the automatic browser checks: story → battlefield
// briefing → manual deployment → the first allied turn.
const storySelector = '.story-screen,.narrative-screen';
const briefingSelector = '.stage-mission-dialog[open]';
const introSelector = '.boss-splash-overlay,.stage-directing-banner.stage-banner-start';

export async function waitForDeployment(page, { confirmMission = true } = {}) {
  await page.waitForFunction(() => document.querySelector('.story-screen,.narrative-screen,.battle-deployment-scene'));
  // A chapter-clear story can be followed immediately by the next chapter intro.
  for (let scene = 0; scene < 4 && await page.locator(storySelector).count(); scene++) {
    await page.locator('.narrative-skip').click();
    await page.waitForFunction(() => document.querySelector('.story-screen,.narrative-screen,.battle-deployment-scene'));
  }
  await page.locator('.battle-deployment-scene .deployment-board-grid').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.deployment-roster-card').length > 0);
  if (!confirmMission) return;
  await page.waitForFunction(() => document.querySelector('.stage-mission-dialog[open],.battle-deployment-scene .deployment-start-btn:not(:disabled)'));
  if (await page.locator(briefingSelector).count()) {
    await page.locator(briefingSelector).getByRole('button', { name: '미션 확인', exact: true }).click();
  }
  await readyDeployment(page);
}

export async function readyDeployment(page) {
  await page.waitForFunction(({ briefingSelector, introSelector }) => {
    const start = document.querySelector('.battle-deployment-scene .deployment-start-btn');
    return !!start && !start.disabled && !document.querySelector(`${briefingSelector},${introSelector}`);
  }, { briefingSelector, introSelector });
}

export async function startDeploymentBattle(page) {
  await readyDeployment(page);
  await page.locator('.battle-deployment-scene .deployment-start-btn').click();
  await page.waitForFunction(() => document.querySelector('.final-deploy-card,.battle-control-heading'));
  const override = page.getByRole('button', { name: '그래도 출전', exact: true });
  if (await override.count()) await override.click();
  await page.locator('.battle-screen:not(.deployment-screen) .world-battlefield .unit-visual-hero').waitFor();
  await page.waitForFunction(() => {
    const save = document.querySelector('.battle-control-heading .prominent-save');
    return !!save && !save.disabled;
  });
}

export async function leaveDeployment(page) {
  await page.locator('.battle-deploy-header > button').first().click();
}
