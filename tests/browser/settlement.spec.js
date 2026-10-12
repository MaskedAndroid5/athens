import { test, expect } from '@playwright/test';
async function place(page, name, x, z) {
  await page.getByRole('button', { name, exact: false }).first().click();
  await page.getByLabel('Placement X').fill(String(x));
  await page.getByLabel('Placement Z').fill(String(z));
  await page.getByRole('button', { name: 'Place component', exact: true }).click();
}
async function register(page, name) {
  await page.getByRole('button', { name: 'Guest · Sign in' }).click();
  await page.getByLabel('Display name', { exact: true }).fill(name);
  await page.getByLabel('Password', { exact: true }).fill('test-password-long');
  await page.getByRole('button', { name: 'Create account', exact: false }).click();
  await expect(page.getByRole('dialog', { name: 'Save recovery code' })).toBeVisible();
  await page.getByRole('button', { name: 'I have stored my code' }).click();
}
test('first playable settlement, ownership, save/load, scenario, two participants and observation', async ({
  page,
  browser,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter Athens' }).click();
  await page.getByRole('button', { name: 'Create a settlement' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await place(page, 'Residence', -4, 0);
  await page.getByRole('checkbox', { name: 'Connect to settlement energy bus' }).check();
  await place(page, 'Energy pavilion', 4, 0);
  await place(page, 'Simulated resident', 0, 4);
  await page.getByRole('checkbox', { name: 'Connect to settlement energy bus' }).check();
  await page.getByRole('button', { name: 'Structural Vision OFF' }).click();
  await page.getByLabel('Scenario · energy availability').fill('0.2');
  await expect(page.getByText('5.0 → 2.4 energy delivered')).toBeVisible();
  await expect(page.getByText('Server evaluated', { exact: false })).toBeVisible();
  await register(page, 'Builder');
  await page.getByRole('button', { name: 'Publish', exact: false }).click();
  await expect(page.getByRole('status').last()).toContainText('Published');
  const before = await page.request.get('/api/export');
  const record = await before.json();
  expect(record.parcel.objects).toHaveLength(3);
  expect(record.parcel.published).toBe(true);
  await page.getByRole('button', { name: 'Self', exact: true }).click();
  await page.getByRole('button', { name: 'Load / claim my parcel' }).click();
  await expect(page.getByRole('status').last()).toContainText('saved parcel is loaded');
  const visitorContext = await browser.newContext(),
    visitor = await visitorContext.newPage();
  await visitor.goto('/');
  await visitor.getByRole('button', { name: 'Enter Athens' }).click();
  await visitor.getByRole('button', { name: 'Society', exact: true }).click();
  await expect(visitor.getByText('2 explorers in this room')).toBeVisible();
  await expect(visitor.getByRole('button', { name: 'Builder', exact: false })).toBeVisible();
  const denial = await visitor.request.put('/api/parcels/' + record.parcel.id, {
    data: { objects: [], policy: 'equal', revision: record.parcel.revision },
  });
  expect(denial.status()).toBe(403);
  await visitor.getByLabel('Room message').fill('Hello from the Commons');
  await visitor.getByRole('button', { name: 'Send message' }).click();
  await page.getByRole('button', { name: 'Society', exact: true }).click();
  await expect(page.getByRole('log')).toContainText('Hello from the Commons');
  await page.getByRole('button', { name: 'Self', exact: true }).click();
  await page.getByRole('button', { name: 'Use lightweight observation mode' }).click();
  await page.getByRole('button', { name: 'Load / claim my parcel' }).click();
  await expect(page.getByRole('img', { name: 'Top-down construction parcel' })).toBeVisible();
  await page.getByRole('button', { name: 'Residence', exact: false }).first().click();
  await page.getByLabel('Placement X').fill('10');
  await page.getByRole('button', { name: 'Place component' }).click();
  await expect
    .poll(async () => {
      const r = await page.request.get('/api/export');
      return (await r.json()).parcel.objects.length;
    })
    .toBe(4);
  await page.reload();
  await page.getByRole('button', { name: 'Enter Athens' }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText('World inspector · 4 components')).toBeVisible();
  expect(errors).toEqual([]);
  await visitorContext.close();
});
test('avatar movement, reduced motion, graphics controls and mobile observation', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter Athens' }).click();
  await page.locator('canvas').waitFor({ state: 'visible' });
  const start = await page.evaluate(() => window.__ATHENS_PLAYER_POSITION__);
  await page.keyboard.down('w');
  await page.waitForTimeout(400);
  await page.keyboard.up('w');
  await expect
    .poll(() => page.evaluate(() => window.__ATHENS_PLAYER_POSITION__[1]))
    .toBeLessThan(start[1]);
  await page.getByRole('button', { name: 'Self', exact: true }).click();
  await page.getByLabel('Text size').selectOption('large');
  await page.getByLabel('Graphics quality').selectOption('low');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Use lightweight observation mode' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await place(page, 'Residence', 0, 0);
  await expect(page.getByText('World inspector · 1 components')).toBeVisible();
});

test('keyboard builder transforms, history, parcel bounds and portable export', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Use lightweight observation mode' }).click();
  await page.getByRole('button', { name: 'Enter Athens' }).click();
  await page.getByRole('button', { name: 'Create a settlement' }).click();
  await place(page, 'Residence', 0, 0);
  await page.getByRole('button', { name: 'Rotate 45°' }).click();
  await page.getByLabel('Scale', { exact: true }).fill('1.5');
  await page.getByRole('button', { name: 'Move →' }).click();
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.getByText('World inspector · 2 components')).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('World inspector · 2 components')).toBeVisible();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByText('World inspector · 1 components')).toBeVisible();
  await page.getByRole('button', { name: 'Energy pavilion', exact: false }).first().click();
  await page.getByLabel('Placement X').fill('18');
  await page.getByRole('button', { name: 'Place component' }).click();
  await expect(page.getByRole('status').last()).toContainText('farther from the parcel boundary');
  await page.getByRole('button', { name: 'Self', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export creation JSON' }).click();
  const downloaded = await downloading;
  const { readFile } = await import('node:fs/promises');
  const exported = JSON.parse(await readFile(await downloaded.path(), 'utf8'));
  expect(exported.objects).toHaveLength(1);
  expect(exported.objects[0].position).toEqual([2, 0]);
  expect(exported.objects[0].rotation).toBeCloseTo(Math.PI / 4);
  expect(exported.objects[0].scale).toBe(1.5);
});
