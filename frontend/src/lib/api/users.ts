import { request } from "./client";
import type {
  FacultyUser,
  ManagedUsersListResponse,
  StaffBuildingAssignmentsResponse,
  UserRole,
  AssignableUserRole,
} from "./types";

export async function getFacultyUsers(): Promise<FacultyUser[]> {
  return request<FacultyUser[]>("/users/faculty");
}

export async function getManagedUsers(filters?: {
  page?: number;
  limit?: number;
  role?: UserRole;
  department?: string;
  search?: string;
  isActive?: boolean;
}): Promise<ManagedUsersListResponse> {
  const params = new URLSearchParams();

  if (filters?.page !== undefined) params.set("page", String(filters.page));
  if (filters?.limit !== undefined) params.set("limit", String(filters.limit));
  if (filters?.role) params.set("role", filters.role);
  if (filters?.department) params.set("department", filters.department);
  if (filters?.search) params.set("search", filters.search);
  if (filters?.isActive !== undefined) params.set("is_active", String(filters.isActive));

  const query = params.toString();
  return request<ManagedUsersListResponse>(`/users${query ? `?${query}` : ""}`);
}

export async function createManagedUser(input: {
  name?: string;
  email: string;
  password?: string;
  role: "ADMIN" | "STAFF" | "FACULTY";
  department?: string;
  authProvider?: "email" | "google";
}): Promise<{
  id: number;
  name: string;
  email: string;
  role: UserRole;
  department: string | null;
  isActive: boolean;
  registeredVia: string;
}> {
  return request("/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateManagedUserRole(
  userId: number,
  role: AssignableUserRole,
): Promise<{
  id: number;
  name: string;
  email: string;
  role: AssignableUserRole;
  isActive: boolean;
}> {
  return request(`/users/${userId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export async function updateManagedUserActiveStatus(
  userId: number,
  isActive: boolean,
): Promise<{
  id: number;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}> {
  return request(`/users/${userId}/active`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
}

export async function deleteManagedUser(userId: number): Promise<void> {
  await request<{ ok: boolean }>(`/users/${userId}`, {
    method: "DELETE",
  });
}

export async function getUserBuildingAssignments(
  userId: number,
): Promise<StaffBuildingAssignmentsResponse> {
  return request<StaffBuildingAssignmentsResponse>(`/users/${userId}/building-assignments`);
}

export async function updateUserBuildingAssignments(
  userId: number,
  buildingIds: number[],
): Promise<StaffBuildingAssignmentsResponse> {
  return request<StaffBuildingAssignmentsResponse>(`/users/${userId}/building-assignments`, {
    method: "PUT",
    body: JSON.stringify({ buildingIds }),
  });
}
