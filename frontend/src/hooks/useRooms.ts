import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as roomsApi from '../lib/api/rooms';
import { queryConfigs } from '../lib/queryConfig';
import type { CreateRoomInput, UpdateRoomInput } from '../lib/api/rooms';

export function useRooms(buildingId?: number, enabled = true) {
  return useQuery({
    queryKey: ['rooms', buildingId],
    queryFn: () => roomsApi.getRooms(buildingId),
    enabled: buildingId === undefined ? enabled : enabled && buildingId !== undefined,
    ...queryConfigs.rooms,
  });
}

export function useCreateRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateRoomInput) => roomsApi.createRoom(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rooms', variables.buildingId] });
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}

export function useUpdateRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: { id: number } & UpdateRoomInput) =>
      roomsApi.updateRoom(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}

export function useDeleteRoom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: roomsApi.deleteRoom,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
  });
}

export function useRoomAvailability(roomId: number, startAt?: string, endAt?: string) {
  return useQuery({
    queryKey: ['room-availability', roomId, startAt, endAt],
    queryFn: () => {
      if (!startAt || !endAt) throw new Error('startAt and endAt are required');
      return roomsApi.getRoomAvailability(roomId, startAt, endAt);
    },
    enabled: !!roomId && !!startAt && !!endAt,
    ...queryConfigs.roomAvailability,
  });
}
