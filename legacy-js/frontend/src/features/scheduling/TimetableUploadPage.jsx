import { useEffect, useState } from 'react';
import {
    Box,
    Button,
    Card,
    CardContent,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Typography,
    Alert,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingState } from '../../components/common/LoadingState';
import { useAlert } from '../../components/common/AlertProvider';
import { schedulingApi } from '../../services/schedulingApi';
import { parseCsvFile } from '../../utils/csvParser';

export function TimetableUploadPage() {
    const { notify } = useAlert();

    const [slotSystems, setSlotSystems] = useState([]);
    const [selectedSystem, setSelectedSystem] = useState('');
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [fetchingSlotSystems, setFetchingSlotSystems] = useState(true);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    // Fetch slot systems on mount
    useEffect(() => {
        let mounted = true;
        const fetchSystems = async () => {
            try {
                const res = await schedulingApi.getSlotSystems();
                if (mounted) {
                    setSlotSystems(res.data?.data?.slotSystems || []);
                }
            } catch (err) {
                if (mounted) {
                    notify('Failed to load slot systems', 'error');
                }
            } finally {
                if (mounted) setFetchingSlotSystems(false);
            }
        };
        fetchSystems();
        return () => { mounted = false; };
    }, []);

    const handleFileChange = (e) => {
        const selected = e.target.files?.[0] || null;
        setFile(selected);
        setError('');
    };

    const isValid = selectedSystem && file;

    const handleSubmit = async () => {
        if (!isValid) return;

        setLoading(true);
        setError('');
        setResult(null);

        try {
            // Parse the CSV file
            const entries = await parseCsvFile(file);

            if (entries.length === 0) {
                throw new Error('CSV file contains no data rows');
            }

            // Upload timetable
            const res = await schedulingApi.uploadTimetable({
                slotSystemId: selectedSystem,
                entries,
            });

            const data = res.data?.data;

            setResult({
                totalProcessed: data?.totalProcessed || entries.length,
                inserted: data?.inserted?.length || 0,
                warnings: data?.warnings || [],
                errors: data?.errors || [],
            });

            notify('Timetable uploaded successfully', 'success');

            // Reset form
            setFile(null);
        } catch (err) {
            const msg =
                err.response?.data?.message ||
                err.response?.data?.errors?.map((e) => e.msg).join(', ') ||
                err.message ||
                'Upload failed';
            setError(msg);
            notify(msg, 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box>
            <PageHeader
                title="Timetable Upload"
                subtitle="Upload timetable entries linked to a slot system"
            />

            <Card sx={{ mt: 2, maxWidth: 600 }}>
                <CardContent>
                    {fetchingSlotSystems ? (
                        <LoadingState message="Loading slot systems..." />
                    ) : loading ? (
                        <LoadingState message="Uploading timetable..." />
                    ) : (
                        <Stack spacing={2.5}>
                            <FormControl fullWidth required>
                                <InputLabel id="slot-system-label">Slot System</InputLabel>
                                <Select
                                    labelId="slot-system-label"
                                    id="timetable-slot-system-select"
                                    value={selectedSystem}
                                    onChange={(e) => {
                                        setSelectedSystem(e.target.value);
                                        setError('');
                                    }}
                                    label="Slot System"
                                >
                                    {slotSystems.length === 0 ? (
                                        <MenuItem disabled>No slot systems available</MenuItem>
                                    ) : (
                                        slotSystems.map((sys) => (
                                            <MenuItem key={sys.id} value={sys.id}>
                                                {sys.name} ({sys.program_type || sys.programType})
                                            </MenuItem>
                                        ))
                                    )}
                                </Select>
                            </FormControl>

                            <Button
                                variant="outlined"
                                component="label"
                                startIcon={<UploadFileIcon />}
                                disabled={!selectedSystem}
                                id="timetable-csv-upload-btn"
                            >
                                {file ? file.name : 'Select CSV File'}
                                <input
                                    type="file"
                                    accept=".csv"
                                    hidden
                                    onChange={handleFileChange}
                                />
                            </Button>

                            <Typography variant="caption" color="text.secondary">
                                CSV must include at least a subject_code column.
                                Additional columns will be forwarded as timetable entry fields.
                            </Typography>

                            {error && (
                                <Alert severity="error" id="timetable-upload-error">
                                    {error}
                                </Alert>
                            )}

                            {result && (
                                <Alert
                                    severity={result.errors.length > 0 ? 'warning' : 'success'}
                                    id="timetable-upload-result"
                                >
                                    {result.inserted} of {result.totalProcessed} entries inserted
                                    {result.warnings.length > 0 && (
                                        <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                                            ⚠ {result.warnings.length} warning(s):{' '}
                                            {result.warnings.slice(0, 3).map((w) => w.warning || w.msg || w).join('; ')}
                                            {result.warnings.length > 3 && ` ...and ${result.warnings.length - 3} more`}
                                        </Typography>
                                    )}
                                    {result.errors.length > 0 && (
                                        <Typography variant="caption" display="block" sx={{ mt: 0.5 }} color="error">
                                            ✕ {result.errors.length} error(s):{' '}
                                            {result.errors.slice(0, 3).map((e) => e.error || e.msg || e).join('; ')}
                                            {result.errors.length > 3 && ` ...and ${result.errors.length - 3} more`}
                                        </Typography>
                                    )}
                                </Alert>
                            )}

                            <Button
                                variant="contained"
                                onClick={handleSubmit}
                                disabled={!isValid}
                                id="timetable-submit-btn"
                                size="large"
                            >
                                Upload Timetable
                            </Button>
                        </Stack>
                    )}
                </CardContent>
            </Card>
        </Box>
    );
}
