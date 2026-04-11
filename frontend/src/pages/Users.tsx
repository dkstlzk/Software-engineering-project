import { useEffect, useState } from "react";
import { createManagedUser, deleteManagedUser, getManagedUsers, updateManagedUserActiveStatus, updateManagedUserRole } from "../lib/api";
import type { AssignableUserRole, ManagedUser, UserRole } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { BuildingAssignmentDialog } from "./components/BuildingAssignmentDialog";
import { formatError } from "../utils/formatError";

type RoleFilter = "ALL" | UserRole;
const PAGE_SIZES = [10, 20, 50];
const ROLE_OPTIONS: AssignableUserRole[] = ["ADMIN", "STAFF", "FACULTY", "STUDENT"];
const ROLE_LABELS: Record<UserRole, string> = { ADMIN: "Admin", STAFF: "Staff", FACULTY: "Faculty", STUDENT: "Student", PENDING_ROLE: "Pending Role" };

function getUserDisplayName(user: ManagedUser) {
  return user.displayName?.trim() || user.name;
}

function roleBadgeVariant(role: UserRole) {
  const map: Record<UserRole, "default" | "destructive" | "secondary" | "outline"> = {
    ADMIN: "destructive", STAFF: "default", FACULTY: "secondary", STUDENT: "outline", PENDING_ROLE: "outline",
  };
  return map[role];
}

export function UsersPage() {
  const { user: authUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [{ page, pageSize, totalPages, totalUsers }, setPagination] = useState({ page: 1, pageSize: 20, totalPages: 0, totalUsers: 0 });
  const [filters, setFilters] = useState({ search: "", role: "ALL" as RoleFilter, status: "ALL" as "ALL" | "ACTIVE" | "INACTIVE", department: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [creatingUser, setCreatingUser] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "", password: "", role: "FACULTY" as "ADMIN" | "STAFF" | "FACULTY", department: "", authProvider: "email" as "email" | "google" });
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [deactivatingUser, setDeactivatingUser] = useState<ManagedUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<ManagedUser | null>(null);
  const [bulkActionMode, setBulkActionMode] = useState<"activate" | "deactivate" | "role" | null>(null);
  const [bulkRole, setBulkRole] = useState<AssignableUserRole>("FACULTY");
  const [managingBuildingsUser, setManagingBuildingsUser] = useState<ManagedUser | null>(null);

  const loadUsers = async (targetPage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const response = await getManagedUsers({
        page: targetPage,
        limit: pageSize,
        ...(filters.search && { search: filters.search }),
        ...(filters.role !== "ALL" && { role: filters.role }),
        ...(filters.status === "ACTIVE" && { isActive: true }),
        ...(filters.status === "INACTIVE" && { isActive: false }),
        ...(filters.department && { department: filters.department }),
      });
      setUsers(response.data);
      setPagination({ page: response.pagination.page, pageSize, totalPages: response.pagination.totalPages, totalUsers: response.pagination.total });
      setSelectedIds(new Set());
    } catch (e) {
      setError(formatError(e, "Failed to load users"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authUser?.role !== "ADMIN") return;
    void loadUsers(1);
  }, [authUser?.role]); // eslint-disable-next-line react-hooks/exhaustive-deps

  if (authUser?.role !== "ADMIN") {
    return (
      <section>
        <div className="page-header">
          <h2>User Management</h2>
          <p>Admin access required.</p>
        </div>
        <div className="alert alert-error">You do not have permission to access this page.</div>
      </section>
    );
  }

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreatingUser(true);
    setError(null);
    try {
      await createManagedUser({
        email: createForm.email.toLowerCase().trim(),
        name: createForm.name.trim() || undefined,
        role: createForm.role,
        department: createForm.department.trim() || undefined,
        authProvider: createForm.authProvider,
        password: createForm.authProvider === "email" ? createForm.password : undefined,
      });
      setNotice(`User ${createForm.email} created successfully`);
      setCreateForm({ name: "", email: "", password: "", role: "FACULTY", department: "", authProvider: "email" });
      await loadUsers(1);
    } catch (e) {
      setError(formatError(e, "Failed to create user"));
    } finally {
      setCreatingUser(false);
    }
  };

  const handleBulkAction = async () => {
    if (selectedIds.size === 0) return;
    const userIds = Array.from(selectedIds);
    setLoading(true);
    try {
      if (bulkActionMode === "activate" || bulkActionMode === "deactivate") {
        const isActive = bulkActionMode === "activate";
        await Promise.all(userIds.map(id => updateManagedUserActiveStatus(id, isActive)));
        setNotice(`${userIds.length} user(s) ${isActive ? "activated" : "deactivated"}`);
      } else if (bulkActionMode === "role") {
        await Promise.all(userIds.map(id => updateManagedUserRole(id, bulkRole)));
        setNotice(`${userIds.length} user(s) role updated to ${ROLE_LABELS[bulkRole]}`);
      }
      await loadUsers(page);
      setBulkActionMode(null);
    } catch (e) {
      setError(formatError(e, "Bulk action failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async (targetUser: ManagedUser, newRole: AssignableUserRole) => {
    if (newRole === targetUser.role) return;
    setLoading(true);
    try {
      await updateManagedUserRole(targetUser.id, newRole);
      setNotice(`${getUserDisplayName(targetUser)}'s role updated`);
      await loadUsers(page);
    } catch (e) {
      setError(formatError(e, "Failed to update role"));
    } finally {
      setLoading(false);
      setEditingUser(null);
    }
  };

  const handleToggleStatus = async (targetUser: ManagedUser) => {
    setLoading(true);
    try {
      await updateManagedUserActiveStatus(targetUser.id, !targetUser.isActive);
      setNotice(`${getUserDisplayName(targetUser)} ${!targetUser.isActive ? "activated" : "deactivated"}`);
      await loadUsers(page);
    } catch (e) {
      setError(formatError(e, "Failed to update status"));
    } finally {
      setLoading(false);
      setDeactivatingUser(null);
    }
  };

  const handleDeleteUser = async (targetUser: ManagedUser) => {
    setLoading(true);
    try {
      await deleteManagedUser(targetUser.id);
      setNotice(`${getUserDisplayName(targetUser)} deleted`);
      const nextPage = page > 1 && users.length === 1 ? page - 1 : page;
      await loadUsers(nextPage);
    } catch (e) {
      setError(formatError(e, "Failed to delete user"));
    } finally {
      setLoading(false);
      setDeletingUser(null);
    }
  };

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === users.length ? new Set() : new Set(users.map(u => u.id)));
  };

  const toggleSelectUser = (userId: number) => {
    const newSelection = new Set(selectedIds);
    newSelection[newSelection.has(userId) ? "delete" : "add"](userId);
    setSelectedIds(newSelection);
  };

  const handleFilterChange = () => {
    setPagination(p => ({ ...p, page: 1 }));
    void loadUsers(1);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPagination(p => ({ ...p, pageSize: newSize, page: 1 }));
    void loadUsers(1);
  };

  return (
    <section className="space-y-6">
      <div className="page-header">
        <h2>User Management</h2>
        <p>Manage users, roles, and access permissions.</p>
      </div>

      {notice && <div className="alert alert-success">{notice}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleCreateUser} className="card space-y-4">
        <div className="card-header">
          <h3>Add New User</h3>
        </div>
        <div className="mb-4">
          <label className="text-sm font-medium mb-2 block">Authentication Provider</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="authProvider"
                value="email"
                checked={createForm.authProvider === "email"}
                onChange={(e) => setCreateForm({ ...createForm, authProvider: e.target.value as "email" | "google", password: "" })}
                disabled={creatingUser}
                className="w-4 h-4"
              />
              <span>Email/Password</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="authProvider"
                value="google"
                checked={createForm.authProvider === "google"}
                onChange={(e) => setCreateForm({ ...createForm, authProvider: e.target.value as "email" | "google", password: "" })}
                disabled={creatingUser}
                className="w-4 h-4"
              />
              <span>Google OAuth</span>
            </label>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input placeholder="Email" type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} disabled={creatingUser} required />
          <Input placeholder="Full Name" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} disabled={creatingUser} />
          {createForm.authProvider === "email" && (
            <Input placeholder="Password (min 8)" type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} disabled={creatingUser} required minLength={8} />
          )}
          <Input placeholder="Department" value={createForm.department} onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })} disabled={creatingUser} />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-sm font-medium mb-2 block">Role</label>
            <Select value={createForm.role} onValueChange={(v) => setCreateForm({ ...createForm, role: v as "ADMIN" | "STAFF" | "FACULTY" })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.filter(r => r !== "STUDENT").map(role => <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={creatingUser}>{creatingUser ? "Creating..." : "Create"}</Button>
        </div>
      </form>

      <div className="card space-y-4">
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-48">
            <label className="text-sm font-medium mb-2 block">Search</label>
            <Input placeholder="Name or email" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} onKeyDown={(e) => e.key === "Enter" && handleFilterChange()} />
          </div>
          <div className="min-w-40">
            <label className="text-sm font-medium mb-2 block">Role</label>
            <Select value={filters.role} onValueChange={(v) => { setFilters({ ...filters, role: v as RoleFilter }); handleFilterChange(); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Roles</SelectItem>
                {ROLE_OPTIONS.map(role => <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-40">
            <label className="text-sm font-medium mb-2 block">Status</label>
            <Select value={filters.status} onValueChange={(v) => { setFilters({ ...filters, status: v as "ALL" | "ACTIVE" | "INACTIVE" }); handleFilterChange(); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-40">
            <label className="text-sm font-medium mb-2 block">Department</label>
            <Input placeholder="Filter..." value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })} onKeyDown={(e) => e.key === "Enter" && handleFilterChange()} />
          </div>
          <Button onClick={handleFilterChange} variant="outline">Apply</Button>
          <Button onClick={() => { setFilters({ search: "", role: "ALL", status: "ALL", department: "" }); handleFilterChange(); }} variant="outline">Reset</Button>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 p-3 bg-muted rounded">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Button size="sm" onClick={() => setBulkActionMode("activate")} variant="outline">Activate</Button>
            <Button size="sm" onClick={() => setBulkActionMode("deactivate")} variant="outline">Deactivate</Button>
            <Button size="sm" onClick={() => setBulkActionMode("role")} variant="outline">Change Role</Button>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"><input type="checkbox" checked={selectedIds.size === users.length && users.length > 0} onChange={toggleSelectAll} className="rounded" /></TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Buildings</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && users.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : users.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No users found</TableCell></TableRow>
            ) : (
              users.map(u => (
                <TableRow key={u.id}>
                  <TableCell><input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggleSelectUser(u.id)} className="rounded" /></TableCell>
                  <TableCell className="font-medium">{getUserDisplayName(u)}</TableCell>
                  <TableCell className="text-sm">{u.email}</TableCell>
                  <TableCell><Badge variant={roleBadgeVariant(u.role)}>{ROLE_LABELS[u.role]}</Badge></TableCell>
                  <TableCell className="text-sm">{u.department || "—"}</TableCell>
                  <TableCell className="text-sm">
                    {u.role === "STAFF" ? (
                      u.assignedBuildings?.length > 0 ? (
                        <div className="flex gap-1 flex-wrap">
                          {u.assignedBuildings.slice(0, 2).map(b => (
                            <Badge key={b.id} variant="secondary" className="text-xs">{b.name}</Badge>
                          ))}
                          {u.assignedBuildings.length > 2 && (
                            <Badge variant="secondary" className="text-xs">+{u.assignedBuildings.length - 2}</Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell><Badge variant={u.isActive ? "outline" : "secondary"}>{u.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="outline" onClick={() => setEditingUser(u)}>Edit</Button>
                    {u.role === "STAFF" && (
                      <Button size="sm" variant="outline" onClick={() => setManagingBuildingsUser(u)}>Buildings</Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setDeactivatingUser(u)}>{u.isActive ? "Deactivate" : "Activate"}</Button>
                    <Button size="sm" variant="destructive" onClick={() => setDeletingUser(u)}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between p-4 border-t">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Size:</span>
            <Select value={String(pageSize)} onValueChange={(v) => handlePageSizeChange(parseInt(v))}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map(size => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground">
            {totalUsers === 0 ? "No users" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalUsers)} of ${totalUsers}`}
          </div>
          <div className="flex gap-2">
            <Button onClick={() => loadUsers(Math.max(1, page - 1))} disabled={page === 1} variant="outline" size="sm">Previous</Button>
            <span className="text-sm text-muted-foreground px-3 py-2">{page} / {totalPages || 1}</span>
            <Button onClick={() => loadUsers(page + 1)} disabled={page >= totalPages} variant="outline" size="sm">Next</Button>
          </div>
        </div>
      </div>

      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User Role</DialogTitle>
            <DialogDescription>Change the role for {editingUser && getUserDisplayName(editingUser)}</DialogDescription>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">New Role</label>
                <Select value={editingUser.role} onValueChange={(v) => setEditingUser({ ...editingUser, role: v as AssignableUserRole })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map(role => <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
                <Button onClick={() => handleUpdateRole(editingUser, editingUser.role as AssignableUserRole)}>Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deactivatingUser} onOpenChange={(open) => !open && setDeactivatingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deactivatingUser?.isActive ? "Deactivate" : "Activate"} User?</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivatingUser && (deactivatingUser.isActive ? `${getUserDisplayName(deactivatingUser)} will be deactivated.` : `${getUserDisplayName(deactivatingUser)} will be activated.`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deactivatingUser && handleToggleStatus(deactivatingUser)}>
              {deactivatingUser?.isActive ? "Deactivate" : "Activate"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingUser && `${getUserDisplayName(deletingUser)} will be deleted permanently.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingUser && handleDeleteUser(deletingUser)} className="bg-destructive">
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!bulkActionMode} onOpenChange={(open) => !open && setBulkActionMode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkActionMode === "activate" && "Activate Users?"}
              {bulkActionMode === "deactivate" && "Deactivate Users?"}
              {bulkActionMode === "role" && "Change Role?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will affect {selectedIds.size} user(s).
              {bulkActionMode === "role" && ` New role: ${ROLE_LABELS[bulkRole]}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {bulkActionMode === "role" && (
            <div className="space-y-3">
              <label className="text-sm font-medium">Select Role</label>
              <Select value={bulkRole} onValueChange={(v) => setBulkRole(v as AssignableUserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(role => <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkAction}>Confirm</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <BuildingAssignmentDialog
        user={managingBuildingsUser}
        open={!!managingBuildingsUser}
        onOpenChange={(open) => !open && setManagingBuildingsUser(null)}
        onSuccess={() => {
          setNotice(`Building assignments updated successfully`);
          void loadUsers(page);
        }}
      />
    </section>
  );
}
