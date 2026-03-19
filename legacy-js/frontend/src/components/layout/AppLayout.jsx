import { useMemo, useState } from 'react';
import {
  AppBar,
  Avatar,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Button,
  useMediaQuery,
  alpha,
  Stack,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import { useTheme } from '@mui/material/styles';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../features/auth/AuthContext';
import { getNavigationForRole } from '../../app/navigation';
import { SIDEBAR_BG, SIDEBAR_TEXT } from '../../app/theme';
import { NotificationPanel } from '../../features/notifications/NotificationPanel';

const drawerWidth = 270;

const ROLE_COLORS = {
  admin: '#DC2626',
  staff: '#D97706',
  faculty: '#2563EB',
  student: '#16A34A',
};

export function AppLayout({ children }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();

  const role = user?.role || user?.role_name || 'student';
  const navItems = useMemo(() => getNavigationForRole(role), [role]);

  const initials = `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`.toUpperCase();

  const drawerContent = (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: SIDEBAR_BG,
        color: SIDEBAR_TEXT,
      }}
    >
      {/* Brand header */}
      <Box sx={{ px: 2.5, py: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <MeetingRoomIcon sx={{ color: '#fff', fontSize: 22 }} />
        </Box>
        <Box>
          <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, lineHeight: 1.2 }}>
            URAS
          </Typography>
          <Typography variant="caption" sx={{ color: alpha('#fff', 0.45), fontSize: '0.65rem', letterSpacing: 1 }}>
            ROOM MANAGEMENT
          </Typography>
        </Box>
      </Box>

      <Divider sx={{ borderColor: alpha('#fff', 0.06), mx: 2 }} />

      {/* Navigation */}
      <List sx={{ px: 1.5, py: 1.5, flex: 1 }}>
        <Typography
          variant="caption"
          sx={{ px: 1.5, py: 1, display: 'block', color: alpha('#fff', 0.3), fontWeight: 600, letterSpacing: 1.5, fontSize: '0.6rem' }}
        >
          NAVIGATION
        </Typography>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <ListItemButton
              key={item.path}
              component={NavLink}
              to={item.path}
              onClick={() => setOpen(false)}
              sx={{
                borderRadius: '10px',
                mb: 0.3,
                px: 1.5,
                py: 0.9,
                color: isActive ? '#fff' : SIDEBAR_TEXT,
                bgcolor: isActive ? alpha('#0D9488', 0.2) : 'transparent',
                '&:hover': {
                  bgcolor: isActive ? alpha('#0D9488', 0.25) : alpha('#fff', 0.04),
                },
                transition: 'all 0.15s',
              }}
            >
              <ListItemIcon sx={{ minWidth: 38 }}>
                <Icon sx={{ fontSize: 20, color: isActive ? '#14B8A6' : alpha('#fff', 0.35) }} />
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  fontSize: '0.85rem',
                  fontWeight: isActive ? 600 : 400,
                }}
              />
              {isActive && (
                <Box
                  sx={{
                    width: 4,
                    height: 20,
                    borderRadius: 2,
                    bgcolor: '#14B8A6',
                  }}
                />
              )}
            </ListItemButton>
          );
        })}
      </List>

      <Divider sx={{ borderColor: alpha('#fff', 0.06), mx: 2 }} />

      {/* User section */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar
          sx={{
            width: 36,
            height: 36,
            fontSize: '0.8rem',
            fontWeight: 700,
            bgcolor: ROLE_COLORS[role] || '#64748B',
          }}
        >
          {initials}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{ color: '#fff', fontWeight: 600, fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {user?.first_name} {user?.last_name}
          </Typography>
          <Chip
            label={role?.toUpperCase()}
            size="small"
            sx={{
              height: 18,
              fontSize: '0.6rem',
              fontWeight: 700,
              bgcolor: alpha(ROLE_COLORS[role] || '#64748B', 0.15),
              color: ROLE_COLORS[role] || '#64748B',
              borderRadius: '4px',
            }}
          />
        </Box>
        <IconButton
          onClick={logout}
          size="small"
          sx={{ color: alpha('#fff', 0.4), '&:hover': { color: '#DC2626', bgcolor: alpha('#DC2626', 0.1) } }}
        >
          <LogoutIcon fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Top bar (mobile only) */}
      {isMobile && (
        <AppBar
          position="fixed"
          sx={{
            bgcolor: SIDEBAR_BG,
            boxShadow: `0 1px 4px ${alpha('#000', 0.12)}`,
          }}
        >
          <Toolbar>
            <IconButton color="inherit" edge="start" onClick={() => setOpen(true)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
              URAS
            </Typography>
            <NotificationPanel />
            <Chip
              label={role?.toUpperCase()}
              size="small"
              sx={{
                height: 22,
                fontSize: '0.65rem',
                fontWeight: 700,
                bgcolor: alpha(ROLE_COLORS[role] || '#64748B', 0.2),
                color: '#fff',
              }}
            />
          </Toolbar>
        </AppBar>
      )}

      {isMobile ? (
        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          variant="temporary"
          sx={{ '& .MuiDrawer-paper': { width: drawerWidth, border: 'none' } }}
        >
          {drawerContent}
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box', border: 'none' },
          }}
        >
          {drawerContent}
        </Drawer>
      )}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          mt: isMobile ? 8 : 0,
          minHeight: '100vh',
          maxWidth: '100%',
          overflow: 'hidden',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
