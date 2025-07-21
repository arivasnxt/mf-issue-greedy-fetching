import { Page, ConsoleMessage } from '@playwright/test';

export interface ConsoleCapture {
  messages: Array<{
    type: string;
    text: string;
    location?: string;
    timestamp: number;
  }>;
  errors: Array<{
    message: string;
    timestamp: number;
  }>;
}

export function setupConsoleCapture(page: Page): ConsoleCapture {
  const capture: ConsoleCapture = {
    messages: [],
    errors: []
  };

  // Capture all console messages with more detail
  page.on('console', (msg: ConsoleMessage) => {
    const location = msg.location();
    capture.messages.push({
      type: msg.type(),
      text: msg.text(),
      location: location ? `${location.url}:${location.lineNumber}:${location.columnNumber}` : undefined,
      timestamp: Date.now()
    });

    // Always log to test output for debugging
    const prefix = `[BROWSER ${msg.type().toUpperCase()}]`;
    const locationStr = location ? ` at ${location.url}:${location.lineNumber}` : '';
    console.log(`${prefix} ${msg.text()}${locationStr}`);
  });

  // Capture page errors
  page.on('pageerror', (error) => {
    capture.errors.push({
      message: error.message,
      timestamp: Date.now()
    });
    console.log('🚫 [PAGE ERROR]', error.message);
  });

  // Capture unhandled promise rejections
  page.on('error', (error) => {
    capture.errors.push({
      message: error.message,
      timestamp: Date.now()
    });
    console.log('💥 [UNHANDLED ERROR]', error.message);
  });

  return capture;
}

export function dumpConsoleCapture(capture: ConsoleCapture, testName: string) {
  console.log(`\n📊 Console Summary for "${testName}":`);
  console.log(`Total messages: ${capture.messages.length}`);
  console.log(`Total errors: ${capture.errors.length}`);

  // Group messages by type
  const messagesByType = capture.messages.reduce((acc, msg) => {
    acc[msg.type] = (acc[msg.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('\nMessage breakdown:');
  Object.entries(messagesByType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

  // Show warnings and errors in detail
  const importantMessages = capture.messages.filter(msg => 
    ['warning', 'error', 'assert'].includes(msg.type)
  );

  if (importantMessages.length > 0) {
    console.log('\n⚠️  Warnings and Errors:');
    importantMessages.forEach(msg => {
      console.log(`  [${msg.type}] ${msg.text}`);
      if (msg.location) {
        console.log(`    Location: ${msg.location}`);
      }
    });
  }

  if (capture.errors.length > 0) {
    console.log('\n❌ Page Errors:');
    capture.errors.forEach(err => {
      console.log(`  ${err.message}`);
    });
  }

  // Module Federation specific logs
  const mfLogs = capture.messages.filter(msg => 
    msg.text.includes('Federation') || 
    msg.text.includes('OfflineFallbackPlugin') ||
    msg.text.includes('remote')
  );

  if (mfLogs.length > 0) {
    console.log('\n🔗 Module Federation Activity:');
    mfLogs.forEach(msg => {
      console.log(`  [${msg.type}] ${msg.text}`);
    });
  }
}

export function assertNoFatalErrors(capture: ConsoleCapture) {
  // Check for fatal errors that would crash the app
  const fatalErrors = capture.errors.filter(error => 
    !error.message.includes('Failed to fetch') &&
    !error.message.includes('Federation Runtime') &&
    !error.message.includes('example.org') &&
    !error.message.includes('CORS')
  );

  if (fatalErrors.length > 0) {
    console.log('\n💀 FATAL ERRORS DETECTED:');
    fatalErrors.forEach(err => {
      console.log(`  ${err.message}`);
    });
    throw new Error(`Test failed due to ${fatalErrors.length} fatal errors`);
  }
}