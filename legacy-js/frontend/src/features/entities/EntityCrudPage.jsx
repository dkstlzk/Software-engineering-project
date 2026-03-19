import { useEffect, useMemo, useState } from 'react';
import {
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
  IconButton,
  InputAdornment,
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
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { PageHeader } from '../../components/common/PageHeader';
import { LoadingState } from '../../components/common/LoadingState';
import { EmptyState } from '../../components/common/EmptyState';
import { useAlert } from '../../components/common/AlertProvider';

export function EntityCrudPage({
  title,
  subtitle,
  listFn,
  createFn,
  updateFn,
  deleteFn,
  columns,
  formFields,
  mapFormToPayload,
  canCreate = false,
  canEdit = false,
  canDelete = false,
  listParams,
  transformList,
}) {
  const { notify } = useAlert();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({});
  const [search, setSearch] = useState('');

  const initialForm = useMemo(() => {
    const next = {};
    formFields.forEach((field) => {
      next[field.key] = field.defaultValue ?? '';
    });
    return next;
  }, [formFields]);

  const load = async () => {
    setLoading(true);
    try {
      const response = await listFn(listParams || {});
      let data = response?.data?.data;
      if (Array.isArray(data?.rooms)) data = data.rooms;
      if (Array.isArray(data?.items)) data = data.items;
      if (!Array.isArray(data)) data = [];
      if (transformList) data = transformList(data);
      setItems(data);
    } catch (error) {
      notify(error?.response?.data?.error || 'Failed to load data', 'error');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((item) =>
      columns.some((col) => {
        const v = item[col.key];
        return v != null && String(v).toLowerCase().includes(q);
      })
    );
  }, [items, search, columns]);

  const openCreate = () => {
    setEditing(null);
    setForm(initialForm);
    setOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    const next = { ...initialForm };
    formFields.forEach((field) => {
      next[field.key] = item[field.key] ?? '';
    });
    setForm(next);
    setOpen(true);
  };

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = mapFormToPayload ? mapFormToPayload(form) : form;
      if (editing) {
        await updateFn(editing.id, payload);
        notify(`${title} updated successfully`, 'success');
      } else {
        await createFn(payload);
        notify(`${title} created successfully`, 'success');
      }
      setOpen(false);
      await load();
    } catch (error) {
      notify(error?.response?.data?.error || 'Operation failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (id) => {
    try {
      await deleteFn(id);
      notify(`${title} deleted`, 'success');
      await load();
    } catch (error) {
      notify(error?.response?.data?.error || 'Delete failed', 'error');
    }
  };

  return (
    <Stack spacing={2}>
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={canCreate ? (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            Add {title}
          </Button>
        ) : null}
      />

      <Card>
        <CardContent sx={{ p: 0 }}>
          {/* Search bar */}
          <Box sx={{ px: 2.5, pt: 2, pb: 1.5 }}>
            <TextField
              placeholder={`Search ${title.toLowerCase()}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              size="small"
              sx={{ width: { xs: '100%', sm: 320 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              }}
            />
            {!loading && (
              <Chip
                label={`${filteredItems.length} record${filteredItems.length !== 1 ? 's' : ''}`}
                size="small"
                sx={{ ml: 1.5, bgcolor: (t) => alpha(t.palette.primary.main, 0.08), fontWeight: 600, fontSize: '0.72rem' }}
              />
            )}
          </Box>

          <Divider />

          {loading ? (
            <LoadingState />
          ) : filteredItems.length === 0 ? (
            <EmptyState message={search ? 'No matching records.' : 'No data found.'} />
          ) : (
            <TableContainer sx={{ maxHeight: 520 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {columns.map((column) => (
                      <TableCell key={column.key}>{column.label}</TableCell>
                    ))}
                    {(canEdit || canDelete) && <TableCell align="right" sx={{ width: 100 }}>Actions</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.id} hover sx={{ '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.02) } }}>
                      {columns.map((column) => (
                        <TableCell key={column.key}>
                          {column.render ? column.render(item[column.key], item) : (item[column.key] ?? '—')}
                        </TableCell>
                      ))}
                      {(canEdit || canDelete) && (
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            {canEdit && (
                              <Tooltip title="Edit">
                                <IconButton size="small" onClick={() => openEdit(item)} sx={{ color: 'primary.main' }}>
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {canDelete && (
                              <Tooltip title="Delete">
                                <IconButton size="small" color="error" onClick={() => onDelete(item.id)}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Stack>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="h6">
            {editing ? `Edit ${title}` : `Create ${title}`}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: '0.8rem' }}>
            Fill in the details below. Required fields are marked with *.
          </Typography>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          <Grid container spacing={2}>
            {formFields.map((field) => (
              <Grid item xs={12} md={field.md || 6} key={field.key}>
                <TextField
                  label={field.label}
                  type={field.type || 'text'}
                  fullWidth
                  required={field.required}
                  value={form[field.key] ?? ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  multiline={field.multiline}
                  minRows={field.multiline ? 2 : undefined}
                  size="small"
                />
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <Divider />
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpen(false)} sx={{ color: 'text.secondary' }}>
            Cancel
          </Button>
          <Button onClick={onSubmit} variant="contained" disabled={submitting}>
            {submitting ? 'Saving...' : editing ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
