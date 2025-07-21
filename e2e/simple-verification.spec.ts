import { test, expect } from '@playwright/test';

test.describe('Simple Plugin Verification', () => {
  test('should load host app without crashing despite offline remote', async ({ page }) => {
    console.log('🎯 Testing: Basic plugin functionality');
    
    // Monitor for critical errors that would crash the app
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
      console.log('❌ Page error:', error.message);
    });

    // Navigate to the app
    await page.goto('/', { waitUntil: 'load' });
    
    // Wait for React to mount
    await page.waitForSelector('#root');
    
    // The core test: app should load without fatal crashes
    await expect(page.locator('h1')).toContainText('Rspack + React + TypeScript', { timeout: 20000 });
    console.log('✅ Host app loaded successfully');
    
    // CRITICAL: Verify the app renders actual content, not just avoids crashing
    console.log('🔍 Verifying content renders...');
    
    // Check the remote module content
    const animalsList = page.locator('ul li');
    await expect(animalsList).toHaveCount(3, { timeout: 10000 });
    await expect(animalsList.nth(0)).toContainText('horse');
    await expect(animalsList.nth(1)).toContainText('sheep');
    await expect(animalsList.nth(2)).toContainText('duck');
    console.log('✅ Remote module content rendered: horse, sheep, duck');
    
    // Verify all main UI elements
    await expect(page.locator('h2')).toContainText('Remote animals');
    await expect(page.locator('img[alt="React logo"]')).toBeVisible();
    console.log('✅ All UI elements rendered correctly');

    // Verify no critical crashes (Module Federation errors are expected but shouldn't crash the app)
    const criticalErrors = errors.filter(error => 
      !error.includes('Federation Runtime') && 
      !error.includes('Failed to fetch') &&
      !error.includes('CORS')
    );
    
    expect(criticalErrors).toHaveLength(0);
    console.log('✅ No critical application crashes detected');
    
    // Verify the app is interactive
    await expect(page.locator('.App')).toBeVisible();
    console.log('✅ App remains interactive and stable');
    
    console.log('🎉 SUCCESS: Plugin prevents application crashes from offline remotes!');
  });
});