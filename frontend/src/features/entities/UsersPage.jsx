import { EntityCrudPage } from './EntityCrudPage';
import { resourceApi } from '../../services/resourceApi';
import { useAuth } from '../auth/AuthContext';
import { roleChip } from './commonConfigs';

export function UsersPage() {
  const { hasRole } = useAuth();

  return (
    <EntityCrudPage
      title="Users"
      subtitle="Register and administer user accounts"
      listFn={resourceApi.listUsers}
      createFn={resourceApi.registerUser}
      updateFn={resourceApi.updateUser}
      deleteFn={resourceApi.deleteUser}
      canCreate={hasRole(['admin'])}
      canEdit={hasRole(['admin'])}
      canDelete={hasRole(['admin'])}
      columns={[
        { key: 'email', label: 'Email' },
        { key: 'first_name', label: 'First Name' },
        { key: 'last_name', label: 'Last Name' },
        { key: 'role_name', label: 'Role', render: roleChip },
      ]}
      formFields={[
        { key: 'email', label: 'Email', required: true, type: 'email' },
        { key: 'password', label: 'Password', required: true, type: 'password' },
        { key: 'firstName', label: 'First Name', required: true },
        { key: 'lastName', label: 'Last Name', required: true },
        { key: 'roleId', label: 'Role ID', required: true },
        { key: 'departmentId', label: 'Department ID' },
        { key: 'employeeId', label: 'Employee ID' },
        { key: 'studentId', label: 'Student ID' },
        { key: 'phone', label: 'Phone' },
      ]}
    />
  );
}
