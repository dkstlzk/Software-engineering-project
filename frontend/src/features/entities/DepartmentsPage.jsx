import { EntityCrudPage } from './EntityCrudPage';
import { resourceApi } from '../../services/resourceApi';
import { useAuth } from '../auth/AuthContext';
import { activeChip } from './commonConfigs';

export function DepartmentsPage() {
  const { hasPermission } = useAuth();

  return (
    <EntityCrudPage
      title="Departments"
      subtitle="Manage academic departments and metadata"
      listFn={resourceApi.listDepartments}
      createFn={resourceApi.createDepartment}
      updateFn={resourceApi.updateDepartment}
      deleteFn={resourceApi.deleteDepartment}
      canCreate={hasPermission('departments', 'create')}
      canEdit={hasPermission('departments', 'update')}
      canDelete={hasPermission('departments', 'delete')}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code' },
        { key: 'contact_email', label: 'Contact Email' },
        { key: 'is_active', label: 'Status', render: activeChip },
      ]}
      formFields={[
        { key: 'name', label: 'Name', required: true },
        { key: 'code', label: 'Code', required: true },
        { key: 'description', label: 'Description', multiline: true, md: 12 },
        { key: 'contactEmail', label: 'Contact Email', type: 'email' },
        { key: 'contactPhone', label: 'Contact Phone' },
      ]}
    />
  );
}
