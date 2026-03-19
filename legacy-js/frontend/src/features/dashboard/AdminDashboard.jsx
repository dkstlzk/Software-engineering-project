import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, Button, CircularProgress, TextField, Dialog,
  DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { useAlert } from '../../components/common/AlertProvider';
import { bookingApi } from '../../services/bookingApi';
import { PageHeader } from '../../components/common/PageHeader';

export function AdminDashboard() {
  const { showAlert } = useAlert();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [rejectDialog, setRejectDialog] = useState({ open: false, id: null });
  const [rejectReason, setRejectReason] = useState('');

  const loadRequests = useCallback(() => {
    setLoading(true);
    bookingApi.getPendingForStaff()
      .then((res) => setRequests(res.data?.data || []))
      .catch(() => showAlert('Failed to load requests', 'error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const handleApprove = async (id) => {
    setActionLoading(id);
    try {
      await bookingApi.approveBooking(id, { remarks: 'Approved' });
      showAlert('Booking approved successfully', 'success');
      loadRequests();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Failed to approve', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectOpen = (id) => {
    setRejectDialog({ open: true, id });
    setRejectReason('');
  };

  const handleRejectConfirm = async () => {
    const { id } = rejectDialog;
    if (!rejectReason.trim()) return;
    setActionLoading(id);
    setRejectDialog({ open: false, id: null });
    try {
      await bookingApi.rejectBooking(id, { reason: rejectReason });
      showAlert('Booking rejected', 'info');
      loadRequests();
    } catch (err) {
      showAlert(err.response?.data?.error || 'Failed to reject', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <PageHeader
        title="Admin / Staff Dashboard"
        subtitle="Review and approve booking requests"
      />

      <TableContainer component={Paper} sx={{ mt: 2, borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 700, fontSize: '0.8rem' } }}>
              <TableCell>Requester</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Event</TableCell>
              <TableCell>Room</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Time</TableCell>
              <TableCell>Faculty Verified</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No pending requests
                </TableCell>
              </TableRow>
            ) : (
              requests.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{r.requester_name}</Typography>
                    <Typography variant="caption" color="text.secondary">{r.requester_email}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={r.requester_role} size="small" sx={{ textTransform: 'capitalize', fontSize: '0.7rem' }} />
                  </TableCell>
                  <TableCell>{r.event_title}</TableCell>
                  <TableCell>
                    {r.room_number}
                    <Typography variant="caption" display="block" color="text.secondary">{r.building_name}</Typography>
                  </TableCell>
                  <TableCell>{r.booking_date?.substring(0, 10)}</TableCell>
                  <TableCell>{r.start_time?.substring(0, 5)} - {r.end_time?.substring(0, 5)}</TableCell>
                  <TableCell>
                    {r.faculty_verifier_name ? (
                      <Chip label={`✓ ${r.faculty_verifier_name}`} size="small" color="success" variant="outlined" />
                    ) : (
                      <Typography variant="caption" color="text.secondary">Direct</Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Button
                      size="small" color="success" variant="contained"
                      startIcon={<CheckCircleIcon />}
                      onClick={() => handleApprove(r.id)}
                      disabled={actionLoading === r.id}
                      sx={{ mr: 0.5, fontSize: '0.75rem' }}
                    >
                      Approve
                    </Button>
                    <Button
                      size="small" color="error" variant="outlined"
                      startIcon={<CancelIcon />}
                      onClick={() => handleRejectOpen(r.id)}
                      disabled={actionLoading === r.id}
                      sx={{ fontSize: '0.75rem' }}
                    >
                      Reject
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Reject Dialog */}
      <Dialog open={rejectDialog.open} onClose={() => setRejectDialog({ open: false, id: null })} maxWidth="sm" fullWidth>
        <DialogTitle>Reject Request</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth multiline rows={3} label="Rejection Reason"
            value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Provide a reason for rejection..." sx={{ mt: 1 }}
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialog({ open: false, id: null })}>Cancel</Button>
          <Button onClick={handleRejectConfirm} color="error" variant="contained" disabled={!rejectReason.trim()}>
            Reject
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
