import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as profileApi from '../lib/api/profile';
import { queryConfigs } from '../lib/queryConfig';
import type { UpdateProfileInput } from '../lib/api/profile';

export function useUserProfile(userId?: number) {
  return useQuery({
    queryKey: ['user-profile', userId],
    queryFn: () => profileApi.getCurrentUserProfile(),
    enabled: !!userId,
    ...queryConfigs.profile,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateProfileInput) => profileApi.updateUserProfile(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => profileApi.deleteUserAccount(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });
    },
  });
}

export function useUserActivityLog(userId?: number, limit: number = 10) {
  return useQuery({
    queryKey: ['user-activity-log', userId, limit],
    queryFn: () => profileApi.getUserActivityLog(userId || 0, limit),
    enabled: !!userId,
    ...queryConfigs.profile,
  });
}

export function useUserSessions(userId?: number) {
  return useQuery({
    queryKey: ['user-sessions', userId],
    queryFn: () => profileApi.getUserSessions(userId || 0),
    enabled: !!userId,
    ...queryConfigs.profile,
  });
}

export function useSignOutOtherSessions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: number) => profileApi.signOutOtherSessions(userId),
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: ['user-sessions', userId] });
    },
  });
}

export function useExportUserData(userId?: number) {
  return useQuery({
    queryKey: ['export-user-data', userId],
    queryFn: () => profileApi.exportUserData(userId || 0),
    enabled: false,
    ...queryConfigs.profile,
  });
}
