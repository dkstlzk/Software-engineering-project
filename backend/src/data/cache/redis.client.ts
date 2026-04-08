import Redis from 'ioredis';
import logger from '../../shared/utils/logger';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_RETRY_LOG_INTERVAL = 20;

// Track Redis connection state
export let isRedisAvailable = false;

let hasLoggedUnavailable = false;

function markRedisAvailable(): void {
  if (!isRedisAvailable) {
    logger.info('Redis connected');
  }

  isRedisAvailable = true;
  hasLoggedUnavailable = false;
}

function markRedisUnavailable(message: string): void {
  const wasAvailable = isRedisAvailable;
  isRedisAvailable = false;

  if (wasAvailable || !hasLoggedUnavailable) {
    logger.warn(message);
    hasLoggedUnavailable = true;
  }
}

// Create Redis client with connection failure handling
// In development, Redis is optional - the server will work without it
export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 1,
  retryStrategy(times) {
    // Keep retrying so Redis can recover without backend restart.
    if (times % REDIS_RETRY_LOG_INTERVAL === 0) {
      logger.warn(
        `Redis still unavailable after ${times} reconnect attempts; fallback behavior remains active`
      );
    }

    // Retry with bounded backoff.
    return Math.min(times * 250, 5000);
  },
  lazyConnect: true,
});

redis.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code && error.code !== 'ECONNREFUSED') {
    logger.error('Redis connection error:', error);
  }

  markRedisUnavailable('Redis unavailable - rate limiting and caching will use fallback behavior');
});

redis.on('connect', () => {
  markRedisAvailable();
});

redis.on('ready', () => {
  markRedisAvailable();
});

redis.on('end', () => {
  markRedisUnavailable('Redis connection closed - retrying in background');
});

// Attempt initial connection (non-blocking)
redis.connect().catch(() => {
  markRedisUnavailable('Redis unavailable - rate limiting and caching will use fallback behavior');
});

export const cacheKeys = {
  buildings: () => 'buildings:all',
  building: (id: number) => `building:${id}`,
  rooms: (buildingId?: number) =>
    buildingId ? `rooms:building:${buildingId}` : 'rooms:all',
  staffAssignments: (staffId: number) => `staff:${staffId}:buildings`,
  user: (id: number) => `user:${id}`,
};

// Cache TTL constants optimized by data volatility
// Override defaults using environment variables: CACHE_VERY_SHORT_TTL, CACHE_SHORT_TTL, etc.

// Highly volatile data (bookings, real-time availability) - should rarely cache
export const VERY_SHORT_TTL = parseInt(process.env.CACHE_VERY_SHORT_TTL || '120', 10); // 2 minutes

// Volatile data (room/building availability) - changes frequently with bookings
export const SHORT_TTL = parseInt(process.env.CACHE_SHORT_TTL || '300', 10); // 5 minutes

// Moderately volatile data (user profiles, building/room metadata) - changes occasionally
export const MEDIUM_TTL = parseInt(process.env.CACHE_MEDIUM_TTL || '1800', 10); // 30 minutes

// Relatively static data (event types, configuration) - rarely changes
export const LONG_TTL = parseInt(process.env.CACHE_LONG_TTL || '3600', 10); // 1 hour

// Very static data (reference lists, enumerations) - can cache longer
export const VERY_LONG_TTL = parseInt(process.env.CACHE_VERY_LONG_TTL || '7200', 10); // 2 hours
