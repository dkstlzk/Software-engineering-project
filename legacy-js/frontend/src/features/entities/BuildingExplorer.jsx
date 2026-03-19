import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Card,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  alpha,
  CircularProgress,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import BusinessIcon from '@mui/icons-material/Business';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import LayersIcon from '@mui/icons-material/Layers';
import EventSeatIcon from '@mui/icons-material/EventSeat';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { PageHeader } from '../../components/common/PageHeader';
import { resourceApi } from '../../services/resourceApi';
import { useAuth } from '../auth/AuthContext';
import { useAlert } from '../../components/common/AlertProvider';

/* ── helpers ── */
const statusIcon = (s) => {
  const st = (s || '').toLowerCase();
  if (st === 'working' || st === 'available' || st === 'good')
    return <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main' }} />;
  if (st === 'maintenance' || st === 'needs_repair')
    return <WarningIcon sx={{ fontSize: 14, color: 'warning.main' }} />;
  return <ErrorIcon sx={{ fontSize: 14, color: 'error.main' }} />;
};

const typeColor = (t) => {
  const map = { classroom: 'primary', lab: 'secondary', auditorium: 'warning', office: 'info', seminar: 'success', lecture_hall: 'primary' };
  return map[(t || '').toLowerCase()] || 'default';
};

const ROOM_TYPES = ['classroom', 'lecture_hall', 'lab', 'seminar_room', 'conference_room', 'auditorium'];
const INV_STATUSES = ['available', 'in_use', 'maintenance', 'damaged'];

/* ─────────────────────────────────────── */
/*  Generic form dialog                    */
/* ─────────────────────────────────────── */
function FormDialog({ open, onClose, title, fields, initial, onSubmit }) {
  const [form, setForm] = useState(initial || {});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (open) setForm(initial || {}); }, [open, initial]);

  const handleSave = async () => {
    setSubmitting(true);
    try { await onSubmit(form); onClose(); }
    catch { /* caller handles */ }
    finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 2.5 }}>
        <Grid container spacing={2}>
          {fields.map((f) => (
            <Grid item xs={12} md={f.md || 6} key={f.key}>
              {f.select ? (
                <TextField
                  select label={f.label} fullWidth size="small" required={f.required}
                  value={form[f.key] ?? ''} onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                >
                  {(typeof f.options === 'function' ? f.options(form) : f.options).map((o) => {
                    const val = typeof o === 'object' ? o.value : o;
                    const lab = typeof o === 'object' ? o.label : o;
                    return <MenuItem key={val} value={val}>{lab}</MenuItem>;
                  })}
                </TextField>
              ) : (
                <TextField
                  label={f.label} type={f.type || 'text'} fullWidth size="small"
                  required={f.required} multiline={f.multiline} minRows={f.multiline ? 2 : undefined}
                  value={form[f.key] ?? ''} onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  inputProps={f.inputProps}
                  InputLabelProps={f.type === 'date' ? { shrink: true } : undefined}
                />
              )}
            </Grid>
          ))}
        </Grid>
      </DialogContent>
      <Divider />
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ color: 'text.secondary' }}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ─────────────────────────────────────── */
/*  Room row (expandable → equipment)      */
/* ─────────────────────────────────────── */
function RoomRow({ room, canEdit, canDelete, onEdit, onDelete, canManageInventory, notify }) {
  const [open, setOpen] = useState(false);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [invDialog, setInvDialog] = useState({ open: false, item: null });

  const loadInventory = useCallback(() => {
    setLoading(true);
    resourceApi.getRoomInventory(room.id)
      .then((res) => {
        const raw = res.data.data;
        setInventory(Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : []);
        setLoaded(true);
      })
      .catch(() => setInventory([]))
      .finally(() => setLoading(false));
  }, [room.id]);

  const handleToggle = () => {
    if (!open && !loaded) loadInventory();
    setOpen((p) => !p);
  };

  const handleDeleteInv = async (id) => {
    try {
      await resourceApi.deleteInventory(id);
      notify('Equipment deleted', 'success');
      loadInventory();
    } catch (e) { notify(e?.response?.data?.error || 'Delete failed', 'error'); }
  };

  const handleSaveInv = async (form) => {
    try {
      const payload = {
        itemName: form.itemName,
        itemDescription: form.itemDescription || undefined,
        quantity: Number(form.quantity) || 1,
        status: form.status || 'available',
        serialNumber: form.serialNumber || undefined,
        purchaseDate: form.purchaseDate || undefined,
        warrantyExpiry: form.warrantyExpiry || undefined,
        lastMaintenance: form.lastMaintenance || undefined,
        nextMaintenance: form.nextMaintenance || undefined,
      };
      if (invDialog.item) {
        await resourceApi.updateInventory(invDialog.item.id, payload);
        notify('Equipment updated', 'success');
      } else {
        await resourceApi.addRoomInventory(room.id, payload);
        notify('Equipment added', 'success');
      }
      loadInventory();
    } catch (e) { notify(e?.response?.data?.error || 'Save failed', 'error'); throw e; }
  };

  const invFields = [
    { key: 'itemName', label: 'Item Name', required: true, md: 8 },
    { key: 'serialNumber', label: 'Serial Number', md: 4 },
    { key: 'itemDescription', label: 'Description', multiline: true, md: 12 },
    { key: 'quantity', label: 'Quantity', type: 'number', required: true, inputProps: { min: 0 } },
    { key: 'status', label: 'Status', select: true, options: INV_STATUSES },
    { key: 'purchaseDate', label: 'Purchase Date', type: 'date' },
    { key: 'warrantyExpiry', label: 'Warranty Expiry', type: 'date' },
    { key: 'lastMaintenance', label: 'Last Maintenance', type: 'date' },
    { key: 'nextMaintenance', label: 'Next Maintenance', type: 'date' },
  ];

  return (
    <>
      <ListItemButton
        onClick={handleToggle}
        sx={{
          py: 1, px: 2.5, borderBottom: '1px solid', borderColor: 'divider',
          '&:hover': { bgcolor: (t) => alpha(t.palette.secondary.main, 0.04) },
        }}
      >
        <ListItemIcon sx={{ minWidth: 32 }}>
          <MeetingRoomIcon sx={{ fontSize: 18, color: 'secondary.main' }} />
        </ListItemIcon>
        <ListItemText
          primary={room.name || room.room_number}
          primaryTypographyProps={{ fontWeight: 500, fontSize: '0.88rem' }}
        />
        <Chip label={room.room_type || 'Room'} size="small" color={typeColor(room.room_type)}
          variant="outlined" sx={{ mr: 1, height: 22, fontSize: '0.7rem' }} />
        {(canEdit || canDelete) && (
          <Stack direction="row" spacing={0} sx={{ mr: 0.5 }}>
            {canEdit && (
              <Tooltip title="Edit Room">
                <IconButton size="small" onClick={(e) => { e.stopPropagation(); onEdit(room); }} sx={{ color: 'primary.main' }}>
                  <EditIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
            {canDelete && (
              <Tooltip title="Delete Room">
                <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); onDelete(room.id); }}>
                  <DeleteIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        )}
        {open ? <ExpandLessIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
          : <ExpandMoreIcon sx={{ fontSize: 18, color: 'text.secondary' }} />}
      </ListItemButton>

      <Collapse in={open} timeout="auto" unmountOnExit>
        <Box sx={{ bgcolor: (t) => alpha(t.palette.primary.main, 0.02), px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          {/* Room info */}
          <Stack direction="row" spacing={3} sx={{ mb: 2 }} flexWrap="wrap">
            <Stack direction="row" spacing={0.5} alignItems="center">
              <EventSeatIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
              <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>Capacity: <strong>{room.capacity || '—'}</strong></Typography>
            </Stack>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <LayersIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
              <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>Floor: <strong>{room.floor_number ?? '—'}</strong></Typography>
            </Stack>
            {room.is_available === false && (
              <Chip label="Unavailable" size="small" color="error" variant="filled" sx={{ height: 20, fontSize: '0.68rem' }} />
            )}
          </Stack>

          {/* Equipment header + add button */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Inventory2Icon sx={{ fontSize: 15 }} /> Equipment
            </Typography>
            {canManageInventory && (
              <Button size="small" startIcon={<AddIcon />} onClick={() => setInvDialog({ open: true, item: null })}
                sx={{ fontSize: '0.72rem', textTransform: 'none' }}>
                Add
              </Button>
            )}
          </Stack>

          {loading ? (
            <Box sx={{ textAlign: 'center', py: 1 }}><CircularProgress size={18} /></Box>
          ) : inventory.length === 0 ? (
            <Typography variant="body2" sx={{ fontSize: '0.78rem', color: 'text.secondary', fontStyle: 'italic' }}>
              No equipment listed
            </Typography>
          ) : (
            <TableContainer sx={{ borderRadius: 1, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontSize: '0.72rem', fontWeight: 700, color: 'text.secondary', py: 0.5 } }}>
                    <TableCell>Item</TableCell>
                    <TableCell>Serial #</TableCell>
                    <TableCell align="center">Qty</TableCell>
                    <TableCell align="center">Status</TableCell>
                    <TableCell align="center">Purchase</TableCell>
                    <TableCell align="center">Warranty</TableCell>
                    <TableCell align="center">Next Maint.</TableCell>
                    {canManageInventory && <TableCell align="right" sx={{ width: 80 }}>Actions</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {inventory.map((item) => (
                    <TableRow key={item.id} sx={{ '& td': { fontSize: '0.78rem', py: 0.5, borderBottom: 'none' } }}>
                      <TableCell>
                        <Tooltip title={item.item_description || ''} arrow placement="top">
                          <span>{item.item_name || item.name}</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell>{item.serial_number || '—'}</TableCell>
                      <TableCell align="center">{item.quantity ?? '—'}</TableCell>
                      <TableCell align="center">
                        <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
                          {statusIcon(item.status)}
                          <span>{item.status || '—'}</span>
                        </Stack>
                      </TableCell>
                      <TableCell align="center">{item.purchase_date ? item.purchase_date.slice(0, 10) : '—'}</TableCell>
                      <TableCell align="center">{item.warranty_expiry ? item.warranty_expiry.slice(0, 10) : '—'}</TableCell>
                      <TableCell align="center">{item.next_maintenance ? item.next_maintenance.slice(0, 10) : '—'}</TableCell>
                      {canManageInventory && (
                        <TableCell align="right">
                          <Tooltip title="Edit"><IconButton size="small" onClick={() => setInvDialog({ open: true, item })} sx={{ color: 'primary.main' }}>
                            <EditIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                          <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => handleDeleteInv(item.id)}>
                            <DeleteIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Collapse>

      <FormDialog
        open={invDialog.open}
        onClose={() => setInvDialog({ open: false, item: null })}
        title={invDialog.item ? 'Edit Equipment' : 'Add Equipment'}
        fields={invFields}
        initial={invDialog.item ? {
          itemName: invDialog.item.item_name || invDialog.item.name,
          itemDescription: invDialog.item.item_description || '',
          quantity: invDialog.item.quantity,
          status: invDialog.item.status,
          serialNumber: invDialog.item.serial_number || '',
          purchaseDate: invDialog.item.purchase_date ? invDialog.item.purchase_date.slice(0, 10) : '',
          warrantyExpiry: invDialog.item.warranty_expiry ? invDialog.item.warranty_expiry.slice(0, 10) : '',
          lastMaintenance: invDialog.item.last_maintenance ? invDialog.item.last_maintenance.slice(0, 10) : '',
          nextMaintenance: invDialog.item.next_maintenance ? invDialog.item.next_maintenance.slice(0, 10) : '',
        } : { status: 'available', quantity: 1 }}
        onSubmit={handleSaveInv}
      />
    </>
  );
}

/* ─────────────────────────────────────── */
/*  Building accordion section             */
/* ─────────────────────────────────────── */
function BuildingSection({ building, search, canEditBuilding, canDeleteBuilding, canManageRooms, canManageInventory, onEditBuilding, onDeleteBuilding, notify }) {
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [roomDialog, setRoomDialog] = useState({ open: false, item: null });

  const loadRooms = useCallback(() => {
    setLoading(true);
    resourceApi.getBuildingRooms(building.id)
      .then((res) => { const data = res.data.data; setRooms(Array.isArray(data) ? data : []); setLoaded(true); })
      .catch(() => setRooms([]))
      .finally(() => setLoading(false));
  }, [building.id]);

  const handleToggle = () => {
    if (!open && !loaded) loadRooms();
    setOpen((p) => !p);
  };

  useEffect(() => { if (search && loaded) setOpen(true); }, [search, loaded]);

  const filteredRooms = search
    ? rooms.filter((r) =>
        (r.name || '').toLowerCase().includes(search) ||
        (r.room_number || '').toLowerCase().includes(search) ||
        (r.room_type || '').toLowerCase().includes(search))
    : rooms;

  const handleSaveRoom = async (form) => {
    try {
      const payload = {
        roomNumber: form.roomNumber, name: form.name, buildingId: building.id,
        capacity: Number(form.capacity), roomType: form.roomType,
        floor: form.floor === '' ? undefined : Number(form.floor),
        description: form.description || undefined,
      };
      if (roomDialog.item) {
        await resourceApi.updateRoom(roomDialog.item.id, payload);
        notify('Room updated', 'success');
      } else {
        await resourceApi.createRoom(payload);
        notify('Room created', 'success');
      }
      loadRooms();
    } catch (e) { notify(e?.response?.data?.error || 'Save failed', 'error'); throw e; }
  };

  const handleDeleteRoom = async (id) => {
    try { await resourceApi.deleteRoom(id); notify('Room deleted', 'success'); loadRooms(); }
    catch (e) { notify(e?.response?.data?.error || 'Delete failed', 'error'); }
  };

  const floorOptions = Array.from({ length: building.floors || 1 }, (_, i) => ({ value: i, label: `Floor ${i}` }));

  const roomFields = [
    { key: 'roomNumber', label: 'Room Number', required: true },
    { key: 'name', label: 'Name' },
    { key: 'roomType', label: 'Type', select: true, options: ROOM_TYPES },
    { key: 'capacity', label: 'Capacity', type: 'number', required: true, inputProps: { min: 1 } },
    { key: 'floor', label: 'Floor', select: true, options: floorOptions },
    { key: 'description', label: 'Description', multiline: true, md: 12 },
  ];

  const roomInitial = roomDialog.item
    ? { roomNumber: roomDialog.item.room_number, name: roomDialog.item.name, roomType: roomDialog.item.room_type,
        capacity: roomDialog.item.capacity, floor: roomDialog.item.floor_number ?? 0, description: roomDialog.item.description }
    : { roomType: 'classroom', floor: 0 };

  return (
    <Box>
      {/* Building header row */}
      <ListItemButton
        onClick={handleToggle}
        sx={{
          py: 1.5, px: 2,
          bgcolor: (t) => (open ? alpha(t.palette.primary.main, 0.04) : 'transparent'),
          borderBottom: '1px solid', borderColor: 'divider',
          '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.06) },
        }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          <BusinessIcon sx={{ fontSize: 20, color: 'primary.main' }} />
        </ListItemIcon>
        <ListItemText
          primary={building.name}
          secondary={`${building.code} · ${building.floors || 0} floor${(building.floors || 0) !== 1 ? 's' : ''}`}
          primaryTypographyProps={{ fontWeight: 600, fontSize: '0.92rem' }}
          secondaryTypographyProps={{ fontSize: '0.74rem' }}
        />
        {loaded && (
          <Chip label={`${filteredRooms.length} room${filteredRooms.length !== 1 ? 's' : ''}`}
            size="small" sx={{ mr: 1, height: 22, fontSize: '0.7rem', fontWeight: 600, bgcolor: (t) => alpha(t.palette.primary.main, 0.08) }} />
        )}
        {(canEditBuilding || canDeleteBuilding) && (
          <Stack direction="row" spacing={0} sx={{ mr: 0.5 }}>
            {canEditBuilding && (
              <Tooltip title="Edit Building">
                <IconButton size="small" onClick={(e) => { e.stopPropagation(); onEditBuilding(building); }} sx={{ color: 'primary.main' }}>
                  <EditIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
            {canDeleteBuilding && (
              <Tooltip title="Delete Building">
                <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); onDeleteBuilding(building.id); }}>
                  <DeleteIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        )}
        {open ? <ExpandLessIcon sx={{ color: 'text.secondary' }} />
          : <ExpandMoreIcon sx={{ color: 'text.secondary' }} />}
      </ListItemButton>

      {/* Rooms (collapsible) */}
      <Collapse in={open} timeout="auto" unmountOnExit>
        {/* Add room button */}
        {canManageRooms && (
          <Box sx={{ px: 3, pt: 1.5, pb: 0.5 }}>
            <Button size="small" variant="outlined" startIcon={<AddIcon />}
              onClick={() => setRoomDialog({ open: true, item: null })}
              sx={{ fontSize: '0.76rem', textTransform: 'none' }}>
              Add Room
            </Button>
          </Box>
        )}

        {loading ? (
          <Box sx={{ textAlign: 'center', py: 2 }}><CircularProgress size={22} /></Box>
        ) : filteredRooms.length === 0 ? (
          <Box sx={{ py: 2, px: 4 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.82rem', fontStyle: 'italic' }}>
              {search ? 'No rooms match your search' : 'No rooms in this building'}
            </Typography>
          </Box>
        ) : (
          <List disablePadding sx={{ pl: 2 }}>
            {filteredRooms.map((room) => (
              <RoomRow key={room.id} room={room}
                canEdit={canManageRooms} canDelete={canManageRooms}
                canManageInventory={canManageInventory}
                onEdit={(r) => setRoomDialog({ open: true, item: r })}
                onDelete={handleDeleteRoom}
                notify={notify} />
            ))}
          </List>
        )}
      </Collapse>

      <FormDialog open={roomDialog.open} onClose={() => setRoomDialog({ open: false, item: null })}
        title={roomDialog.item ? 'Edit Room' : 'Add Room'} fields={roomFields} initial={roomInitial}
        onSubmit={handleSaveRoom} />
    </Box>
  );
}

/* ─────────────────────────────────────── */
/*  Main Explorer page                     */
/* ─────────────────────────────────────── */
export function BuildingExplorer() {
  const { hasPermission } = useAuth();
  const { notify } = useAlert();
  const [buildings, setBuildings] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [bldgDialog, setBldgDialog] = useState({ open: false, item: null });

  const canCreateBuilding = hasPermission('buildings', 'create');
  const canEditBuilding = hasPermission('buildings', 'update');
  const canDeleteBuilding = hasPermission('buildings', 'delete');
  const canManageRooms = hasPermission('rooms', 'create');
  const canManageInventory = hasPermission('inventory', 'create');

  const loadBuildings = useCallback(() => {
    setLoading(true);
    resourceApi.listBuildings()
      .then((res) => { const data = res.data.data; setBuildings(Array.isArray(data) ? data : []); })
      .catch(() => setBuildings([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadBuildings(); }, [loadBuildings]);

  const handleSaveBuilding = async (form) => {
    try {
      const payload = { name: form.name, code: form.code, address: form.address || undefined, floors: form.floors ? Number(form.floors) : undefined };
      if (bldgDialog.item) {
        await resourceApi.updateBuilding(bldgDialog.item.id, payload);
        notify('Building updated', 'success');
      } else {
        await resourceApi.createBuilding(payload);
        notify('Building created', 'success');
      }
      loadBuildings();
    } catch (e) { notify(e?.response?.data?.error || 'Save failed', 'error'); throw e; }
  };

  const handleDeleteBuilding = async (id) => {
    try { await resourceApi.deleteBuilding(id); notify('Building deleted', 'success'); loadBuildings(); }
    catch (e) { notify(e?.response?.data?.error || 'Delete failed', 'error'); }
  };

  const q = search.toLowerCase().trim();
  const filteredBuildings = buildings.filter(
    (b) => b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q)
  );

  const bldgFields = [
    { key: 'name', label: 'Building Name', required: true },
    { key: 'code', label: 'Code', required: true },
    { key: 'address', label: 'Address', multiline: true, md: 12 },
    { key: 'floors', label: 'Floors', type: 'number' },
  ];

  const bldgInitial = bldgDialog.item
    ? { name: bldgDialog.item.name, code: bldgDialog.item.code, address: bldgDialog.item.address, floors: bldgDialog.item.floors }
    : {};

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Building Explorer"
        subtitle="Manage buildings, rooms, and equipment"
        action={canCreateBuilding ? (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setBldgDialog({ open: true, item: null })}>
            Add Building
          </Button>
        ) : null}
      />

      <Card sx={{ overflow: 'hidden' }}>
        {/* Search */}
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <TextField placeholder="Search buildings or rooms…" value={search}
            onChange={(e) => setSearch(e.target.value)} fullWidth size="small"
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> }}
          />
        </Box>

        {/* Building list */}
        {loading ? (
          <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress size={28} /></Box>
        ) : filteredBuildings.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <BusinessIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              {search ? 'No buildings match your search' : 'No buildings found'}
            </Typography>
          </Box>
        ) : (
          <List disablePadding>
            {filteredBuildings.map((building) => (
              <BuildingSection key={building.id} building={building} search={q}
                canEditBuilding={canEditBuilding} canDeleteBuilding={canDeleteBuilding}
                canManageRooms={canManageRooms} canManageInventory={canManageInventory}
                onEditBuilding={(b) => setBldgDialog({ open: true, item: b })}
                onDeleteBuilding={handleDeleteBuilding}
                notify={notify} />
            ))}
          </List>
        )}
      </Card>

      <FormDialog open={bldgDialog.open} onClose={() => setBldgDialog({ open: false, item: null })}
        title={bldgDialog.item ? 'Edit Building' : 'Add Building'} fields={bldgFields} initial={bldgInitial}
        onSubmit={handleSaveBuilding} />
    </Stack>
  );
}
