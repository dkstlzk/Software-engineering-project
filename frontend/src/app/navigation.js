import DashboardIcon from '@mui/icons-material/Dashboard';
import ApartmentIcon from '@mui/icons-material/Apartment';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import BusinessIcon from '@mui/icons-material/Business';
import GroupIcon from '@mui/icons-material/Group';
import TuneIcon from '@mui/icons-material/Tune';
import ExploreIcon from '@mui/icons-material/Explore';

const allItems = [
  { label: 'Dashboard', path: '/', icon: DashboardIcon, roles: ['admin', 'staff', 'faculty', 'student'] },
  // { label: 'Departments', path: '/departments', icon: ApartmentIcon, roles: ['admin', 'staff', 'faculty', 'student'] },
  // { label: 'Buildings', path: '/buildings', icon: BusinessIcon, roles: ['admin', 'staff', 'faculty', 'student'] },
  { label: 'Explorer', path: '/explorer', icon: ExploreIcon, roles: ['admin', 'staff', 'faculty', 'student'] },
  // { label: 'Rooms', path: '/rooms', icon: MeetingRoomIcon, roles: ['admin', 'staff', 'faculty', 'student'] },
  // { label: 'Inventory', path: '/inventory', icon: Inventory2Icon, roles: ['admin', 'staff', 'faculty', 'student'] },
  { label: 'Allocations', path: '/allocations', icon: EventAvailableIcon, roles: ['admin', 'staff', 'faculty', 'student'] },
  { label: 'Policies', path: '/policies', icon: TuneIcon, roles: ['admin'] },
  // { label: 'Users', path: '/users', icon: GroupIcon, roles: ['admin'] },
];

export function getNavigationForRole(role) {
  return allItems.filter((item) => item.roles.includes(role));
}
