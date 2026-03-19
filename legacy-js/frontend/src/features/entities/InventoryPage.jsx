import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { LoadingState } from '../../components/common/LoadingState';
import { resourceApi } from '../../services/resourceApi';
import { useAlert } from '../../components/common/AlertProvider';

const statusColors = {
  available: '#16A34A',
  in_use: '#2563EB',
  maintenance: '#D97706',
  damaged: '#DC2626',
  retired: '#64748B',
};

export function InventoryPage() {
  const { notify } = useAlert();
  const [roomId, setRoomId] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (!roomId) {
      notify('Enter a room ID to fetch inventory', 'warning');
      return;
    }
    setLoading(true);
    try {
      const response = await resourceApi.getRoomInventory(roomId);
      const data = response?.data?.data;
      const next = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      setItems(next);
      setLoaded(true);
    } catch (error) {
      notify(error?.response?.data?.error || 'Failed to fetch inventory', 'error');
      setItems([]);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') load();
  };

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Inventory"
        subtitle="View and manage room inventory items by room ID"
      />

      <Card>
        <CardContent sx={{ py: 2.5 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
            <TextField
              placeholder="Enter room UUID..."
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              onKeyDown={handleKeyDown}
              fullWidth
              size="small"
              sx={{ maxWidth: { sm: 400 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Inventory2Icon sx={{ fontSize: 18, color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              }}
            />
            <Button
              variant="contained"
              onClick={load}
              disabled={loading}
              sx={{ minWidth: 110 }}
            >
              {loading ? 'Loading...' : 'Fetch'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ p: 0 }}>
          {loading ? (
            <LoadingState message="Fetching inventory..." />
          ) : !loaded ? (
            <EmptyState message="Enter a room ID above and click Fetch." />
          ) : items.length === 0 ? (
            <EmptyState message="No inventory items found for this room." />
          ) : (
            <>
              <Box sx={{ px: 2.5, pt: 2, pb: 1 }}>
                <Chip
                  label={`${items.length} item${items.length !== 1 ? 's' : ''}`}
                  size="small"
                  sx={{ fontWeight: 600, fontSize: '0.72rem', bgcolor: (t) => alpha(t.palette.primary.main, 0.08) }}
                />
              </Box>
              <Divider />
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Item</TableCell>
                      <TableCell>Quantity</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Serial</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {items.map((item) => {
                      const sc = statusColors[item.status] || '#64748B';
                      return (
                        <TableRow key={item.id} hover>
                          <TableCell sx={{ fontWeight: 500 }}>{item.item_name}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '2px 10px',
                                borderRadius: 6,
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                backgroundColor: `${sc}15`,
                                color: sc,
                                textTransform: 'capitalize',
                              }}
                            >
                              {(item.status || '—').replace(/_/g, ' ')}
                            </span>
                          </TableCell>
                          <TableCell sx={{ color: 'text.secondary' }}>{item.serial_number || '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
