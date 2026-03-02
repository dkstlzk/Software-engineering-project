import { EntityCrudPage } from './EntityCrudPage';
import { resourceApi } from '../../services/resourceApi';
import { useAuth } from '../auth/AuthContext';
import { activeChip } from './commonConfigs';

export function AllocationsPage() {
  const { hasPermission } = useAuth();

  return (
    <EntityCrudPage
      title="Allocations"
      subtitle="Create and manage scheduled room allocations"
      listFn={resourceApi.listAllocations}
      createFn={resourceApi.createAllocation}
      updateFn={resourceApi.updateAllocation}
      deleteFn={resourceApi.deleteAllocation}
      canCreate={hasPermission('allocations', 'create')}
      canEdit={hasPermission('allocations', 'update')}
      canDelete={hasPermission('allocations', 'delete')}
      columns={[
        { key: 'room_id', label: 'Room ID' },
        { key: 'slot_id', label: 'Slot ID' },
        { key: 'effective_from', label: 'From' },
        { key: 'effective_until', label: 'Until' },
        { key: 'is_active', label: 'Status', render: activeChip },
      ]}
      formFields={[
        { key: 'roomId', label: 'Room ID', required: true },
        { key: 'slotId', label: 'Slot ID', required: true },
        { key: 'courseId', label: 'Course ID' },
        { key: 'instructorId', label: 'Instructor ID' },
        { key: 'academicYearId', label: 'Academic Year ID' },
        { key: 'effectiveFrom', label: 'Effective From (YYYY-MM-DD)', required: true },
        { key: 'effectiveUntil', label: 'Effective Until (YYYY-MM-DD)' },
      ]}
    />
  );
}
