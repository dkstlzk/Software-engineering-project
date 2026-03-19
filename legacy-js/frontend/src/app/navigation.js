import DashboardIcon from '@mui/icons-material/Dashboard';
import ApartmentIcon from '@mui/icons-material/Apartment';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import BusinessIcon from '@mui/icons-material/Business';
import GroupIcon from '@mui/icons-material/Group';
import TuneIcon from '@mui/icons-material/Tune';
import ExploreIcon from '@mui/icons-material/Explore';
import ScheduleIcon from '@mui/icons-material/Schedule';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import EventSeatIcon from '@mui/icons-material/EventSeat';
import BookOnlineIcon from '@mui/icons-material/BookOnline';
import ListAltIcon from '@mui/icons-material/ListAlt';
import AssignmentIcon from '@mui/icons-material/Assignment';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';

const allItems = [
  { label: 'Dashboard', path: '/', icon: DashboardIcon, roles: ['admin', 'staff', 'faculty', 'student'] },
  // { label: 'Departments', path: '/departments', icon: ApartmentIcon, roles: ['admin', 'staff', 'faculty', 'student'] },
  // { label: 'Buildings', path: '/buildings', icon: BusinessIcon, roles: ['admin', 'staff', 'faculty', 'student'] },
  { label: 'Explorer', path: '/explorer', icon: ExploreIcon, roles: ['admin', 'staff', 'faculty', 'student'] },
  // { label: 'Rooms', path: '/rooms', icon: MeetingRoomIcon, roles: ['admin', 'staff', 'faculty', 'student'] },
  // { label: 'Inventory', path: '/inventory', icon: Inventory2Icon, roles: ['admin', 'staff', 'faculty', 'student'] },
  { label: 'Allocations', path: '/allocations', icon: EventAvailableIcon, roles: ['admin', 'staff', 'faculty', 'student'] },
  { label: 'Slot System Upload', path: '/slot-system/upload', icon: ScheduleIcon, roles: ['admin', 'staff'] },
  { label: 'Timetable Upload', path: '/timetable/upload', icon: CalendarMonthIcon, roles: ['admin', 'staff'] },
  { label: 'Room Availability', path: '/rooms/availability', icon: EventSeatIcon, roles: ['admin', 'staff', 'faculty', 'student'] },
  { label: 'Book a Room', path: '/booking/request', icon: BookOnlineIcon, roles: ['admin', 'staff', 'faculty', 'student'] },
  { label: 'My Bookings', path: '/booking/status', icon: ListAltIcon, roles: ['admin', 'staff', 'faculty', 'student'] },
  { label: 'Faculty Review', path: '/dashboard/faculty', icon: AssignmentIcon, roles: ['faculty'] },
  { label: 'Approval Queue', path: '/dashboard/admin', icon: AdminPanelSettingsIcon, roles: ['admin', 'staff'] },
  { label: 'Policies', path: '/policies', icon: TuneIcon, roles: ['admin'] },
  // { label: 'Users', path: '/users', icon: GroupIcon, roles: ['admin'] },
];

export function getNavigationForRole(role) {
  return allItems.filter((item) => item.roles.includes(role));
}
