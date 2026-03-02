import { useEffect, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  Stack,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import TuneIcon from '@mui/icons-material/Tune';
import SecurityIcon from '@mui/icons-material/Security';
import BadgeIcon from '@mui/icons-material/Badge';
import SchoolIcon from '@mui/icons-material/School';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingState } from '../../components/common/LoadingState';
import { useAlert } from '../../components/common/AlertProvider';
import { resourceApi } from '../../services/resourceApi';

const ROLE_META = {
  admin: { icon: SecurityIcon, color: '#DC2626', label: 'Administrator' },
  staff: { icon: BadgeIcon, color: '#D97706', label: 'Staff' },
  faculty: { icon: SchoolIcon, color: '#2563EB', label: 'Faculty' },
  student: { icon: VerifiedUserIcon, color: '#16A34A', label: 'Student' },
};

function PolicyCard({ policy, onEdit }) {
  const meta = ROLE_META[policy.role_name] || ROLE_META.student;
  const Icon = meta.icon;

  return (
    <Card>
      <CardContent sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          {/* Header */}
          <Stack direction="row" alignItems="center" spacing={2}>
            <Avatar
              variant="rounded"
              sx={{
                width: 44,
                height: 44,
                bgcolor: alpha(meta.color, 0.1),
                color: meta.color,
                borderRadius: '12px',
              }}
            >
              <Icon />
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="subtitle1" fontWeight={700}>
                  {meta.label}
                </Typography>
                <Chip
                  label={`Priority ${policy.priority_level}`}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    bgcolor: alpha(meta.color, 0.1),
                    color: meta.color,
                  }}
                />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
                {policy.role_name} role allocation policy
              </Typography>
            </Box>
            <Button
              size="small"
              variant="outlined"
              startIcon={<EditIcon sx={{ fontSize: 16 }} />}
              onClick={() => onEdit(policy)}
              sx={{ borderRadius: 2, textTransform: 'none' }}
            >
              Edit
            </Button>
          </Stack>

          <Divider />

          {/* Fields grid */}
          <Grid container spacing={2}>
            <Grid item xs={6} sm={4}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, fontSize: '0.6rem' }}>
                Max Duration
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {policy.max_booking_duration_hours}h
              </Typography>
            </Grid>
            <Grid item xs={6} sm={4}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, fontSize: '0.6rem' }}>
                Advance Booking
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {policy.max_advance_booking_days} days
              </Typography>
            </Grid>
            <Grid item xs={6} sm={4}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, fontSize: '0.6rem' }}>
                Min Notice
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {policy.min_notice_hours}h
              </Typography>
            </Grid>
            <Grid item xs={6} sm={4}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, fontSize: '0.6rem' }}>
                Max Concurrent
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {policy.max_concurrent_bookings}
              </Typography>
            </Grid>
            <Grid item xs={6} sm={4}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, fontSize: '0.6rem' }}>
                Approval Chain
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {(policy.approval_chain || []).length === 0
                  ? 'Self-approve'
                  : (policy.approval_chain || []).join(' → ')}
              </Typography>
            </Grid>
            <Grid item xs={6} sm={4}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, fontSize: '0.6rem' }}>
                Room Types
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {(policy.allowed_room_types || []).map((t) => (
                  <Chip
                    key={t}
                    label={t.replace(/_/g, ' ')}
                    size="small"
                    sx={{ height: 20, fontSize: '0.6rem', fontWeight: 600 }}
                  />
                ))}
              </Stack>
            </Grid>
          </Grid>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function PoliciesPage() {
  const { notify } = useAlert();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await resourceApi.getAllPolicies();
      setPolicies(res?.data?.data?.policies || []);
    } catch (error) {
      notify(error?.response?.data?.error || 'Failed to load policies', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openEdit = (policy) => {
    setEditing(policy);
    setForm({
      maxBookingDurationHours: policy.max_booking_duration_hours,
      maxAdvanceBookingDays: policy.max_advance_booking_days,
      minNoticeHours: policy.min_notice_hours,
      maxConcurrentBookings: policy.max_concurrent_bookings,
      priorityLevel: policy.priority_level,
    });
  };

  const onSave = async () => {
    setSubmitting(true);
    try {
      await resourceApi.updatePolicy(editing.role_name, {
        ...form,
        maxBookingDurationHours: Number(form.maxBookingDurationHours),
        maxAdvanceBookingDays: Number(form.maxAdvanceBookingDays),
        minNoticeHours: Number(form.minNoticeHours),
        maxConcurrentBookings: Number(form.maxConcurrentBookings),
        priorityLevel: Number(form.priorityLevel),
      });
      notify('Policy updated successfully', 'success');
      setEditing(null);
      await load();
    } catch (error) {
      notify(error?.response?.data?.error || 'Update failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Allocation Policies"
        subtitle="Configure booking rules, approval chains, and resource limits per role"
      />

      {loading ? (
        <LoadingState message="Loading policies..." />
      ) : (
        <Grid container spacing={2}>
          {policies.map((p) => (
            <Grid item xs={12} md={6} key={p.id || p.role_name}>
              <PolicyCard policy={p} onEdit={openEdit} />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Edit dialog */}
      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <TuneIcon sx={{ color: 'primary.main' }} />
            <Box>
              <Typography variant="h6">
                Edit {editing?.role_name} Policy
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                Update allocation limits for this role.
              </Typography>
            </Box>
          </Stack>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField
                label="Max Duration (hours)"
                type="number"
                fullWidth
                size="small"
                value={form.maxBookingDurationHours ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, maxBookingDurationHours: e.target.value }))}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Max Advance (days)"
                type="number"
                fullWidth
                size="small"
                value={form.maxAdvanceBookingDays ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, maxAdvanceBookingDays: e.target.value }))}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Min Notice (hours)"
                type="number"
                fullWidth
                size="small"
                value={form.minNoticeHours ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, minNoticeHours: e.target.value }))}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Max Concurrent Bookings"
                type="number"
                fullWidth
                size="small"
                value={form.maxConcurrentBookings ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, maxConcurrentBookings: e.target.value }))}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Priority Level"
                type="number"
                fullWidth
                size="small"
                value={form.priorityLevel ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, priorityLevel: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <Divider />
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setEditing(null)} sx={{ color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={onSave} disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
