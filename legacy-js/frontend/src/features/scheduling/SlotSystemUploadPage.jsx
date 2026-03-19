import { useState } from 'react';
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
    TextField,
    Typography,
    Alert,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingState } from '../../components/common/LoadingState';
import { useAlert } from '../../components/common/AlertProvider';
import { schedulingApi } from '../../services/schedulingApi';
import { parseCsvFile } from '../../utils/csvParser';

const PROGRAM_TYPES = ['BTech', 'MTech', 'MBA', 'MSc', 'PhD'];
const YEAR_GROUPS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '2nd Year+'];

export function SlotSystemUploadPage() {
    const { notify } = useAlert();

    const [form, setForm] = useState({
        name: '',
        programType: '',
        yearGroup: '',
        description: '',
    });
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const handleChange = (field) => (e) => {
        setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

    const handleFileChange = (e) => {
        const selected = e.target.files?.[0] || null;
        setFile(selected);
        setError('');
    };

    const isValid = form.name.trim() && form.programType && file;

    const handleSubmit = async () => {
        if (!isValid) return;

        setLoading(true);
        setError('');
        setResult(null);

        try {
            // Step 1: Create the slot system
            const createRes = await schedulingApi.createSlotSystem({
                name: form.name.trim(),
                programType: form.programType,
                yearGroup: form.yearGroup || undefined,
                description: form.description.trim() || undefined,
            });

            const slotSystem = createRes.data?.data?.slotSystem;
            if (!slotSystem?.id) {
                throw new Error('Slot system created but no ID returned');
            }

            // Step 2: Parse the CSV file
            const slots = await parseCsvFile(file);

            if (slots.length === 0) {
                throw new Error('CSV file contains no data rows');
            }

            // Step 3: Upload slots to the system
            const uploadRes = await schedulingApi.uploadSlots(slotSystem.id, slots);
            const uploadData = uploadRes.data?.data;

            setResult({
                systemName: slotSystem.name,
                totalProcessed: uploadData?.totalProcessed || slots.length,
                inserted: uploadData?.inserted?.length || 0,
                errors: uploadData?.errors || [],
            });

            notify('Slot system created and slots uploaded successfully', 'success');

            // Reset form
            setForm({ name: '', programType: '', yearGroup: '', description: '' });
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
                title="Slot System Upload"
                subtitle="Create a slot system and upload slot definitions from a CSV file"
            />

            <Card sx={{ mt: 2, maxWidth: 600 }}>
                <CardContent>
                    {loading ? (
                        <LoadingState message="Uploading slot system..." />
                    ) : (
                        <Stack spacing={2.5}>
                            <TextField
                                id="slot-system-name"
                                label="Slot System Name"
                                value={form.name}
                                onChange={handleChange('name')}
                                required
                                fullWidth
                                placeholder="e.g. BTech 1st Year 2025-26"
                            />

                            <FormControl fullWidth required>
                                <InputLabel id="program-type-label">Program Type</InputLabel>
                                <Select
                                    labelId="program-type-label"
                                    id="program-type-select"
                                    value={form.programType}
                                    onChange={handleChange('programType')}
                                    label="Program Type"
                                >
                                    {PROGRAM_TYPES.map((pt) => (
                                        <MenuItem key={pt} value={pt}>
                                            {pt}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <FormControl fullWidth>
                                <InputLabel id="year-group-label">Year Group</InputLabel>
                                <Select
                                    labelId="year-group-label"
                                    id="year-group-select"
                                    value={form.yearGroup}
                                    onChange={handleChange('yearGroup')}
                                    label="Year Group"
                                >
                                    <MenuItem value="">
                                        <em>None</em>
                                    </MenuItem>
                                    {YEAR_GROUPS.map((yg) => (
                                        <MenuItem key={yg} value={yg}>
                                            {yg}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <TextField
                                id="slot-system-description"
                                label="Description"
                                value={form.description}
                                onChange={handleChange('description')}
                                multiline
                                rows={2}
                                fullWidth
                                placeholder="Optional description"
                            />

                            <Button
                                variant="outlined"
                                component="label"
                                startIcon={<UploadFileIcon />}
                                id="slot-csv-upload-btn"
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
                                CSV must include columns: slotCode, day, startTime, endTime
                            </Typography>

                            {error && (
                                <Alert severity="error" id="slot-upload-error">
                                    {error}
                                </Alert>
                            )}

                            {result && (
                                <Alert severity="success" id="slot-upload-success">
                                    <strong>{result.systemName}</strong> created —{' '}
                                    {result.inserted} of {result.totalProcessed} slots inserted
                                    {result.errors.length > 0 && (
                                        <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                                            {result.errors.length} error(s): {result.errors.map((e) => e.error || e.msg).join('; ')}
                                        </Typography>
                                    )}
                                </Alert>
                            )}

                            <Button
                                variant="contained"
                                onClick={handleSubmit}
                                disabled={!isValid}
                                id="slot-submit-btn"
                                size="large"
                            >
                                Create & Upload
                            </Button>
                        </Stack>
                    )}
                </CardContent>
            </Card>
        </Box>
    );
}
