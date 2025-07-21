# Module Federation Runtime Hooks Analysis

## Understanding How Fallbacks Work in loadRemote Failures

This analysis explains how our solution prevents the crash described in the README when the `foo: "bar@http://example.org/remote-manifest.json"` remote cannot be fetched.

Based on detailed analysis of the Module Federation runtime core (`/Users/bytedance/dev/universe/packages/runtime-core`), here's how runtime hooks and fallbacks work:

## Hook System Architecture

The Module Federation runtime uses a sophisticated plugin system built on four main hook types:

### Hook Types
1. **SyncHook** - Synchronous execution
2. **AsyncHook** - Asynchronous execution with abort capability  
3. **SyncWaterfallHook** - Synchronous data transformation pipeline
4. **AsyncWaterfallHook** - Asynchronous data transformation pipeline

## Key Runtime Hooks for Remote Loading

### 1. `errorLoadRemote` Hook
**Most Critical for Fallback Handling**

```typescript
errorLoadRemote: new AsyncHook<
  [
    {
      id: string;
      error: unknown;
      options?: any;
      from: CallFrom;
      lifecycle: 'beforeRequest' | 'beforeLoadShare' | 'afterResolve' | 'onLoad';
      origin: ModuleFederation;
    },
  ],
  void | unknown
>('errorLoadRemote')
```

### 2. Lifecycle Stages Where Errors Occur

#### a) **beforeRequest** - Initial Request Processing
- **Location**: `/packages/runtime-core/src/remote/index.ts:328-351`
- **Purpose**: Preprocesses module requests before fetching
- **Fallback Strategy**: Return modified request args or alternative configuration

#### b) **afterResolve** - Manifest Resolution Stage  
- **Location**: `/packages/runtime-core/src/plugins/snapshot/SnapshotHandler.ts:298-305`
- **Purpose**: After manifest is fetched and parsed
- **Fallback Strategy**: Return alternative manifest data or backup entry points

#### c) **onLoad** - Module Loading Stage
- **Location**: `/packages/runtime-core/src/remote/index.ts:254-267` 
- **Purpose**: During actual module loading and execution
- **Fallback Strategy**: Return fallback component/module factory

#### d) **beforeLoadShare** - Shared Dependency Loading
- **Location**: `/packages/runtime-core/src/shared/index.ts:319-325`
- **Purpose**: When loading shared dependencies fails
- **Fallback Strategy**: Return alternative shared modules

## How Fallbacks Work

### Pattern 1: Component-Level Fallbacks (onLoad)
```typescript
async errorLoadRemote(args) {
  if (args.lifecycle === 'onLoad') {
    // Return a factory function that provides fallback component
    return () => ({
      __esModule: true,
      default: FallbackComponent,
    });
  }
}
```

### Pattern 2: Manifest-Level Fallbacks (afterResolve) 
```typescript
async errorLoadRemote(args) {
  if (args.lifecycle === 'afterResolve') {
    try {
      // Try alternative manifest source
      const backupManifest = await fetch(backupUrl);
      return backupManifest.json();
    } catch (error) {
      return args; // Continue with original (will likely fail)
    }
  }
}
```

### Pattern 3: Request-Level Fallbacks (beforeRequest)
```typescript
async errorLoadRemote(args) {
  if (args.lifecycle === 'beforeRequest') {
    // Return modified request parameters
    return {
      ...args,
      id: `backup-${args.id}`, // Try backup remote
    };
  }
}
```

## Critical Insights for Our Plugin

### 1. Return Value Semantics
- **Return falsy** (`false`, `null`, `undefined`) → No fallback, original error thrown
- **Return data/function** → Use as replacement/fallback
- **Return modified args** → Continue with modified parameters

### 2. Lifecycle-Specific Handling
Our plugin should handle each lifecycle differently:
- **beforeRequest**: Alternative remote configurations
- **afterResolve**: Backup manifest sources  
- **onLoad**: UI component fallbacks
- **beforeLoadShare**: Alternative shared dependencies

### 3. Circuit Breaker Integration
The runtime doesn't have built-in circuit breakers, so our plugin's circuit breaker pattern is valuable for:
- Preventing repeated failed requests
- Faster fallback responses
- Reduced network overhead

### 4. Hook Execution Context
Hooks are executed within specific handlers:
- **RemoteHandler** - Remote module lifecycle
- **SharedHandler** - Shared dependencies
- **SnapshotHandler** - Manifest loading
- **Module** - Individual module execution

## How Our Plugin Solves the README Problem

### The Crash Scenario (Without Plugin)
1. Host app configures: `foo: "bar@http://example.org/remote-manifest.json"`
2. With `shareStrategy: "loaded-first"`, Module Federation eagerly fetches all remotes at startup
3. Fetch to `http://example.org/remote-manifest.json` fails (404/network error)
4. `errorLoadRemote` hook is called with `lifecycle: 'afterResolve'`
5. **Without our plugin**: No handler returns a fallback, error propagates, app crashes
6. Result: White screen, even though `foo` is never imported

### The Solution (With Our Plugin)
1. Same configuration and fetch attempt
2. Fetch fails, `errorLoadRemote` hook called
3. **Our plugin intercepts** at `afterResolve` lifecycle:
   ```typescript
   if (lifecycle === 'afterResolve') {
     // Return a fallback module instead of crashing
     return createFallbackModule(remoteId, error);
   }
   ```
4. Module Federation receives the fallback module and continues
5. App loads successfully, working remotes function normally
6. Result: App works, displays "Rspack + React + TypeScript" with working remotes

## Our Enhanced Plugin's Alignment

✅ **Well-Aligned Features:**
- Proper lifecycle handling (`beforeRequest`, `afterResolve`, `onLoad`)
- Prevents crashes at manifest fetch stage (`afterResolve`)
- Component-level fallbacks for `onLoad` failures
- Circuit breaker for performance optimization
- Retry logic with exponential backoff
- Caching of fallback modules

✅ **Specific Solution for README Issue:**
- Handles `afterResolve` errors when manifest fetch fails
- Returns valid fallback modules instead of letting errors propagate
- Allows app to continue even with non-existent remotes
- Maintains functionality of working remotes

This analysis shows our plugin correctly implements the Module Federation runtime hook patterns to solve the exact problem described in the README: preventing application crashes when remote manifests cannot be fetched.