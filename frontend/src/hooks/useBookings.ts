import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as bookingsApi from '../lib/api/bookings';
import * as editBookingApi from '../lib/api/editBooking';
import { queryConfigs } from '../lib/queryConfig';

type BookingFilters = {
  roomId?: number;
  buildingId?: number;
  startAt?: string;
  endAt?: string;
};

export function useBookings(filters?: BookingFilters) {
  return useQuery({
    queryKey: ['bookings', filters],
    queryFn: () => bookingsApi.getBookings(filters),
    ...queryConfigs.bookings,
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bookingsApi.createBooking,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

export function useUpdateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof bookingsApi.updateBooking>[1] }) =>
      bookingsApi.updateBooking(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['bookings', variables.id] });
    },
  });
}

export function useDeleteBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: bookingsApi.deleteBooking,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

export function useEditBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof editBookingApi.editBooking>[1] }) =>
      editBookingApi.editBooking(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['bookingRequests'] });
      queryClient.invalidateQueries({ queryKey: ['editRequests'] });
    },
  });
}
