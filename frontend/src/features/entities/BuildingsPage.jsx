import { EntityCrudPage } from './EntityCrudPage';
import { resourceApi } from '../../services/resourceApi';
import { useAuth } from '../auth/AuthContext';
import { activeChip } from './commonConfigs';

export function BuildingsPage() {
  const { hasPermission } = useAuth();

  return (
    <EntityCrudPage
      title="Buildings"
      subtitle="Manage campus buildings and infrastructure"
      listFn={resourceApi.listBuildings}
      createFn={resourceApi.createBuilding}
      updateFn={resourceApi.updateBuilding}
      deleteFn={resourceApi.deleteBuilding}
      canCreate={hasPermission('buildings', 'create')}
      canEdit={hasPermission('buildings', 'update')}
      canDelete={hasPermission('buildings', 'delete')}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code' },
        { key: 'floors', label: 'Floors' },
        { key: 'is_active', label: 'Status', render: activeChip },
      ]}
      formFields={[
        { key: 'name', label: 'Name', required: true },
        { key: 'code', label: 'Code', required: true },
        { key: 'address', label: 'Address', multiline: true, md: 12 },
        { key: 'floors', label: 'Floors', type: 'number' },
      ]}
    />
  );
}
