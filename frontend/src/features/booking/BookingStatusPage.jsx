import { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, CircularProgress,
} from '@mui/material';
import { useAuth } from '../auth/AuthContext';
import { bookingApi } from '../../services/bookingApi';
import { PageHeader } from '../../components/common/PageHeader';

const STATUS_COLORS = {
  pending_faculty: 'warning',
  pending_staff: 'info',
  approved: 'success',
  rejected: 'error',
  cancelled: 'default',
  conflict_escalated: 'secondary',
};

const STATUS_LABELS = {
  pending_faculty: 'Pending Faculty',
  pending_staff: 'Pending Staff',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  conflict_escalated: 'Escalated',
};

export function BookingStatusPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    bookingApi.getUserBookings(user.id)
      .then((res) => setBookings(res.data?.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.id]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title="My Booking Requests"
        subtitle="Track the status of your booking requests"
      />

      <TableContainer component={Paper} sx={{ mt: 2, borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 700, fontSize: '0.8rem' } }}>
              <TableCell>Event</TableCell>
              <TableCell>Room</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Time</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Remarks</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {bookings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No booking requests found
                </TableCell>
              </TableRow>
            ) : (
              bookings.map((b) => (
                <TableRow key={b.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{b.event_title}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{b.room_number}</Typography>
                    <Typography variant="caption" color="text.secondary">{b.building_name}</Typography>
                  </TableCell>
                  <TableCell>{b.booking_date?.substring(0, 10)}</TableCell>
                  <TableCell>{b.start_time?.substring(0, 5)} - {b.end_time?.substring(0, 5)}</TableCell>
                  <TableCell>
                    <Chip
                      label={STATUS_LABELS[b.status] || b.status}
                      color={STATUS_COLORS[b.status] || 'default'}
                      size="small" variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip label={b.event_type} size="small" variant="filled"
                      sx={{ textTransform: 'capitalize', fontSize: '0.7rem' }} />
                  </TableCell>
                  <TableCell>
                    {b.rejection_reason && (
                      <Typography variant="caption" color="error.main">
                        {b.rejection_reason}
                      </Typography>
                    )}
                    {b.staff_remarks && !b.rejection_reason && (
                      <Typography variant="caption">{b.staff_remarks}</Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
