import { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Grid, TextField, MenuItem, Button,
  FormControlLabel, Checkbox, Alert, CircularProgress, Chip,
  alpha,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { useAuth } from '../auth/AuthContext';
import { useAlert } from '../../components/common/AlertProvider';
import { bookingApi } from '../../services/bookingApi';
import { resourceApi } from '../../services/resourceApi';
import { PageHeader } from '../../components/common/PageHeader';

const EVENT_TYPES = [
  { value: 'class', label: 'Class' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'exam', label: 'Exam' },
  { value: 'seminar', label: 'Seminar' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'speaker_session', label: 'Speaker Session' },
  { value: 'cultural_event', label: 'Cultural Event' },
  { value: 'other', label: 'Other' },
];

const INITIAL_FORM = {
  bookingDate: '',
  roomId: '',
  eventType: 'other',
  eventTitle: '',
  eventDescription: '',
  expectedAttendees: '',
  requiresProjector: false,
  requiresMic: false,
  specialRequirements: '',
  facultyVerifierId: '',
  startTime: '',
  endTime: '',
};

export function BookingRequestPage() {
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const role = user?.role || user?.role_name || 'student';

  const [form, setForm] = useState(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [error, setError] = useState(null);
  const [suggestions, setSuggestions] = useState(null);

  // Load rooms on mount
  useEffect(() => {
    resourceApi.listRooms({ limit: 200 })
      .then((res) => setRooms(res.data?.data?.data || res.data?.data || []))
      .catch(() => { });
  }, []);

  // Load faculty list for students
  useEffect(() => {
    if (role === 'student') {
      resourceApi.listUsers({ role: 'faculty', limit: 200 })
        .then((res) => setFaculty(res.data?.data?.data || res.data?.data || []))
        .catch(() => { });
    }
  }, [role]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    setError(null);
    setSuggestions(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuggestions(null);

    try {
      await bookingApi.createBooking(form);
      showAlert('Booking request submitted successfully!', 'success');
      setForm(INITIAL_FORM);
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.details?.suggestions) {
        setSuggestions(errData.details.suggestions);
      }
      setError(errData?.error || 'Failed to create booking request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Book a Room"
        subtitle="Submit a booking request for a room"
      />

      <Paper sx={{ p: 3, mt: 2, borderRadius: 2 }}>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={2.5}>
            {/* Date */}
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth type="date" label="Date" name="bookingDate"
                value={form.bookingDate} onChange={handleChange}
                InputLabelProps={{ shrink: true }} size="small" required
              />
            </Grid>

            {/* Start Time */}
            <Grid item xs={6} md={4}>
              <TextField
                fullWidth type="time" label="Start Time" name="startTime"
                value={form.startTime} onChange={handleChange}
                InputLabelProps={{ shrink: true }} size="small" required
              />
            </Grid>

            {/* End Time */}
            <Grid item xs={6} md={4}>
              <TextField
                fullWidth type="time" label="End Time" name="endTime"
                value={form.endTime} onChange={handleChange}
                InputLabelProps={{ shrink: true }} size="small" required
              />
            </Grid>

            {/* Room */}
            <Grid item xs={12} md={6}>
              <TextField
                select fullWidth label="Room" name="roomId"
                value={form.roomId} onChange={handleChange}
                size="small" required
              >
                <MenuItem value="">Select...</MenuItem>
                {rooms.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.room_number} — {r.name || r.building_name} (Cap: {r.capacity})
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* Event Type */}
            <Grid item xs={12} md={6}>
              <TextField
                select fullWidth label="Event Type" name="eventType"
                value={form.eventType} onChange={handleChange}
                size="small"
              >
                {EVENT_TYPES.map((et) => (
                  <MenuItem key={et.value} value={et.value}>{et.label}</MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* Event Title */}
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth label="Event Title" name="eventTitle"
                value={form.eventTitle} onChange={handleChange}
                size="small" required
              />
            </Grid>

            {/* Expected Attendees */}
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth type="number" label="Expected Attendees" name="expectedAttendees"
                value={form.expectedAttendees} onChange={handleChange}
                size="small" inputProps={{ min: 1 }}
              />
            </Grid>

            {/* Event Description */}
            <Grid item xs={12}>
              <TextField
                fullWidth multiline rows={2} label="Purpose / Description"
                name="eventDescription" value={form.eventDescription}
                onChange={handleChange} size="small"
              />
            </Grid>

            {/* Requirements */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Requirements</Typography>
              <FormControlLabel
                control={<Checkbox name="requiresProjector" checked={form.requiresProjector} onChange={handleChange} size="small" />}
                label="Projector"
              />
              <FormControlLabel
                control={<Checkbox name="requiresMic" checked={form.requiresMic} onChange={handleChange} size="small" />}
                label="Microphone"
              />
            </Grid>

            {/* Special Requirements */}
            <Grid item xs={12}>
              <TextField
                fullWidth label="Special Requirements" name="specialRequirements"
                value={form.specialRequirements} onChange={handleChange}
                size="small" placeholder="Any additional requirements..."
              />
            </Grid>

            {/* Faculty Verifier (Students only) */}
            {role === 'student' && (
              <Grid item xs={12} md={6}>
                <TextField
                  select fullWidth label="Faculty Verifier" name="facultyVerifierId"
                  value={form.facultyVerifierId} onChange={handleChange}
                  size="small" required
                  helperText="Required: Select a faculty member to verify your request"
                >
                  <MenuItem value="">Select Faculty...</MenuItem>
                  {faculty.map((f) => (
                    <MenuItem key={f.id} value={f.id}>
                      {f.first_name} {f.last_name} ({f.email})
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            )}
          </Grid>

          {/* Error */}
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
          )}

          {/* Suggestions on conflict */}
          {suggestions && suggestions.alternativeRooms?.length > 0 && (
            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Alternative Rooms Available:</Typography>
              {suggestions.alternativeRooms.map((r) => (
                <Chip
                  key={r.id} size="small" sx={{ mr: 0.5, mb: 0.5, cursor: 'pointer' }}
                  label={`${r.room_number} — ${r.building_name} (Cap: ${r.capacity})`}
                  onClick={() => setForm((prev) => ({ ...prev, roomId: r.id }))}
                  color="primary" variant="outlined"
                />
              ))}
            </Alert>
          )}

          {/* Submit */}
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="submit" variant="contained" size="large"
              disabled={loading} startIcon={loading ? <CircularProgress size={18} /> : <SendIcon />}
              sx={{ px: 4 }}
            >
              Submit Request
            </Button>
          </Box>
        </form>
      </Paper>
    </Box>
  );
}
