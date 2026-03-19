import { useEffect, useState } from 'react';
import {
  Avatar,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Typography,
  alpha,
} from '@mui/material';
import ApartmentIcon from '@mui/icons-material/Apartment';
import BusinessIcon from '@mui/icons-material/Business';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import GroupIcon from '@mui/icons-material/Group';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import SecurityIcon from '@mui/icons-material/Security';
import TuneIcon from '@mui/icons-material/Tune';
import SchoolIcon from '@mui/icons-material/School';
import BadgeIcon from '@mui/icons-material/Badge';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import { useAuth } from '../auth/AuthContext';
import { resourceApi } from '../../services/resourceApi';

const ROLE_COLORS = {
  admin: '#DC2626',
  staff: '#D97706',
  faculty: '#2563EB',
  student: '#16A34A',
};

const ROLE_ICONS = {
  admin: SecurityIcon,
  staff: BadgeIcon,
  faculty: SchoolIcon,
  student: VerifiedUserIcon,
};

const roleDescriptions = {
  admin: 'Full system access — manage users, roles, buildings, rooms, inventory, and allocation policies.',
  staff: 'Manage rooms, review allocations, and maintain inventory and operational readiness.',
  faculty: 'View room allocations, check availability, and monitor department resources.',
  student: 'Browse available rooms, view building details, and check allocations.',
};

function StatCard({ icon: Icon, label, value, color, loading }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 2.5 }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Avatar
            sx={{
              width: 48,
              height: 48,
              bgcolor: alpha(color, 0.1),
              color: color,
              borderRadius: '12px',
            }}
            variant="rounded"
          >
            <Icon />
          </Avatar>
          <Box>
            <Typography variant="h5" fontWeight={800} sx={{ lineHeight: 1.1 }}>
              {loading ? '—' : value}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>
              {label}
            </Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function FeatureCard({ icon: Icon, title, description, color }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 2.5 }}>
        <Stack spacing={1.5}>
          <Avatar
            sx={{
              width: 40,
              height: 40,
              bgcolor: alpha(color, 0.1),
              color: color,
              borderRadius: '10px',
            }}
            variant="rounded"
          >
            <Icon sx={{ fontSize: 22 }} />
          </Avatar>
          <Typography variant="subtitle1" fontWeight={600}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            {description}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

const roleFeatures = {
  admin: [
    { icon: GroupIcon, title: 'User Management', description: 'Create, update, and deactivate user accounts. Assign roles and departments.', color: '#DC2626' },
    { icon: TuneIcon, title: 'Allocation Policies', description: 'Configure booking durations, advance limits, approval chains, and priority levels per role.', color: '#7C3AED' },
    { icon: SecurityIcon, title: 'RBAC Configuration', description: 'Role-based access control with granular permissions across all system resources.', color: '#0D9488' },
  ],
  staff: [
    { icon: MeetingRoomIcon, title: 'Room Management', description: 'Add, edit, and manage room infrastructure, capacity, and equipment flags.', color: '#2563EB' },
    { icon: Inventory2Icon, title: 'Inventory Tracking', description: 'Monitor room equipment lifecycle — from procurement to maintenance.', color: '#D97706' },
    { icon: EventAvailableIcon, title: 'Allocation Oversight', description: 'View and manage room allocations, schedules, and booking approvals.', color: '#16A34A' },
  ],
  faculty: [
    { icon: EventAvailableIcon, title: 'View Allocations', description: 'Check room allocations and weekly schedules for your department.', color: '#2563EB' },
    { icon: Inventory2Icon, title: 'Room Inventory', description: 'Inspect equipment and infrastructure details for any room.', color: '#D97706' },
    { icon: ApartmentIcon, title: 'Department Info', description: 'Access department metadata, contact details, and building assignments.', color: '#7C3AED' },
  ],
  student: [
    { icon: MeetingRoomIcon, title: 'Browse Rooms', description: 'Explore available rooms across buildings and check their capacity.', color: '#2563EB' },
    { icon: BusinessIcon, title: 'Building Directory', description: 'Navigate the campus building directory with floor and room details.', color: '#16A34A' },
    { icon: ApartmentIcon, title: 'Department Info', description: 'View department listings and contact information.', color: '#D97706' },
  ],
};

export function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role || user?.role_name || 'student';
  const RoleIcon = ROLE_ICONS[role] || VerifiedUserIcon;
  const roleColor = ROLE_COLORS[role] || '#64748B';
  const features = roleFeatures[role] || [];

  const [stats, setStats] = useState({ departments: 0, buildings: 0, rooms: 0, users: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [deptRes, buildRes, roomRes] = await Promise.all([
          resourceApi.listDepartments().catch(() => null),
          resourceApi.listBuildings().catch(() => null),
          resourceApi.listRooms().catch(() => null),
        ]);
        const deptData = deptRes?.data?.data;
        const buildData = buildRes?.data?.data;
        const roomData = roomRes?.data?.data;
        setStats({
          departments: Array.isArray(deptData) ? deptData.length : 0,
          buildings: Array.isArray(buildData) ? buildData.length : 0,
          rooms: Array.isArray(roomData?.rooms) ? roomData.rooms.length : (Array.isArray(roomData) ? roomData.length : 0),
          users: '—',
        });
      } catch { /* ignore */ }
      setLoading(false);
    };
    fetchStats();
  }, []);

  return (
    <Stack spacing={3}>
      {/* Welcome banner */}
      <Card
        sx={{
          background: `linear-gradient(135deg, ${alpha(roleColor, 0.08)} 0%, ${alpha('#0D9488', 0.06)} 100%)`,
          border: `1px solid ${alpha(roleColor, 0.12)}`,
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} alignItems={{ sm: 'center' }}>
            <Avatar
              sx={{
                width: 56,
                height: 56,
                bgcolor: alpha(roleColor, 0.12),
                color: roleColor,
                borderRadius: '14px',
              }}
              variant="rounded"
            >
              <RoleIcon sx={{ fontSize: 30 }} />
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <Typography variant="h5">
                  Welcome, {user?.first_name || 'User'}
                </Typography>
                <Chip
                  label={role?.toUpperCase()}
                  size="small"
                  sx={{
                    bgcolor: alpha(roleColor, 0.12),
                    color: roleColor,
                    fontWeight: 700,
                    fontSize: '0.65rem',
                    height: 22,
                  }}
                />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 560 }}>
                {roleDescriptions[role]}
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Stats row */}
      <Grid container spacing={2}>
        <Grid item xs={6} md={3}>
          <StatCard icon={ApartmentIcon} label="Departments" value={stats.departments} color="#7C3AED" loading={loading} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard icon={BusinessIcon} label="Buildings" value={stats.buildings} color="#2563EB" loading={loading} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard icon={MeetingRoomIcon} label="Rooms" value={stats.rooms} color="#0D9488" loading={loading} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard icon={EventAvailableIcon} label="Allocations" value="—" color="#D97706" loading={loading} />
        </Grid>
      </Grid>

      {/* Feature cards */}
      <Box>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5, textTransform: 'uppercase', letterSpacing: 1 }}>
          Quick Actions
        </Typography>
        <Grid container spacing={2}>
          {features.map((f, idx) => (
            <Grid item xs={12} md={4} key={idx}>
              <FeatureCard {...f} />
            </Grid>
          ))}
        </Grid>
      </Box>
    </Stack>
  );
}
