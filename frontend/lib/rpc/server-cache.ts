/**
 * Server-side in-memory cache for obligation PDAs
 * Shared across all users, eliminates repeated full scans
 */

export interface ServerCache<T> {
  data: T
  expiresAt: number
  scannedAt: number
}

class ServerCacheManager {
  private static instance: ServerCacheManager
  private cache = new Map<string, ServerCache<unknown>>()

  static getInstance(): ServerCacheManager {
    if (!ServerCacheManager.instance) {
      ServerCacheManager.instance = new ServerCacheManager()
    }
    return ServerCacheManager.instance
  }

  clear(key: string): void {
    this.cache.delete(key)
    console.log(`[ServerCache] Cleared cache for ${key}`)
  }

  clearAll(): void {
    this.cache.clear()
    console.log("[ServerCache] Cleared all caches")
  }

  get<T>(key: string): null | ServerCache<T> {
    const cached = this.cache.get(key) as ServerCache<T> | undefined
    if (!cached) {
      console.log(`[ServerCache] Cache miss for ${key}`)
      return null
    }

    if (Date.now() > cached.expiresAt) {
      console.log(`[ServerCache] Cache expired for ${key}`)
      this.cache.delete(key)
      return null
    }

    console.log(
      `[ServerCache] Cache hit for ${key}, expires in ${Math.round((cached.expiresAt - Date.now()) / 1000)}s`,
    )
    return cached
  }

  set<T>(key: string, data: T, ttlMs: number): ServerCache<T> {
    const now = Date.now()
    const cached: ServerCache<T> = {
      data,
      expiresAt: now + ttlMs,
      scannedAt: now,
    }
    this.cache.set(key, cached as ServerCache<unknown>)
    console.log(`[ServerCache] Set cache for ${key}, expires in ${ttlMs / 1000}s`)
    return cached
  }
}

export const serverCache = ServerCacheManager.getInstance()

export const CACHE_KEYS = {
  LEADERBOARD: "leaderboard_data",
  OBLIGATION_PDAS: "obligation_pdas",
  POOL_FACTORS: "pool_factors",
} as const

export const CACHE_TTL = {
  LEADERBOARD: 30 * 1000, // 30 seconds
  OBLIGATION_PDAS: 5 * 60 * 1000, // 5 minutes
  POOL_FACTORS: 24 * 60 * 60 * 1000, // 24 hours
} as const
