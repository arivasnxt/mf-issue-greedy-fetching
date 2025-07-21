import { FullConfig } from '@playwright/test';
import { execSync } from 'child_process';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Global Teardown: Cleaning up Module Federation services...');
  
  try {
    // Kill processes on dev server ports to ensure clean teardown
    console.log('🔌 Killing processes on ports 8080, 8081, 8082...');
    execSync('npx kill-port 8080 8081 8082', { stdio: 'pipe' });
    console.log('✅ All dev server processes terminated');
  } catch (error) {
    console.log('ℹ️  No processes found on dev server ports (already clean)');
  }
  
  console.log('✅ Global Teardown Complete');
}

export default globalTeardown;