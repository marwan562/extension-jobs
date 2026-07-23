import { expect, test } from '@playwright/test';
import axe from 'axe-core';

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('./');
  await page.getByLabel('Pairing code').fill('dashboard-e2e');
  await page.getByRole('button', { name: 'Open dashboard' }).click();
  await expect(page.getByRole('heading', { name: 'Good decisions, clearly queued.' })).toBeVisible();
}

test('authenticated dashboard supports keyboard navigation and real daemon data', async ({ page }) => {
  await signIn(page);
  await expect(page.getByText('4', { exact: true }).first()).toBeVisible();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await page.getByPlaceholder('Go to a workspace…').fill('jobs');
  await page.getByRole('option', { name: /Jobs/ }).click();
  await expect(page.getByRole('heading', { name: 'Jobs Explorer' })).toBeVisible();
  await expect(page.getByText('Staff Platform Engineer')).toBeVisible();
  await expect(page.getByLabel('Saved view')).toBeVisible();
  await expect(page.getByLabel('Clear filters')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByText('Staff Platform Engineer').click();
  await expect(page.getByRole('heading', { name: 'Staff Platform Engineer' })).toBeVisible();
  await expect(page.getByText('Automation remains policy-bound')).toBeVisible();
});

test('key pages have no serious axe violations and remain visually stable', async ({ page }, testInfo) => {
  await signIn(page);
  await page.evaluate(axe.source);
  const violations = await page.evaluate(async () => {
    const result = await (window as unknown as { axe: { run: () => Promise<{ violations: Array<{ id: string; impact: string | null }> }> } }).axe.run();
    return result.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious');
  });
  expect(violations).toEqual([]);
  await expect(page).toHaveScreenshot(`overview-${testInfo.project.name}-light.png`, { fullPage: true });
  await page.evaluate(() => localStorage.setItem('extension-jobs-theme', 'dark'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Good decisions, clearly queued.' })).toBeVisible();
  await expect(page).toHaveScreenshot(`overview-${testInfo.project.name}-dark.png`, { fullPage: true });
  if (testInfo.project.name === 'desktop') {
    await page.getByRole('link', { name: 'Jobs', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Jobs Explorer' })).toBeVisible();
    await expect(page).toHaveScreenshot('jobs-desktop-dark.png', { fullPage: true });
    await page.getByText('Staff Platform Engineer').click();
    await expect(page.getByRole('heading', { name: 'Staff Platform Engineer' })).toBeVisible();
    await expect(page).toHaveScreenshot('job-detail-desktop-dark.png', { fullPage: true });
    await page.getByLabel('Close details').last().click();
    await page.getByRole('link', { name: 'Resume Studio' }).click();
    await expect(page.getByRole('heading', { name: 'Resume Studio' })).toBeVisible();
    await expect(page).toHaveScreenshot('resume-studio-desktop-dark.png', { fullPage: true });
    await page.getByRole('link', { name: 'Applications' }).click();
    await expect(page.getByRole('heading', { name: 'Applications', exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot('applications-desktop-dark.png', { fullPage: true });
    await page.getByRole('link', { name: 'Approvals' }).click();
    await expect(page.getByRole('heading', { name: 'Approval Center' })).toBeVisible();
    await expect(page).toHaveScreenshot('approvals-desktop-dark.png', { fullPage: true });
    await page.getByRole('link', { name: 'Campaigns' }).click();
    await expect(page.getByRole('heading', { name: 'Campaigns' })).toBeVisible();
    await expect(page).toHaveScreenshot('campaigns-desktop-dark.png', { fullPage: true });
    await page.getByRole('link', { name: 'Connectors' }).click();
    await expect(page.getByRole('heading', { name: 'Connectors' })).toBeVisible();
    await expect(page).toHaveScreenshot('connectors-desktop-dark.png', { fullPage: true });
  }
});
