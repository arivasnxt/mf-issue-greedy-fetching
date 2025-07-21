import type { FederationRuntimePlugin } from "@module-federation/enhanced/runtime";
import { createElement } from "react";

interface OfflineFallbackConfig {
  enableLogging?: boolean;
  fallbackTimeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  fallbackComponents?: Record<string, React.ComponentType>;
  enableCircuitBreaker?: boolean;
  circuitBreakerThreshold?: number;
  circuitBreakerResetTimeout?: number;
}

interface RemoteState {
  failureCount: number;
  lastFailureTime: number;
  isCircuitOpen: boolean;
}

const enhancedOfflineFallbackPlugin = (
  config: OfflineFallbackConfig = {}
): FederationRuntimePlugin => {
  const {
    enableLogging = true,
    fallbackTimeout = 5000,
    retryAttempts = 2,
    retryDelay = 1000,
    fallbackComponents = {},
    enableCircuitBreaker = true,
    circuitBreakerThreshold = 3,
    circuitBreakerResetTimeout = 60000,
  } = config;

  // Track remote states for circuit breaker pattern
  const remoteStates = new Map<string, RemoteState>();
  
  // Cache for fallback modules
  const fallbackCache = new Map<string, any>();

  const log = (message: string, ...args: any[]) => {
    if (enableLogging) {
      console.warn(`[OfflineFallbackPlugin] ${message}`, ...args);
    }
  };

  const getRemoteState = (remoteId: string): RemoteState => {
    if (!remoteStates.has(remoteId)) {
      remoteStates.set(remoteId, {
        failureCount: 0,
        lastFailureTime: 0,
        isCircuitOpen: false,
      });
    }
    return remoteStates.get(remoteId)!;
  };

  const updateRemoteState = (remoteId: string, isSuccess: boolean) => {
    const state = getRemoteState(remoteId);
    
    if (isSuccess) {
      // Reset on success
      state.failureCount = 0;
      state.isCircuitOpen = false;
    } else {
      // Increment failure count
      state.failureCount++;
      state.lastFailureTime = Date.now();
      
      // Open circuit if threshold reached
      if (enableCircuitBreaker && state.failureCount >= circuitBreakerThreshold) {
        state.isCircuitOpen = true;
        log(`Circuit breaker opened for remote: ${remoteId}`);
        
        // Auto-reset circuit after timeout
        setTimeout(() => {
          state.isCircuitOpen = false;
          state.failureCount = 0;
          log(`Circuit breaker reset for remote: ${remoteId}`);
        }, circuitBreakerResetTimeout);
      }
    }
  };

  const isCircuitOpen = (remoteId: string): boolean => {
    if (!enableCircuitBreaker) return false;
    const state = getRemoteState(remoteId);
    return state.isCircuitOpen;
  };

  const createFallbackComponent = (remoteId: string, error?: Error) => {
    // Use custom fallback component if provided
    if (fallbackComponents[remoteId]) {
      return fallbackComponents[remoteId];
    }

    // Create default fallback component
    const FallbackComponent = () => {
      return createElement("div", {
        style: {
          padding: "16px",
          margin: "8px",
          border: "2px dashed #ffa39e",
          borderRadius: "8px",
          backgroundColor: "#fff2f0",
          color: "#cf1322",
          textAlign: "center" as const,
        },
      }, [
        createElement("h3", { key: "title", style: { margin: "0 0 8px 0" } }, "Remote Module Unavailable"),
        createElement("p", { key: "description", style: { margin: "0 0 8px 0", fontSize: "14px" } }, 
          `The remote module "${remoteId}" is currently offline or unavailable.`),
        error && createElement("details", { key: "error", style: { fontSize: "12px", marginTop: "8px" } }, [
          createElement("summary", { key: "summary" }, "Error Details"),
          createElement("pre", { 
            key: "error-details", 
            style: { 
              background: "#f5f5f5", 
              padding: "8px", 
              borderRadius: "4px",
              overflow: "auto",
              maxHeight: "100px"
            } 
          }, error.message)
        ])
      ]);
    };

    FallbackComponent.displayName = `FallbackComponent_${remoteId}`;
    return FallbackComponent;
  };

  const createFallbackModule = (remoteId: string, error?: Error) => {
    const cacheKey = `${remoteId}_${error?.message || 'default'}`;
    
    if (fallbackCache.has(cacheKey)) {
      return fallbackCache.get(cacheKey);
    }

    const FallbackComponent = createFallbackComponent(remoteId, error);
    
    const fallbackModule = {
      __esModule: true,
      default: FallbackComponent,
      // Provide common export patterns
      [remoteId]: FallbackComponent,
    };

    fallbackCache.set(cacheKey, fallbackModule);
    return fallbackModule;
  };

  const withRetry = async <T>(
    operation: () => Promise<T>,
    remoteId: string,
    attempts = retryAttempts
  ): Promise<T> => {
    let lastError: Error;
    
    for (let i = 0; i < attempts; i++) {
      try {
        const result = await Promise.race([
          operation(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), fallbackTimeout)
          )
        ]);
        
        // Success - update state
        updateRemoteState(remoteId, true);
        return result;
      } catch (error) {
        lastError = error as Error;
        log(`Attempt ${i + 1} failed for ${remoteId}:`, error);
        
        // Wait before retry (except for last attempt)
        if (i < attempts - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * (i + 1)));
        }
      }
    }
    
    // All attempts failed
    updateRemoteState(remoteId, false);
    throw lastError!;
  };

  return {
    name: "enhanced-offline-fallback-plugin",
    
    // Handle manifest loading errors (early stage)
    beforeRequest(args) {
      const remoteId = this.name || 'unknown';
      
      if (isCircuitOpen(remoteId)) {
        log(`Circuit breaker open for ${remoteId}, skipping request`);
        throw new Error(`Circuit breaker open for remote: ${remoteId}`);
      }
      
      log(`Loading remote: ${remoteId}`, args.id);
      return args;
    },

    // Handle module loading errors
    async errorLoadRemote(args) {
      const { id, error, from, lifecycle } = args;
      const remoteId = id || from || 'unknown';
      
      log(`Remote loading failed: ${remoteId}`, {
        lifecycle,
        error: error?.message,
        from,
      });

      // Different handling based on lifecycle
      switch (lifecycle) {
        case 'beforeRequest':
        case 'loadEntry':
          // Manifest loading failed - try with retry
          try {
            // Don't retry if circuit is open
            if (isCircuitOpen(remoteId)) {
              log(`Circuit breaker prevents retry for ${remoteId}`);
              return createFallbackModule(remoteId, error);
            }

            // This is where we could implement alternative manifest sources
            log(`Manifest loading failed for ${remoteId}, providing fallback`);
            return createFallbackModule(remoteId, error);
          } catch (retryError) {
            log(`Retry failed for ${remoteId}:`, retryError);
            return createFallbackModule(remoteId, error);
          }

        case 'onLoad':
          // Module loading failed after manifest was loaded
          return () => createFallbackModule(remoteId, error);

        default:
          // Generic fallback for any other lifecycle
          log(`Generic fallback for ${remoteId} at lifecycle: ${lifecycle}`);
          return createFallbackModule(remoteId, error);
      }
    },

    // Handle successful loads to reset circuit breaker
    onLoad(args) {
      const remoteId = args.id || 'unknown';
      updateRemoteState(remoteId, true);
      log(`Successfully loaded remote: ${remoteId}`);
      return args;
    },

    // Handle initialization errors
    init(args) {
      log("Plugin initialized with config:", config);
      return args;
    },
  };
};

export default enhancedOfflineFallbackPlugin;