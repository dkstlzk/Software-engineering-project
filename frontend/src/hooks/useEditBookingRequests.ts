import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as editBookingApi from '../lib/api/editBooking';
import { queryConfigs } from '../lib/queryConfig';

export function useEditRequests() {
  return useQuery({
    queryKey: ['editRequests'],
    queryFn: () => editBookingApi.getEditRequests(),
    ...queryConfigs.bookingRequests,
  });
}

export function useApproveEditRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: editBookingApi.approveEditRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['bookingRequests'] });
      queryClient.invalidateQueries({ queryKey: ['editRequests'] });
    },
  });
}

export function useRejectEditRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: editBookingApi.rejectEditRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['editRequests'] });
      queryClient.invalidateQueries({ queryKey: ['bookingRequests'] });
    },
  });
}
