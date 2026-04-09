import { request } from "./client";

export type UserProfile = {
  id: number;
  name: string;
  email: string;
  role: string;
  department: string | null;
  avatarUrl: string | null;
  registeredVia: string;
  isActive: boolean;
  createdAt: string;
};

export type UpdateProfileInput = {
  department?: string | null;
};

export async function getCurrentUserProfile(): Promise<UserProfile> {
  return request<UserProfile>("/users/profile");
}

export async function updateUserProfile(
  input: UpdateProfileInput,
): Promise<UserProfile> {
  return request<UserProfile>("/users/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteUserAccount(): Promise<void> {
  await request<{ ok: boolean }>("/users/profile", {
    method: "DELETE",
  });
}

export type ActivityLog = {
  id: string;
  type: "LOGIN" | "BOOKING" | "ACTION" | "REQUEST";
  title: string;
  description: string;
  timestamp: string;
  metadata?: {
    ipAddress?: string;
    device?: string;
    bookingId?: number;
    requestId?: number;
    status?: string;
    source?: string;
  };
};

export async function getUserActivityLog(
  _userId: number,
  limit: number = 15,
): Promise<ActivityLog[]> {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 20) : 15;

  return request<ActivityLog[]>(`/users/profile/activity?limit=${safeLimit}`);
}

export type Session = {
  id: string;
  deviceName: string;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrentSession: boolean;
};

export async function getUserSessions(_userId: number): Promise<Session[]> {
  return request<Session[]>('/users/profile/sessions');
}

export async function signOutOtherSessions(_userId: number): Promise<void> {
  await request<{ ok: boolean; terminatedSessions: number }>('/users/profile/sessions/logout-others', {
    method: 'POST',
  });
}

export type UserData = {
  user: UserProfile;
  bookings: Array<{
    id: number;
    title: string;
    status: string;
    createdAt: string;
  }>;
  requests: Array<{
    id: number;
    title: string;
    status: string;
    createdAt: string;
  }>;
};

export async function exportUserData(_userId: number): Promise<UserData> {
  const data = await request<{
    exportedAt: string;
    user: UserProfile;
    bookingRequests: Array<{ id: number; eventType: string; purpose: string; status: string; startAt: string; endAt: string; createdAt: string }>;
    approvedBookings: Array<{ id: number; roomId: number; startAt: string; endAt: string; source: string; approvedAt: string }>;
  }>("/users/profile/export");
  
  return {
    user: data.user,
    bookings: data.approvedBookings.map(b => ({
      id: b.id,
      title: "Approved Room Booking",
      status: 'APPROVED',
      createdAt: b.approvedAt,
    })),
    requests: data.bookingRequests.map(br => ({
      id: br.id,
      title: br.purpose,
      status: br.status,
      createdAt: br.createdAt,
    })),
  };
}
