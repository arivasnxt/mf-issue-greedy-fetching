import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1, // Single worker to avoid port conflicts
  reporter: [['list'], ['html']],
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Web servers for the Module Federation distributed system
  webServer: [
    {
      command: 'cd remote-app && npm run dev',
      port: 8081,
      reuseExistingServer: false, // Force restart to pick up CORS config
      timeout: 120000,
    },
    {
      command: 'cd fallback-remote-app && npm run dev', 
      port: 8082,
      reuseExistingServer: false, // Force restart to pick up CORS config
      timeout: 120000,
    },
    {
      command: 'cd host-app && npm run dev',
      port: 8080,
      reuseExistingServer: false, // Force restart to pick up CORS config
      timeout: 120000,
    },
  ],

  // Global teardown to ensure clean port cleanup
  globalTeardown: require.resolve('./e2e/global-teardown.ts'),
});