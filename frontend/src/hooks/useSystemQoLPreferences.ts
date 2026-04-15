import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_SYSTEM_QOL_PREFERENCES,
  mergeSystemQoLPreferences,
} from "../lib/systemQol";
import {
  getSystemQoLSettings,
  updateSystemQoLSettings,
  type SystemQoLPreferencesPatch,
  type SystemQoLSettings,
} from "../lib/api";
import { queryConfigs } from "../lib/queryConfig";

const SYSTEM_QOL_QUERY_KEY = ["system-qol-settings"] as const;

export function useSystemQoLPreferences() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: SYSTEM_QOL_QUERY_KEY,
    queryFn: getSystemQoLSettings,
    ...queryConfigs.systemQolSettings,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: true,
  });

  const mutation = useMutation({
    mutationFn: (patch: SystemQoLPreferencesPatch) =>
      updateSystemQoLSettings(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: SYSTEM_QOL_QUERY_KEY });

      const previous = queryClient.getQueryData<SystemQoLSettings>(
        SYSTEM_QOL_QUERY_KEY,
      );

      const fallback: SystemQoLSettings = {
        ...DEFAULT_SYSTEM_QOL_PREFERENCES,
        updatedBy: null,
        updatedAt: new Date(0).toISOString(),
      };

      const base = previous ?? fallback;

      const mergedSections = {
        ...base.autoLoadSections,
        ...(patch.autoLoadSections ?? {}),
      };

      queryClient.setQueryData<SystemQoLSettings>(SYSTEM_QOL_QUERY_KEY, {
        ...base,
        ...patch,
        autoLoadSections: mergedSections,
      });

      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData<SystemQoLSettings>(
          SYSTEM_QOL_QUERY_KEY,
          context.previous,
        );
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: SYSTEM_QOL_QUERY_KEY });
    },
  });

  const preferences = mergeSystemQoLPreferences(query.data);

  const updatePreferences = useCallback(
    (patch: SystemQoLPreferencesPatch) => {
      if (Object.keys(patch).length === 0) {
        return Promise.resolve();
      }

      return mutation.mutateAsync(patch).then(() => undefined);
    },
    [mutation],
  );

  const resetPreferences = useCallback(() => {
    return mutation
      .mutateAsync(DEFAULT_SYSTEM_QOL_PREFERENCES)
      .then(() => undefined);
  }, [mutation]);

  return {
    preferences,
    updatePreferences,
    resetPreferences,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isSaving: mutation.isPending,
    error: query.error ?? mutation.error ?? null,
    refetch: query.refetch,
  };
}
