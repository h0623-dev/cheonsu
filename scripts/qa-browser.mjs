import { existsSync } from 'node:fs';

/** The published cloud image already provides Chromium; Actions uses its cached browser. */
export function qaBrowserOptions(extra = {}) {
  const channel = process.env.CHEONSU_QA_BROWSER;
  const configured = channel === 'chromium' && existsSync('/usr/bin/chromium')
    ? { executablePath: '/usr/bin/chromium' }
    : channel ? { channel } : process.platform === 'win32' ? { channel: 'msedge' } : {};
  return { headless: true, ...configured, ...extra };
}

/** These feature checks enter through the same mission confirmation as players. */
export async function confirmStageMission(page) {
  await page.locator('.world-battlefield').waitFor();
  const dialog = page.locator('.stage-mission-dialog[open]');
  if (await dialog.count()) {
    await dialog.getByRole('button', { name: '미션 확인', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
  }
}
