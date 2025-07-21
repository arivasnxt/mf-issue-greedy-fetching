# Enhanced Offline Remote Fallback Solution

This solution addresses [Module Federation Core Issue #3877](https://github.com/module-federation/core/issues/3877) where applications crash when a remote manifest cannot be fetched.

## Problem (As Stated in README)

The specific issue reproduced in this repository:
- The host app has a remote configuration: `foo: "bar@http://example.org/remote-manifest.json"`
- This remote URL does not exist (example.org/remote-manifest.json is not a real Module Federation remote)
- When the host app starts with this configuration, **the entire application crashes**
- **Critical:** The crash occurs even though:
  - The `foo` remote is never imported or used anywhere in the codebase
  - Error boundaries are implemented in the React components
  - The application only uses the working `remote-app` remote

The root cause: With `shareStrategy: "loaded-first"`, Module Federation attempts to fetch all remote manifests at startup, and a single fetch failure crashes the entire application.

## Solution: Enhanced Offline Fallback Plugin

The `enhanced-offline-fallback-plugin.ts` provides comprehensive handling for offline remotes with the following features:

### Key Features

1. **Comprehensive Error Handling**
   - Handles errors at all lifecycle stages (`beforeRequest`, `loadEntry`, `onLoad`)
   - Prevents application crashes from remote loading failures
   - Provides meaningful fallback components

2. **Circuit Breaker Pattern**
   - Automatically opens circuit after configurable failure threshold
   - Prevents repeated failed requests to offline remotes
   - Auto-resets after timeout period

3. **Retry Logic with Exponential Backoff**
   - Configurable retry attempts
   - Exponential delay between retries
   - Timeout handling for stuck requests

4. **Graceful Fallback Components**
   - Automatic fallback UI for failed remotes
   - Custom fallback components per remote
   - Error details display for debugging

5. **Performance Optimizations**
   - Fallback module caching
   - Circuit breaker to prevent resource waste
   - Configurable timeouts

### Configuration

```typescript
const plugin = enhancedOfflineFallbackPlugin({
  enableLogging: true,                    // Enable detailed logging
  fallbackTimeout: 5000,                 // Request timeout in ms
  retryAttempts: 2,                       // Number of retry attempts
  retryDelay: 1000,                       // Base retry delay in ms
  enableCircuitBreaker: true,             // Enable circuit breaker
  circuitBreakerThreshold: 3,             // Failures before opening circuit
  circuitBreakerResetTimeout: 60000,      // Circuit reset time in ms
  fallbackComponents: {                   // Custom fallback components
    'remote-name': CustomFallbackComponent
  }
});
```

### Usage

1. **Replace existing plugins** in `rspack.config.ts`:

```typescript
import enhancedOfflineFallbackPlugin from './enhanced-offline-fallback-plugin';

export default defineConfig({
  plugins: [
    new ModuleFederationPlugin({
      name: "hostApp",
      shareStrategy: "loaded-first", // Can now be used safely
      remotes: {
        "remote-app": "remoteApp@http://localhost:8081/remote-mf-manifest.json",
        foo: "bar@http://example.org/remote-manifest.json", // This can be offline
      },
      runtimePlugins: [
        join(__dirname, "./enhanced-offline-fallback-plugin.ts"),
      ],
    }),
  ],
});
```

2. **Install dependencies** if not already present:

```bash
npm install @module-federation/enhanced
```

## Testing

### E2E Testing with Playwright

The solution includes comprehensive Playwright tests:

```bash
# Install test dependencies
npm install

# Install Playwright browsers
npx playwright install

# Run E2E tests
npm run test:e2e
```

### Manual Testing (Reproducing the README Issue)

```bash
# Terminal 1: Start remote app
cd remote-app && npm run dev

# Terminal 2: Start fallback remote  
cd fallback-remote-app && npm run dev

# Terminal 3: Start host app with enhanced plugin
cd host-app && npm run dev

# Navigate to http://localhost:8080
# ✅ SUCCESS: App loads successfully despite foo@example.org being offline
# ✅ The working remote (remote-app) displays "horse, sheep, duck"
# ✅ No crash occurs even though foo remote cannot be fetched
# ✅ This solves the exact problem described in the README
```

### Test Script

Run the automated test script:

```bash
node test-solution.js
```

## Test Cases Covered

1. **Basic Functionality**: App loads when all remotes are available
2. **Offline Remote Handling**: App loads despite offline remotes
3. **Network Error Handling**: Graceful handling of network failures
4. **Dynamic Import Fallbacks**: Proper fallback for dynamically imported remotes
5. **Recovery Testing**: App recovers when remotes come back online
6. **Multiple Remote Failures**: Handles simultaneous remote failures
7. **Performance Testing**: Maintains reasonable load times

## Technical Implementation

### Hook Coverage

The plugin implements these Module Federation runtime hooks:

- `beforeRequest`: Circuit breaker logic and request logging
- `errorLoadRemote`: Primary error handling with lifecycle-aware fallbacks
- `onLoad`: Success tracking for circuit breaker reset
- `init`: Plugin initialization and logging

### Error Lifecycle Handling

```typescript
errorLoadRemote({ id, error, lifecycle }) {
  switch (lifecycle) {
    case 'beforeRequest':
    case 'loadEntry':
      // Manifest loading failed - provide fallback module
      return createFallbackModule(id, error);
      
    case 'onLoad':  
      // Module loading failed - provide fallback factory
      return () => createFallbackModule(id, error);
      
    default:
      // Generic fallback for any other lifecycle
      return createFallbackModule(id, error);
  }
}
```

### Fallback Component Structure

The plugin creates structured fallback components:

```jsx
<div style={errorStyles}>
  <h3>Remote Module Unavailable</h3>
  <p>The remote module "{remoteId}" is currently offline or unavailable.</p>
  <details>
    <summary>Error Details</summary>
    <pre>{error.message}</pre>
  </details>
</div>
```

## Verification: README Problem Solved

### Before (Without Plugin)
- Host app with `foo: "bar@http://example.org/remote-manifest.json"` crashes on startup
- White screen of death
- Console shows: `Failed to fetch` and application stops
- Even though `foo` remote is never imported or used

### After (With Enhanced Plugin)
- Host app starts successfully with the same configuration
- Application renders normally: "Rspack + React + TypeScript" header appears
- Working remote (`remote-app`) loads and displays: "horse, sheep, duck"
- Console shows controlled warnings but no fatal errors
- The non-existent `foo` remote is handled gracefully

This directly solves the issue described in the README where "a missing remote will make our whole application unusable."

## Benefits

1. **Application Stability**: No more crashes from offline remotes
2. **Developer Experience**: Clear error messages and debugging info
3. **User Experience**: Graceful degradation instead of white screen
4. **Performance**: Circuit breaker prevents wasted resources
5. **Monitoring**: Comprehensive logging for production debugging
6. **Flexibility**: Configurable behavior and custom fallbacks

## Migration

To migrate from existing error handling:

1. Replace existing runtime plugins with `enhanced-offline-fallback-plugin`
2. Remove custom error boundaries specifically for remote loading
3. Enable `shareStrategy: "loaded-first"` if desired
4. Configure plugin options based on your requirements
5. Test thoroughly with your specific remote setup

## Production Considerations

- **Monitoring**: Use the logging output for monitoring offline remotes
- **Alerting**: Set up alerts when circuit breakers open frequently  
- **Fallbacks**: Design meaningful fallback experiences for users
- **Recovery**: Plan for how users can retry or refresh when remotes recover
- **Performance**: Tune timeout and retry settings for your network conditions

This solution transforms Module Federation from fragile to resilient, enabling applications to gracefully handle the reality of distributed systems where remotes can be temporarily unavailable.