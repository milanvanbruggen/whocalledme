/**
 * In-memory cache for lookup status responses
 * Cache is invalidated when data changes (via cache invalidation calls)
 */

interface CacheEntry {
  data: {
    lookup: unknown;
    callAttempt: unknown;
    profile: unknown;
  };
  etag: string;
  expiresAt: number;
}

const statusCache = new Map<string, CacheEntry>();

// Cache TTL in milliseconds
const ACTIVE_LOOKUP_TTL = 5000; // 5 seconds for active lookups
const COMPLETED_LOOKUP_TTL = 60000; // 60 seconds for completed lookups

/**
 * Generate cache key from lookupId
 */
function getCacheKey(lookupId: string): string {
  return `lookup:${lookupId}`;
}

/**
 * Generate ETag from updated_at timestamp
 */
export function generateETag(
  updatedAt: string | null
): string {
  const timestamp = updatedAt || Date.now().toString();
  return `"${timestamp}"`;
}

/**
 * Get cached response if available and not expired
 */
export function getCachedResponse(
  lookupId: string,
  ifNoneMatch?: string | null
): { data: CacheEntry["data"]; etag: string } | null {
  const key = getCacheKey(lookupId);
  const entry = statusCache.get(key);

  if (!entry) {
    return null;
  }

  // Check if expired
  if (Date.now() > entry.expiresAt) {
    statusCache.delete(key);
    return null;
  }

  // Check if client has matching ETag (304 Not Modified)
  if (ifNoneMatch && ifNoneMatch === entry.etag) {
    return null; // Signal 304 response
  }

  return {
    data: entry.data,
    etag: entry.etag
  };
}

/**
 * Store response in cache
 */
export function setCachedResponse(
  lookupId: string,
  data: CacheEntry["data"],
  etag: string,
  isCompleted: boolean
): void {
  const key = getCacheKey(lookupId);
  const ttl = isCompleted ? COMPLETED_LOOKUP_TTL : ACTIVE_LOOKUP_TTL;

  statusCache.set(key, {
    data,
    etag,
    expiresAt: Date.now() + ttl
  });
}

/**
 * Invalidate cache for a specific lookup
 */
export function invalidateCache(lookupId: string): void {
  const key = getCacheKey(lookupId);
  const hadEntry = statusCache.has(key);
  statusCache.delete(key);
  
  if (process.env.NODE_ENV !== "production") {
    console.log("🗑️ Cache invalidated", {
      lookupId,
      key,
      hadEntry
    });
  }
}

/**
 * Clear all cache entries (useful for testing)
 */
export function clearCache(): void {
  statusCache.clear();
}

/**
 * Clean up expired entries (call periodically)
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of statusCache.entries()) {
    if (now > entry.expiresAt) {
      statusCache.delete(key);
    }
  }
}

