import { useEffect, useState, useCallback } from 'react';
import {
  Badge, Box, Divider, IconButton, List, ListItemButton, ListItemText,
  Popover, Typography, Button, alpha, CircularProgress,
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import { useAuth } from '../../features/auth/AuthContext';
import { bookingApi } from '../../services/bookingApi';

export function NotificationPanel() {
  const { isAuthenticated } = useAuth();
  const [anchorEl, setAnchorEl] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchUnreadCount = useCallback(() => {
    if (!isAuthenticated) return;
    bookingApi.getUnreadCount()
      .then((res) => setUnreadCount(res.data?.data?.count || 0))
      .catch(() => {});
  }, [isAuthenticated]);

  // Poll unread count every 30 seconds
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  const handleOpen = (e) => {
    setAnchorEl(e.currentTarget);
    setLoading(true);
    bookingApi.getNotifications({ limit: 15 })
      .then((res) => setNotifications(res.data?.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const handleClose = () => setAnchorEl(null);

  const handleMarkRead = async (id) => {
    await bookingApi.markAsRead(id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const handleMarkAllRead = async () => {
    await bookingApi.markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const open = Boolean(anchorEl);

  if (!isAuthenticated) return null;

  return (
    <>
      <IconButton
        color="inherit" onClick={handleOpen}
        sx={{ color: alpha('#fff', 0.7), '&:hover': { color: '#fff' } }}
      >
        <Badge badgeContent={unreadCount} color="error" max={99}>
          <NotificationsIcon />
        </Badge>
      </IconButton>

      <Popover
        open={open} anchorEl={anchorEl} onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { width: 360, maxHeight: 450, borderRadius: 2 } }}
      >
        <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle1" fontWeight={700}>Notifications</Typography>
          {unreadCount > 0 && (
            <Button size="small" startIcon={<DoneAllIcon />} onClick={handleMarkAllRead} sx={{ fontSize: '0.75rem' }}>
              Mark all read
            </Button>
          )}
        </Box>
        <Divider />

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : notifications.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">No notifications</Typography>
          </Box>
        ) : (
          <List dense sx={{ py: 0 }}>
            {notifications.map((n) => (
              <ListItemButton
                key={n.id}
                onClick={() => !n.is_read && handleMarkRead(n.id)}
                sx={{
                  bgcolor: n.is_read ? 'transparent' : alpha('#0D9488', 0.06),
                  borderLeft: n.is_read ? 'none' : '3px solid #0D9488',
                  py: 1.2,
                }}
              >
                <ListItemText
                  primary={
                    <Typography variant="body2" fontWeight={n.is_read ? 400 : 600} sx={{ fontSize: '0.83rem' }}>
                      {n.title}
                    </Typography>
                  }
                  secondary={
                    <>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.3 }}>
                        {n.message}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.7rem' }}>
                        {new Date(n.created_at).toLocaleString()}
                      </Typography>
                    </>
                  }
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </Popover>
    </>
  );
}
