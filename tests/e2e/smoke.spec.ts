import { expect, test } from '@playwright/test';

test('the page loads and shows the title', async ({ page }) => {
  await page.goto('/#game');
  await expect(page.getByRole('heading', { name: 'Mining Game' })).toBeVisible();
  await expect(page.getByTestId('status')).toContainText('Engine v');
});
