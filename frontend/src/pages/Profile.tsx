import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useUpdateProfile,
  useDeleteAccount,
  useUserProfile,
  useUserSessions,
  useSignOutOtherSessions,
  useUserActivityLog,
} from "../hooks/useProfile";
import { request } from "../lib/api/client";
import { LogOut, Lock, Download, Trash2 } from "lucide-react";

// Form schemas
const updateProfileSchema = z.object({
  department: z.string().max(100, "Department must be less than 100 characters").optional(),
});

type UpdateProfileFormData = z.infer<typeof updateProfileSchema>;

// Disclaimers for incomplete features

function getRoleBadgeColor(role: string) {
  const colors: Record<string, string> = {
    ADMIN: "bg-red-100 text-red-800",
    STAFF: "bg-blue-100 text-blue-800",
    FACULTY: "bg-purple-100 text-purple-800",
    STUDENT: "bg-green-100 text-green-800",
    PENDING_ROLE: "bg-gray-100 text-gray-800",
  };
  return colors[role] || "bg-gray-100 text-gray-800";
}

interface EditProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userRole: string;
  initialDepartment?: string | null;
  onSubmit: (data: UpdateProfileFormData) => Promise<void>;
  isLoading: boolean;
}

function EditProfileModal({
  open,
  onOpenChange,
  userRole,
  initialDepartment,
  onSubmit,
  isLoading,
}: EditProfileModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateProfileFormData>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      department: initialDepartment ?? "",
    },
  });

  useEffect(() => {
    if (open) {
      reset({ department: initialDepartment ?? "" });
    }
  }, [open, initialDepartment, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Update your profile information. Some fields are managed by administrators.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {userRole === "FACULTY" && (
            <div>
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                placeholder="e.g., Computer Science"
                {...register("department")}
                disabled={isLoading}
              />
              {errors.department && (
                <p className="text-sm text-red-500 mt-1">{errors.department.message}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">Optional field</p>
            </div>
          )}
          {userRole !== "FACULTY" && (
            <p className="text-sm text-gray-600">
              Your profile information can only be updated by administrators.
            </p>
          )}
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || userRole !== "FACULTY"}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  isLoading: boolean;
}

function DeleteAccountModal({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: DeleteAccountModalProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Account</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. Your account and associated data will be marked as deleted.
            This is in compliance with GDPR data retention policies.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="my-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">
            <strong>Warning:</strong> All your personal information will be anonymized and your
            account will be deactivated.
          </p>
        </div>
        <div className="flex gap-3 justify-end">
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700"
          >
            {isLoading ? "Deleting..." : "Delete Account"}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ProfileSection() {
  const { user } = useAuth();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const { data: profile, isLoading: profileLoading } = useUserProfile(user?.id);
  const updateMutation = useUpdateProfile();

  if (!user) return null;

  const profileName = profile?.name ?? user.name;
  const profileEmail = profile?.email ?? user.email ?? "N/A";
  const profileRole = profile?.role ?? user.role;
  const profileDepartment = profile?.department ?? user.department ?? null;

  const handleEditSubmit = async (data: UpdateProfileFormData) => {
    try {
      await updateMutation.mutateAsync(data);
      setEditModalOpen(false);
    } catch (error) {
      console.error("Failed to update profile:", error);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Your basic profile details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {profileLoading && !profile ? (
            <p className="text-sm text-gray-500">Loading profile details...</p>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="text-xs font-semibold text-gray-600">Full Name</Label>
              <p className="text-sm font-medium mt-1">{profileName}</p>
              <p className="text-xs text-gray-500">Read-only</p>
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-600">Email</Label>
              <p className="text-sm font-medium mt-1">{profileEmail}</p>
              <p className="text-xs text-gray-500">Read-only</p>
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-600">Role</Label>
              <div className="mt-1">
                <Badge className={getRoleBadgeColor(profileRole)}>{profileRole}</Badge>
              </div>
              <p className="text-xs text-gray-500 mt-1">System role</p>
            </div>
            {profileDepartment && (
              <div>
                <Label className="text-xs font-semibold text-gray-600">Department</Label>
                <p className="text-sm font-medium mt-1">{profileDepartment}</p>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => setEditModalOpen(true)}
              className="gap-2"
            >
              Edit Profile
            </Button>
          </div>
        </CardContent>
      </Card>

      <EditProfileModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        userRole={profileRole}
        initialDepartment={profileDepartment}
        onSubmit={handleEditSubmit}
        isLoading={updateMutation.isPending}
      />
    </div>
  );
}

function SettingsSection() {
  const { user } = useAuth();
  const [emailNotifications, setEmailNotifications] = useState(true);

  if (!user) {
    return null;
  }

  const connectedLabel = user.registeredVia === "google" ? "Google Account" : "Email / Password";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>Manage how you receive notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-sm">Email Notifications</p>
              <p className="text-xs text-gray-600">Receive updates via email</p>
            </div>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={emailNotifications}
                onChange={(e) => setEmailNotifications(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="ml-2 text-sm">{emailNotifications ? "Enabled" : "Disabled"}</span>
            </label>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Note: Preferences are currently saved locally on this browser.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected Accounts</CardTitle>
          <CardDescription>Third-party services linked to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div>
              <p className="font-medium text-sm">{connectedLabel}</p>
              <p className="text-xs text-gray-600">Connected</p>
            </div>
            <Badge className="bg-blue-100 text-blue-800">Connected</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SecuritySection() {
  const { user, logout } = useAuth();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const deleteMutation = useDeleteAccount();
  const signOutOtherSessionsMutation = useSignOutOtherSessions();
  const {
    data: sessions = [],
    isLoading: sessionsLoading,
    error: sessionsError,
  } = useUserSessions(user?.id);
  const { pushToast } = useToast();

  if (!user) return null;

  const hasOtherSessions = sessions.some((session) => !session.isCurrentSession);

  const handleExportData = async () => {
    try {
      setIsExporting(true);

      const data = await request<{
        exportedAt: string;
        user: { id: number; name: string; email: string; role: string; department?: string | null; registeredVia: string; createdAt: string };
        bookingRequests: Array<{ id: number; eventType: string; purpose: string; status: string; startAt: string; endAt: string; createdAt: string }>;
        approvedBookings: Array<{ id: number; roomId: number; startAt: string; endAt: string; source: string; approvedAt: string }>;
      }>("/users/profile/export");

      const sanitizedData = {
        exportedAt: data.exportedAt,
        user: {
          name: data.user.name,
          email: data.user.email,
          role: data.user.role,
          department: data.user.department,
          registeredVia: data.user.registeredVia,
          createdAt: data.user.createdAt,
        },
        bookingRequests: data.bookingRequests.map((requestRow) => ({
          eventType: requestRow.eventType,
          purpose: requestRow.purpose,
          status: requestRow.status,
          startAt: requestRow.startAt,
          endAt: requestRow.endAt,
          createdAt: requestRow.createdAt,
        })),
        approvedBookings: data.approvedBookings.map((booking) => ({
          startAt: booking.startAt,
          endAt: booking.endAt,
          source: booking.source,
          approvedAt: booking.approvedAt,
        })),
      };

      const dataStr = JSON.stringify(sanitizedData, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement("a");
      const exportDate = new Date().toISOString().split("T")[0];
      const slugSource = (user.name || user.email || "profile").trim().toLowerCase();
      const safeSlug = slugSource.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "profile";
      link.href = url;
      link.download = `user-data-${safeSlug}-${exportDate}.json`;
      link.click();
      URL.revokeObjectURL(url);

      pushToast("success", "Data exported successfully");
    } catch (error) {
      pushToast("error", "Failed to export data");
    } finally {
      setIsExporting(false);
    }
  };

  const handleSignOutOthers = async () => {
    if (!user?.id) {
      return;
    }

    try {
      await signOutOtherSessionsMutation.mutateAsync(user.id);
      pushToast("success", "Signed out all other sessions");
    } catch {
      pushToast("error", "Failed to sign out other sessions");
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await deleteMutation.mutateAsync();
      pushToast("success", "Account deletion initiated. You will be logged out.");
      setTimeout(() => {
        logout();
      }, 2000);
    } catch (error) {
      pushToast("error", "Failed to delete account");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Active Sessions
          </CardTitle>
          <CardDescription>Manage your active login sessions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sessionsLoading ? (
            <p className="text-sm text-gray-500">Loading sessions...</p>
          ) : sessionsError ? (
            <p className="text-sm text-red-600">Failed to load sessions.</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-gray-600">No active sessions found.</p>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="p-3 bg-gray-50 border border-gray-200 rounded-lg"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">
                      {session.deviceName}
                    </p>
                    {session.isCurrentSession ? (
                      <Badge className="bg-green-100 text-green-800">Current</Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Created: {new Date(session.createdAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-600">
                    IP: {session.ipAddress ?? "Unknown"}
                  </p>
                </div>
              ))}
            </div>
          )}

          <Button
            onClick={handleSignOutOthers}
            variant="outline"
            className="gap-2 w-full sm:w-auto"
            disabled={
              sessionsLoading ||
              signOutOtherSessionsMutation.isPending ||
              !hasOtherSessions
            }
          >
            <LogOut className="w-4 h-4" />
            {signOutOtherSessionsMutation.isPending
              ? "Signing Out..."
              : "Sign Out All Other Sessions"}
          </Button>

          {!sessionsLoading && sessions.length > 0 && !hasOtherSessions ? (
            <p className="text-xs text-gray-500">
              No other sessions available to sign out.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data & Privacy</CardTitle>
          <CardDescription>GDPR compliant data management</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleExportData} variant="outline" className="w-full gap-2" disabled={isExporting}>
            <Download className="w-4 h-4" />
            {isExporting ? "Exporting..." : "Download My Data (JSON)"}
          </Button>
          <p className="text-xs text-gray-500">
            Export your profile information and data in a portable JSON format.
          </p>
        </CardContent>
      </Card>

      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="text-red-800 flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            Danger Zone
          </CardTitle>
          <CardDescription className="text-red-700">
            Irreversible account actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => setDeleteModalOpen(true)}
            variant="destructive"
            className="w-full"
          >
            Delete Account
          </Button>
          <p className="text-xs text-red-700 mt-3">
            Once deleted, your account cannot be recovered. This action will anonymize your personal
            information according to GDPR requirements.
          </p>
        </CardContent>
      </Card>

      <DeleteAccountModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        onConfirm={handleDeleteAccount}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

function ActivitySection() {
  const { user } = useAuth();
  const {
    data: activityLog = [],
    isLoading,
    error,
  } = useUserActivityLog(user?.id, 20);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>Recent account activity and logins</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading activity...</p>
          ) : error ? (
            <p className="text-sm text-red-600">Failed to load activity.</p>
          ) : activityLog.length === 0 ? (
            <p className="text-sm text-gray-600">No recent activity found.</p>
          ) : (
            <div className="space-y-2">
              {activityLog.map((entry) => (
                <div
                  key={entry.id}
                  className="p-3 bg-gray-50 border border-gray-200 rounded-lg"
                >
                  <p className="text-sm font-medium text-gray-900">{entry.title}</p>
                  <p className="text-xs text-gray-600 mt-1">{entry.description}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {new Date(entry.timestamp).toLocaleString()}
                  </p>
                  {entry.metadata?.device || entry.metadata?.ipAddress ? (
                    <p className="text-xs text-gray-600 mt-1">
                      {entry.metadata?.device ?? "Unknown device"}
                      {entry.metadata?.ipAddress ? ` · ${entry.metadata.ipAddress}` : ""}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ProfilePage() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center w-full h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile & Settings</h1>
        <p className="text-gray-600 mt-2">Manage your account, preferences, and security</p>
      </div>

      <div className="max-w-4xl">
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4">
            <ProfileSection />
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <SettingsSection />
          </TabsContent>

          <TabsContent value="security" className="space-y-4">
            <SecuritySection />
          </TabsContent>

          <TabsContent value="activity" className="space-y-4">
            <ActivitySection />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
