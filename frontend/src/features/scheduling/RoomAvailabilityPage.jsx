import { useEffect, useState } from 'react';
import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Grid,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
    Alert,
    Paper,
    alpha,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import BlockIcon from '@mui/icons-material/Block';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingState } from '../../components/common/LoadingState';
import { EmptyState } from '../../components/common/EmptyState';
import { useAlert } from '../../components/common/AlertProvider';
import { schedulingApi } from '../../services/schedulingApi';

export function RoomAvailabilityPage() {
    const { notify } = useAlert();

    // Query inputs
    const [date, setDate] = useState(() => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    });
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');

    // Results
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);
    const [error, setError] = useState('');

    const isValid = !!date;

    const handleSearch = async () => {
        if (!isValid) return;

        setLoading(true);
        setError('');
        setResults(null);

        try {
            const params = { date };
            if (startTime) params.startTime = startTime;
            if (endTime) params.endTime = endTime;

            const res = await schedulingApi.getRoomAvailability(params);
            setResults(res.data?.data || null);
        } catch (err) {
            const msg =
                err.response?.data?.message ||
                err.message ||
                'Failed to fetch room availability';
            setError(msg);
            notify(msg, 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box>
            <PageHeader
                title="Room Availability"
                subtitle="Check room availability by date and time range"
            />

            {/* Filter Controls */}
            <Card sx={{ mt: 2 }}>
                <CardContent>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-end">
                        <TextField
                            id="availability-date"
                            label="Date"
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            required
                            sx={{ minWidth: 160 }}
                        />

                        <TextField
                            id="availability-start-time"
                            label="Start Time"
                            type="time"
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            helperText="Optional"
                            sx={{ minWidth: 140 }}
                        />

                        <TextField
                            id="availability-end-time"
                            label="End Time"
                            type="time"
                            value={endTime}
                            onChange={(e) => setEndTime(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            helperText="Optional"
                            sx={{ minWidth: 140 }}
                        />

                        <Button
                            variant="contained"
                            onClick={handleSearch}
                            disabled={!isValid || loading}
                            startIcon={<SearchIcon />}
                            id="avail-search-btn"
                            sx={{ minWidth: 120 }}
                        >
                            Search
                        </Button>
                    </Stack>
                </CardContent>
            </Card>

            {/* Loading */}
            {loading && <LoadingState message="Checking room availability..." />}

            {/* Error */}
            {error && (
                <Alert severity="error" sx={{ mt: 2 }} id="avail-error">
                    {error}
                </Alert>
            )}

            {/* Results */}
            {results && !loading && (
                <Box sx={{ mt: 3 }}>
                    {/* Summary */}
                    {results.summary && (
                        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                            <Chip
                                icon={<CheckCircleOutlineIcon />}
                                label={`${results.summary.availableCount} Available`}
                                color="success"
                                variant="outlined"
                            />
                            <Chip
                                icon={<BlockIcon />}
                                label={`${results.summary.occupiedCount} Occupied`}
                                color="error"
                                variant="outlined"
                            />
                            <Chip
                                label={`${results.summary.totalRooms} Total`}
                                variant="outlined"
                            />
                        </Stack>
                    )}

                    {results.message && (
                        <Alert severity="info" sx={{ mb: 2 }}>
                            {results.message}
                        </Alert>
                    )}

                    <Grid container spacing={3}>
                        {/* Available Rooms */}
                        <Grid item xs={12} md={6}>
                            <Card>
                                <CardContent>
                                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                                        <CheckCircleOutlineIcon color="success" />
                                        <Typography variant="h6">Available Rooms</Typography>
                                    </Stack>

                                    {results.available?.length === 0 ? (
                                        <EmptyState message="No available rooms" />
                                    ) : (
                                        <TableContainer component={Paper} variant="outlined">
                                            <Table size="small">
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell>Room</TableCell>
                                                        <TableCell>Building</TableCell>
                                                        <TableCell align="right">Capacity</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {results.available?.map((room) => (
                                                        <TableRow key={room.id}>
                                                            <TableCell>
                                                                <Typography variant="body2" fontWeight={600}>
                                                                    {room.room_number || room.name}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Typography variant="body2" color="text.secondary">
                                                                    {room.building_name || '—'}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                <Chip
                                                                    label={room.capacity}
                                                                    size="small"
                                                                    sx={{
                                                                        fontWeight: 600,
                                                                        bgcolor: (t) => alpha(t.palette.success.main, 0.1),
                                                                        color: 'success.dark',
                                                                    }}
                                                                />
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    )}
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Occupied Rooms */}
                        <Grid item xs={12} md={6}>
                            <Card>
                                <CardContent>
                                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                                        <BlockIcon color="error" />
                                        <Typography variant="h6">Occupied Rooms</Typography>
                                    </Stack>

                                    {results.occupied?.length === 0 ? (
                                        <EmptyState message="No occupied rooms" />
                                    ) : (
                                        <TableContainer component={Paper} variant="outlined">
                                            <Table size="small">
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell>Room</TableCell>
                                                        <TableCell>Building</TableCell>
                                                        <TableCell align="right">Capacity</TableCell>
                                                        <TableCell>Booked For</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {results.occupied?.map((room) => (
                                                        <TableRow key={room.id}>
                                                            <TableCell>
                                                                <Typography variant="body2" fontWeight={600}>
                                                                    {room.room_number || room.name}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Typography variant="body2" color="text.secondary">
                                                                    {room.building_name || '—'}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                <Chip
                                                                    label={room.capacity}
                                                                    size="small"
                                                                    sx={{
                                                                        fontWeight: 600,
                                                                        bgcolor: (t) => alpha(t.palette.error.main, 0.1),
                                                                        color: 'error.dark',
                                                                    }}
                                                                />
                                                            </TableCell>
                                                            <TableCell>
                                                                {room.conflicts?.map((c, i) => {
                                                                    const booking = c.bookings?.[0];
                                                                    const request = c.requests?.[0];
                                                                    const label =
                                                                        booking?.course_code ||
                                                                        request?.event_title ||
                                                                        'Reserved';
                                                                    return (
                                                                        <Chip
                                                                            key={i}
                                                                            label={label}
                                                                            size="small"
                                                                            variant="outlined"
                                                                            sx={{ mr: 0.5, mb: 0.5 }}
                                                                        />
                                                                    );
                                                                })}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    )}
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>
                </Box>
            )}
        </Box>
    );
}
