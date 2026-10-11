import { test as base, expect } from '@playwright/test';

/**
 * Dutch, the third language: picked for a Dutch browser, offered beside the
 * other two, and read in what is typed — the date, and the repeat rule.
 */
const test = base.extend({ locale: 'nl-NL' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('skipSetup', '1'); });
  await page.goto('/');
});

test('a Dutch browser gets the app in Dutch, and can change its mind', async ({ page }) => {
  const languages = page.getByRole('group', { name: 'Taal' });
  await expect(languages.getByRole('button', { name: 'Nederlands' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Inloggen' })).toBeVisible();

  await languages.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();
  await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'Nederlands' }).click();

  await page.getByRole('button', { name: 'Verkennen met demogegevens' }).click();
  await expect(page.getByRole('heading', { name: 'Mijn week' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
});

test('a date and a repeat rule typed in Dutch are read', async ({ page }) => {
  await page.getByRole('button', { name: 'Verkennen met demogegevens' }).click();
  const add = page.locator('.sidebar').getByRole('button', { name: 'Taak toevoegen' }).first();

  await add.click();
  await page.keyboard.type('Offerte sturen morgen om 14:00');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Morgen 14:00')).toBeVisible();
  await page.keyboard.press('Escape');

  await add.click();
  await page.keyboard.type('Planten water geven elke maandag om 9 uur');
  // The rule is shown as it goes to Todoist: in Dutch, in the words Todoist lists.
  await expect(page.getByRole('dialog').getByText('elke maandag om 9', { exact: true })).toBeVisible();
});
