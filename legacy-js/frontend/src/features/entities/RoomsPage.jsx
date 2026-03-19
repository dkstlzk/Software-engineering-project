import { EntityCrudPage } from './EntityCrudPage';
import { resourceApi } from '../../services/resourceApi';
import { useAuth } from '../auth/AuthContext';
import { typeChip, boolChip } from './commonConfigs';

export function RoomsPage() {
  const { hasPermission } = useAuth();

  return (
    <EntityCrudPage
      title="Rooms"
      subtitle="Manage room master and infrastructure flags"
      listFn={resourceApi.listRooms}
      createFn={resourceApi.createRoom}
      updateFn={resourceApi.updateRoom}
      deleteFn={resourceApi.deleteRoom}
      canCreate={hasPermission('rooms', 'create')}
      canEdit={hasPermission('rooms', 'update')}
      canDelete={hasPermission('rooms', 'delete')}
      columns={[
        { key: 'room_number', label: 'Room No.' },
        { key: 'name', label: 'Name' },
        { key: 'room_type', label: 'Type', render: typeChip },
        { key: 'capacity', label: 'Capacity' },
        { key: 'has_projector', label: 'Projector', render: boolChip('Yes', '#2563EB') },
      ]}
      formFields={[
        { key: 'roomNumber', label: 'Room Number', required: true },
        { key: 'name', label: 'Name' },
        { key: 'buildingId', label: 'Building ID', required: true },
        { key: 'departmentId', label: 'Department ID' },
        { key: 'capacity', label: 'Capacity', required: true, type: 'number' },
        { key: 'roomType', label: 'Type (lecture_hall / classroom / lab)' },
        { key: 'floor', label: 'Floor', type: 'number' },
        { key: 'description', label: 'Description', multiline: true, md: 12 },
      ]}
      mapFormToPayload={(form) => ({
        ...form,
        capacity: Number(form.capacity),
        floor: form.floor === '' ? undefined : Number(form.floor),
      })}
    />
  );
}
