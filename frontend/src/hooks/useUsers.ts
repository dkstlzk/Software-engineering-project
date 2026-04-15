import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as usersApi from '../lib/api/users';
import { queryConfigs } from '../lib/queryConfig';
import type { UserRole, AssignableUserRole } from '../lib/api/types';

type ManagedUsersFilters = {
  page?: number;
  limit?: number;
  role?: UserRole;
  department?: string;
  search?: string;
  isActive?: boolean;
};

export function useFacultyUsers() {
  return useQuery({
    queryKey: ['faculty-users'],
    queryFn: () => usersApi.getFacultyUsers(),
    ...queryConfigs.users,
  });
}

export function useManagedUsers(filters?: ManagedUsersFilters, enabled = true) {
  return useQuery({
    queryKey: ['managed-users', filters],
    queryFn: () => usersApi.getManagedUsers(filters),
    enabled,
    ...queryConfigs.users,
  });
}

export function useCreateManagedUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Parameters<typeof usersApi.createManagedUser>[0]) =>
      usersApi.createManagedUser(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managed-users'] });
    },
  });
}

export function useUpdateManagedUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: AssignableUserRole }) =>
      usersApi.updateManagedUserRole(userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managed-users'] });
    },
  });
}

export function useUpdateManagedUserActiveStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, isActive }: { userId: number; isActive: boolean }) =>
      usersApi.updateManagedUserActiveStatus(userId, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managed-users'] });
    },
  });
}

export function useDeleteManagedUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: usersApi.deleteManagedUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['managed-users'] });
      queryClient.invalidateQueries({ queryKey: ['faculty-users'] });
    },
  });
}

export function useUserBuildingAssignments(userId: number) {
  return useQuery({
    queryKey: ['user-building-assignments', userId],
    queryFn: () => usersApi.getUserBuildingAssignments(userId),
    enabled: !!userId,
    ...queryConfigs.staffAssignments,
  });
}

export function useUpdateUserBuildingAssignments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, buildingIds }: { userId: number; buildingIds: number[] }) =>
      usersApi.updateUserBuildingAssignments(userId, buildingIds),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['user-building-assignments', variables.userId] });
    },
  });
}
