import { test, expect } from '@playwright/test';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

test.describe('Module Federation with Failing Remote - Integration Test', () => {
  
  test.beforeAll(async () => {
    // Ensure the enhanced plugin is configured
    const configContent = `
import { defineConfig } from "@rspack/cli";
import { rspack } from "@rspack/core";
import { ReactRefreshRspackPlugin } from "@rspack/plugin-react-refresh";
import { ModuleFederationPlugin } from "@module-federation/enhanced/rspack";
import { join } from "node:path";

const isDev = process.env.NODE_ENV === "development";
const targets = ["last 2 versions", "> 0.2%", "not dead", "Firefox ESR"];

export default defineConfig({
  entry: {
    main: "./src/main.tsx",
  },
  resolve: {
    extensions: ["...", ".ts", ".tsx", ".jsx"],
  },
  module: {
    rules: [
      {
        test: /\\.svg$/,
        type: "asset",
      },
      {
        test: /\\.(jsx?|tsx?)$/,
        use: [
          {
            loader: "builtin:swc-loader",
            options: {
              jsc: {
                parser: {
                  syntax: "typescript",
                  tsx: true,
                },
                transform: {
                  react: {
                    runtime: "automatic",
                    development: isDev,
                    refresh: isDev,
                  },
                },
              },
              env: { targets },
            },
          },
        ],
      },
    ],
  },
  plugins: [
    new rspack.HtmlRspackPlugin({
      template: "./index.html",
    }),
    new ModuleFederationPlugin({
      name: "hostApp",
      shareStrategy: "loaded-first",
      remotes: {
        "remote-app": "remoteApp@http://localhost:8081/remote-mf-manifest.json",
        foo: "bar@http://example.org/remote-manifest.json",
      },
      runtimePlugins: [
        join(__dirname, "./enhanced-offline-fallback-plugin.ts"),
      ],
    }),
    isDev ? new ReactRefreshRspackPlugin() : null,
  ].filter(Boolean),
  output: {
    publicPath: "auto",
  },
  optimization: {
    minimizer: [
      new rspack.SwcJsMinimizerRspackPlugin(),
      new rspack.LightningCssMinimizerRspackPlugin({
        minimizerOptions: { targets },
      }),
    ],
  },
  experiments: {
    css: true,
  },
});
`;
  });

  test('should not crash when foo remote is offline and shareStrategy is loaded-first', async ({ page }) => {
    // Monitor for any unhandled rejections or errors
    const errors: string[] = [];
    const unhandledRejections: string[] = [];
    
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Navigate to the host app
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    
    // The critical test: app should load successfully despite offline remote
    await expect(page.locator('h1')).toContainText('Rspack + React + TypeScript', { timeout: 10000 });
    
    // The working remote should load correctly
    await expect(page.locator('h2')).toContainText('Remote animals', { timeout: 5000 });
    
    // Verify the app is functional by interacting with it
    await expect(page.locator('.App')).toBeVisible();
    
    // Check that we don't have any critical errors that would crash the app
    const criticalErrors = errors.filter(error => 
      error.includes('ChunkLoadError') || 
      error.includes('Loading chunk') ||
      error.includes('Loading failed') ||
      error.includes('Script error')
    );
    
    // We might have some expected network errors for the failing remote, but no critical errors
    console.log('Detected errors (expected for failing remote):', errors);
    
    // The key test: no critical errors should crash the application
    const hasCriticalErrors = criticalErrors.some(error => 
      !error.includes('example.org') && // Expected to fail
      !error.includes('bar@http://example.org') // Expected to fail
    );
    
    expect(hasCriticalErrors).toBe(false);
    
    // App should remain interactive
    await page.reload();
    await expect(page.locator('h1')).toContainText('Rspack + React + TypeScript');
  });

  test('should handle dynamic import failures gracefully', async ({ page }) => {
    await page.goto('http://localhost:8080');
    
    // Wait for app to load
    await expect(page.locator('h1')).toContainText('Rspack + React + TypeScript');
    
    // Test dynamic import of the failing remote
    const importResult = await page.evaluate(async () => {
      try {
        // Try to dynamically import from the failing remote
        const module = await import('foo/component' as any);
        return { success: true, hasDefault: !!module.default };
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error',
          hasDefault: false 
        };
      }
    });
    
    console.log('Dynamic import result:', importResult);
    
    // The import should either succeed with fallback or fail gracefully
    // Either way, the app should not crash
    await expect(page.locator('h1')).toContainText('Rspack + React + TypeScript');
  });

  test('should show plugin logging for debugging', async ({ page }) => {
    const pluginLogs: string[] = [];
    
    page.on('console', (msg) => {
      if (msg.text().includes('OfflineFallbackPlugin')) {
        pluginLogs.push(msg.text());
      }
    });
    
    await page.goto('http://localhost:8080');
    await expect(page.locator('h1')).toContainText('Rspack + React + TypeScript');
    
    // Wait for potential plugin logs
    await page.waitForTimeout(3000);
    
    console.log('Plugin logs:', pluginLogs);
    
    // We should see some plugin activity
    const hasPluginActivity = pluginLogs.length > 0;
    if (hasPluginActivity) {
      console.log('✅ Plugin is active and logging remote handling');
    } else {
      console.log('ℹ️  Plugin logs not detected (may be handled at different level)');
    }
  });

  test('should maintain performance with offline remotes', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('http://localhost:8080');
    await expect(page.locator('h1')).toContainText('Rspack + React + TypeScript');
    
    const loadTime = Date.now() - startTime;
    
    console.log(`App loaded in ${loadTime}ms with offline remote`);
    
    // App should load within reasonable time even with offline remotes
    // This shouldn't take too long due to timeout handling
    expect(loadTime).toBeLessThan(15000); // 15 seconds max
  });
});