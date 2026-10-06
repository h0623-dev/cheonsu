/** 현행 배치 경고와 미션 안내를 거쳐 실제 전투 화면으로 들어간다. */
export async function confirmArtQaDeployment(page) {
  await page.waitForFunction(() => document.querySelector('.final-deploy-card,.story-screen,.narrative-screen,.world-battlefield'));
  const override = page.getByRole('button', { name: '그래도 출전', exact: true });
  if (await override.count()) await override.click();
}

export async function confirmArtQaMission(page) {
  const dialog = page.locator('.stage-mission-dialog[open]');
  await dialog.waitFor();
  await dialog.getByRole('button', { name: '미션 확인', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
}
