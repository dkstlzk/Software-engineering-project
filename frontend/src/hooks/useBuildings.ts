import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as buildingsApi from '../lib/api/buildings';
import { queryConfigs } from '../lib/queryConfig';
import type { CreateBuildingInput, UpdateBuildingInput } from '../lib/api/buildings';

export function useBuildings(enabled = true) {
  return useQuery({
    queryKey: ['buildings'],
    queryFn: () => buildingsApi.getBuildings(),
    enabled,
    ...queryConfigs.buildings,
  });
}

export function useCreateBuilding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBuildingInput) => buildingsApi.createBuilding(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buildings'] });
    },
  });
}

export function useUpdateBuilding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: { id: number } & UpdateBuildingInput) =>
      buildingsApi.updateBuilding(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buildings'] });
    },
  });
}

export function useDeleteBuilding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: buildingsApi.deleteBuilding,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buildings'] });
    },
  });
}
