import { test, expect, go } from './demo';

/**
 * The project map, on the demo account: two spaces (My projects and the
 * workspace), a folder, and projects that have all been worked on lately.
 */
const mark = (page: import('@playwright/test').Page, id: string) =>
  page.locator(`[data-map-node="${id}"]`);

test('the map is a page of its own, listed in the sidebar', async ({ demo: page }) => {
  await page.locator('.sidebar').getByRole('button', { name: 'Project map' }).click();
  await expect(page).toHaveURL(/#\/map$/);
  await expect(page.getByRole('heading', { name: 'Project map' })).toBeVisible();
  // One mark per project, plus the hubs they hang from and the centre.
  for (const id of ['personal', 'home', 'site', 'client-a', 'client-b', 'clients', 'root']) {
    await expect(mark(page, id)).toBeVisible();
  }
  // A project draws the number the sidebar shows beside it.
  await expect(mark(page, 'home').locator('.mapmark-count')).toHaveText('10');
});

test('a project opens beside the map, and its tasks open from there', async ({ demo: page }) => {
  await go(page, '#/map');
  await mark(page, 'site').locator('.mapmark-body').click();
  const panel = page.locator('.mappanel');
  await expect(panel.getByRole('heading', { name: 'Website' })).toBeVisible();
  await expect(panel.locator('.mapstatus')).toHaveText('Moving');
  await panel.locator('.maptasks button').first().click();
  await expect(page.locator('.detail-top')).toBeVisible();
});

test('focus holds three projects and refuses a fourth', async ({ demo: page }) => {
  await go(page, '#/map');
  const panel = page.locator('.mappanel');
  for (const id of ['personal', 'home', 'site']) {
    await mark(page, id).locator('.mapmark-body').click();
    await panel.getByRole('button', { name: 'Put in focus' }).click();
    await expect(mark(page, id).locator('.mapmark-focus')).toBeVisible();
  }
  await mark(page, 'client-a').locator('.mapmark-body').click();
  await panel.getByRole('button', { name: 'Put in focus' }).click();
  await expect(panel.getByText('Your focus is full.')).toBeVisible();
  await expect(mark(page, 'client-a').locator('.mapmark-focus')).toHaveCount(0);

  // Taking one out frees its place.
  await mark(page, 'home').locator('.mapmark-body').click();
  await panel.getByRole('button', { name: 'Take out of focus' }).click();
  await panel.getByRole('button', { name: 'Overview' }).click();
  await expect(panel.getByRole('heading', { name: 'Focus · 2 of 3' })).toBeVisible();
});

test('the page keeps its controls in the Display menu', async ({ demo: page }) => {
  await go(page, '#/map');
  // Nothing but the title line sits above the map.
  await expect(page.getByRole('dialog', { name: 'Display' })).toHaveCount(0);
  await expect(page.locator('.maplegend')).toHaveCount(0);
  await page.locator('.pactions').getByRole('button', { name: 'Display' }).click();
  const menu = page.getByRole('dialog', { name: 'Display' });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('the workspace and the parts chosen in Display decide what is drawn', async ({ demo: page }) => {
  await go(page, '#/map');
  const display = page.locator('.pactions').getByRole('button', { name: 'Display' });
  await display.click();
  const menu = page.getByRole('dialog', { name: 'Display' });
  const scope = menu.getByRole('group', { name: 'Workspaces' });
  await scope.getByRole('button', { name: 'My projects' }).click();
  await expect(mark(page, 'home')).toBeVisible();
  await expect(mark(page, 'site')).toHaveCount(0);
  // The centre counts what is on the map, not the account.
  await expect(mark(page, 'root').locator('.mapmark-count')).toHaveText('18');
  // The button says something is no longer as the page starts out.
  await expect(display.locator('.displaycount')).toHaveText('1');

  await scope.getByRole('button', { name: 'Any' }).click();
  await menu.getByRole('group', { name: 'Parts of the map' })
    .getByRole('button', { name: /Client work/ }).click();
  await expect(mark(page, 'client-a')).toHaveCount(0);
  await expect(mark(page, 'clients')).toHaveCount(0);
  await expect(mark(page, 'site')).toBeVisible();

  await menu.getByRole('button', { name: 'Reset all' }).click();
  await expect(mark(page, 'client-a')).toBeVisible();
  await expect(display.locator('.displaycount')).toHaveCount(0);
});

test('a status switched off in Display leaves the map', async ({ demo: page }) => {
  await go(page, '#/map');
  await page.locator('.pactions').getByRole('button', { name: 'Display' }).click();
  const menu = page.getByRole('dialog', { name: 'Display' });
  await menu.getByRole('group', { name: 'Statuses' }).getByRole('button', { name: /Moving/ }).click();
  await expect(mark(page, 'site')).toHaveCount(0);
  await expect(mark(page, 'root')).toBeVisible();

  await menu.getByRole('switch', { name: 'Legend under the map' }).click();
  await expect(page.locator('.maplegend')).toBeVisible();
});

test('a tile lights its projects on the map and lists them', async ({ demo: page }) => {
  await go(page, '#/map');
  const panel = page.locator('.mappanel');
  await panel.locator('.maptile', { hasText: 'Nearly done' }).click();
  await expect(panel.locator('.maprow')).toHaveCount(2);
  await expect(mark(page, 'home')).toHaveClass(/dim/);
  await expect(mark(page, 'client-a')).not.toHaveClass(/dim/);
});

test('marking a project as ongoing takes it out of what there is to finish', async ({ demo: page }) => {
  await go(page, '#/map');
  const panel = page.locator('.mappanel');
  await mark(page, 'client-a').locator('.mapmark-body').click();
  await panel.getByRole('button', { name: 'Mark as ongoing' }).click();
  await expect(panel.locator('.mapstatus')).toHaveText('Ongoing');
  await panel.getByRole('button', { name: 'Overview' }).click();
  await expect(panel.locator('.maptile', { hasText: 'Nearly done' }).locator('.maptile-num')).toHaveText('1');
});
