import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { LoginPage } from '../features/auth/LoginPage';
import { AppLayout } from '../components/layout/AppLayout';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { UnauthorizedPage } from '../features/auth/UnauthorizedPage';
// import { DepartmentsPage } from '../features/entities/DepartmentsPage';
// import { RoomsPage } from '../features/entities/RoomsPage';
// import { InventoryPage } from '../features/entities/InventoryPage';
import { AllocationsPage } from '../features/entities/AllocationsPage';
import { BuildingExplorer } from '../features/entities/BuildingExplorer';
// import { BuildingsPage } from '../features/entities/BuildingsPage';
// import { UsersPage } from '../features/entities/UsersPage';
import { PoliciesPage } from '../features/entities/PoliciesPage';
import { SlotSystemUploadPage } from '../features/scheduling/SlotSystemUploadPage';
import { TimetableUploadPage } from '../features/scheduling/TimetableUploadPage';
import { RoomAvailabilityPage } from '../features/scheduling/RoomAvailabilityPage';
import { BookingRequestPage } from '../features/booking/BookingRequestPage';
import { BookingStatusPage } from '../features/booking/BookingStatusPage';
import { FacultyDashboard } from '../features/dashboard/FacultyDashboard';
import { AdminDashboard } from '../features/dashboard/AdminDashboard';

function AppShell() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        {/* <Route path="/departments" element={<DepartmentsPage />} /> */}
        {/* <Route path="/buildings" element={<BuildingsPage />} /> */}
        <Route path="/explorer" element={<BuildingExplorer />} />
        {/* <Route path="/rooms" element={<RoomsPage />} /> */}
        {/* <Route path="/inventory" element={<InventoryPage />} /> */}
        <Route path="/allocations" element={<AllocationsPage />} />
        <Route path="/slot-system/upload" element={<SlotSystemUploadPage />} />
        <Route path="/timetable/upload" element={<TimetableUploadPage />} />
        <Route path="/rooms/availability" element={<RoomAvailabilityPage />} />
        <Route path="/booking/request" element={<BookingRequestPage />} />
        <Route path="/booking/status" element={<BookingStatusPage />} />
        <Route path="/dashboard/faculty" element={<FacultyDashboard />} />
        <Route path="/dashboard/admin" element={<AdminDashboard />} />
        {/* <Route path="/users" element={<UsersPage />} /> */}
        <Route path="/policies" element={<PoliciesPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
