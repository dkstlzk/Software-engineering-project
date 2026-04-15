import type {
  SystemAutoLoadSections,
  SystemQoLPreferences,
} from "./api/types";

export type { SystemAutoLoadSections, SystemQoLPreferences };

export const DEFAULT_SYSTEM_AUTO_LOAD_SECTIONS: SystemAutoLoadSections = {
  dashboard: false,
  bookings: false,
  rooms: false,
  availability: false,
  bookingRequests: false,
  users: false,
};

export const DEFAULT_SYSTEM_QOL_PREFERENCES: SystemQoLPreferences = {
  // Default to manual loading to reduce unnecessary network work.
  manualDataLoading: true,
  autoLoadDependentData: false,
  autoLoadSections: DEFAULT_SYSTEM_AUTO_LOAD_SECTIONS,
};

export function mergeSystemQoLPreferences(
  patch?: Partial<SystemQoLPreferences> | null,
): SystemQoLPreferences {
  const nextSections = {
    ...DEFAULT_SYSTEM_AUTO_LOAD_SECTIONS,
    ...(patch?.autoLoadSections ?? {}),
  };

  return {
    manualDataLoading:
      patch?.manualDataLoading ?? DEFAULT_SYSTEM_QOL_PREFERENCES.manualDataLoading,
    autoLoadDependentData:
      patch?.autoLoadDependentData ??
      DEFAULT_SYSTEM_QOL_PREFERENCES.autoLoadDependentData,
    autoLoadSections: nextSections,
  };
}
