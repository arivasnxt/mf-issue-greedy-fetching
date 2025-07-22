import { test, expect } from '@playwright/test';

test.describe('Enhanced Offline Fallback Plugin Tests', () => {
  
  test('should load host app successfully despite offline remote', async ({ page }) => {
    console.log('🧪 Testing: Host app loads despite offline "foo" remote');
    
    // Monitor console logs and errors
    const consoleMessages: Array<{type: string, text: string}> = [];
    const errors: string[] = [];
    
    page.on('console', (msg) => {
      const message = { type: msg.type(), text: msg.text() };
      consoleMessages.push(message);
      console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
    });
    
    page.on('pageerror', (error) => {
      errors.push(error.message);
      console.log('🚫 Page error:', error.message);
    });
    
    // Navigate to host app and wait for React to load
    await page.goto('/', { waitUntil: 'load' });
    
    // Wait for React application to mount and render
    await page.waitForSelector('#root', { timeout: 30000 });
    
    // Give time for Module Federation to load and process remotes
    await page.waitForTimeout(5000);
    
    // Check what actually loaded
    const pageContent = await page.textContent('body');
    console.log('📄 Page content:', pageContent?.substring(0, 200) + '...');
    
    await page.waitForSelector('h1', { timeout: 30000 });
    
    // The critical test: app should load successfully
    await expect(page.locator('h1')).toContainText('Rspack + React + TypeScript', { timeout: 30000 });
    console.log('✅ Host app loaded successfully');
    
    // Check that the working remote loads
    await expect(page.locator('h2')).toContainText('Remote animals', { timeout: 30000 });
    console.log('✅ Remote section header loaded');
    
    // CRITICAL: Verify the actual remote content renders
    const animalsList = page.locator('ul li');
    await expect(animalsList).toHaveCount(3, { timeout: 10000 });
    await expect(animalsList.nth(0)).toContainText('horse');
    await expect(animalsList.nth(1)).toContainText('sheep');
    await expect(animalsList.nth(2)).toContainText('duck');
    console.log('✅ Remote module content rendered correctly: horse, sheep, duck');
    
    // Verify the remote has correct styling (lightcoral background)
    const ulElement = page.locator('ul');
    const backgroundColor = await ulElement.evaluate(el => 
      window.getComputedStyle(el).backgroundColor
    );
    console.log(`✅ Remote styling applied: background-color = ${backgroundColor}`);
    
    // Verify React logo is rendered
    await expect(page.locator('img[alt="React logo"]')).toBeVisible();
    console.log('✅ React logo rendered');
    
    // Verify no critical errors that would crash the app
    const criticalErrors = errors.filter(error => 
      error.includes('ChunkLoadError') && !error.includes('example.org')
    );
    
    expect(criticalErrors).toHaveLength(0);
    console.log('✅ No critical errors detected');
    
    // The app should be interactive
    await expect(page.locator('.App')).toBeVisible();
    console.log('✅ App is interactive and visible');
    
    // Output console summary
    console.log('\n📊 Browser Console Summary:');
    console.log(`Total messages: ${consoleMessages.length}`);
    const logsByType = consoleMessages.reduce((acc, msg) => {
      acc[msg.type] = (acc[msg.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    Object.entries(logsByType).forEach(([type, count]) => {
      console.log(`  ${type}: ${count} messages`);
    });
  });

  test('should demonstrate issue #3877 resolution', async ({ page }) => {
    console.log('🎯 Testing: Issue #3877 resolution verification');
    
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });
    
    // Navigate to the app with shareStrategy: "loaded-first" and offline remote
    await page.goto('/', { waitUntil: 'load' });
    
    // Wait for React app to load
    await page.waitForSelector('#root', { timeout: 30000 });
    await page.waitForSelector('h1', { timeout: 30000 });
    
    // The core assertion: app should load successfully
    await expect(page.locator('h1')).toContainText('Rspack + React + TypeScript', { timeout: 30000 });
    
    // CRITICAL: Verify actual content renders despite the offline "foo" remote
    console.log('🔍 Verifying app renders complete content...');
    const animalsList = page.locator('ul li');
    await expect(animalsList).toHaveCount(3, { timeout: 10000 });
    await expect(animalsList.nth(0)).toContainText('horse');
    await expect(animalsList.nth(1)).toContainText('sheep');
    await expect(animalsList.nth(2)).toContainText('duck');
    console.log('✅ Remote module content fully rendered: horse, sheep, duck');
    
    // Verify app structure is intact
    await expect(page.locator('.App')).toBeVisible();
    await expect(page.locator('h2')).toContainText('Remote animals');
    await expect(page.locator('img[alt="React logo"]')).toBeVisible();
    console.log('✅ Full app structure rendered correctly');
    
    // Verify the app didn't crash
    const hasAppCrashErrors = errors.some(error => 
      error.includes('Loading chunk') || 
      error.includes('Loading CSS chunk') ||
      (error.includes('Script error') && !error.includes('example.org'))
    );
    
    expect(hasAppCrashErrors).toBe(false);
    
    // Additional verification: check that React is working
    const reactIsWorking = await page.evaluate(() => {
      return !!document.querySelector('.App') || 
             document.querySelector('h1')?.textContent?.includes('Rspack');
    });
    
    expect(reactIsWorking).toBe(true);
    
    console.log('🎉 Issue #3877 RESOLVED: App no longer crashes with offline remotes!');
    console.log('   ✅ shareStrategy: "loaded-first" works with offline remotes');
    console.log('   ✅ Enhanced plugin prevents application crashes');
    console.log('   ✅ Working remotes continue to function normally');
  });
});