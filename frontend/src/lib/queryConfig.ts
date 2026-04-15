/**
 * React Query configuration for different data types based on volatility
 * 
 * Data Volatility Classification:
 * - VERY_VOLATILE: Changes frequently in real-time (bookings, availability)
 * - VOLATILE: Changes often with user interactions (rooms, user profiles)
 * - STABLE: Changes occasionally (buildings, staff assignments)
 * - STATIC: Rarely changes (event types, slot systems)
 */

// Highly volatile data - changes frequently, short cache window
export const QUERY_CONFIG_VERY_VOLATILE = {
  staleTime: 1 * 60 * 1000, // 1 minute
  gcTime: 3 * 60 * 1000, // 3 minutes (formerly cacheTime)
};

// Volatile data - changes often with user actions
export const QUERY_CONFIG_VOLATILE = {
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 10 * 60 * 1000, // 10 minutes
};

// Stable data - changes occasionally
export const QUERY_CONFIG_STABLE = {
  staleTime: 10 * 60 * 1000, // 10 minutes
  gcTime: 20 * 60 * 1000, // 20 minutes
};

// Static data - rarely changes
export const QUERY_CONFIG_STATIC = {
  staleTime: 30 * 60 * 1000, // 30 minutes
  gcTime: 60 * 60 * 1000, // 1 hour
};

/**
 * Query-specific configurations mapping data types to their volatility levels
 */
export const queryConfigs = {
  // Very Volatile - room availability changes with every booking
  availability: QUERY_CONFIG_VERY_VOLATILE,
  roomAvailability: QUERY_CONFIG_VERY_VOLATILE,

  // Volatile - bookings can change, but user-initiated
  bookings: QUERY_CONFIG_VOLATILE,
  bookingRequests: QUERY_CONFIG_VOLATILE,

  // Volatile - rooms list can be modified by admins
  rooms: QUERY_CONFIG_VOLATILE,

  // Stable - buildings rarely change, but modifications affect related data
  buildings: QUERY_CONFIG_STABLE,
  staffAssignments: QUERY_CONFIG_STABLE,

  // Stable - user data changes only when profile is updated
  profile: QUERY_CONFIG_STABLE,
  users: QUERY_CONFIG_STABLE,

  // Static - event types and slot systems rarely change
  slotSystems: QUERY_CONFIG_STATIC,
  eventTypes: QUERY_CONFIG_STATIC,
  systemQolSettings: QUERY_CONFIG_STATIC,
};
