import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import {
  clearProfileSetupRequired,
  isProfileSetupRequiredForUser,
} from "../auth/profileSetup";
import { useUserProfile, useUpdateProfile } from "../hooks/useProfile";
import { useToast } from "../context/ToastContext";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

const profileSetupSchema = z.object({
  department: z.string().max(100, "Department must be less than 100 characters").optional(),
});

type ProfileSetupFormData = z.infer<typeof profileSetupSchema>;

function getRoleBadgeColor(role: string) {
  const colors: Record<string, string> = {
    ADMIN: "bg-red-100 text-red-800",
    STAFF: "bg-blue-100 text-blue-800",
    FACULTY: "bg-indigo-100 text-indigo-800",
    STUDENT: "bg-green-100 text-green-800",
  };

  return colors[role] ?? "bg-gray-100 text-gray-800";
}

export default function ProfileSetupPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { pushToast } = useToast();
  const updateMutation = useUpdateProfile();
  const { data: profile, isLoading: profileLoading } = useUserProfile(user?.id);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ProfileSetupFormData>({
    resolver: zodResolver(profileSetupSchema),
    defaultValues: {
      department: "",
    },
  });

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    if (!isProfileSetupRequiredForUser(user.id)) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    reset({
      department: profile?.department ?? "",
    });
  }, [profile, reset]);

  const effectiveRole = profile?.role ?? user?.role ?? "STUDENT";
  const isFaculty = effectiveRole === "FACULTY";

  const onSubmit = async (values: ProfileSetupFormData) => {
    if (!user) {
      return;
    }

    const normalizedDepartment = values.department?.trim() ?? "";

    if (isFaculty && !normalizedDepartment) {
      setError("department", {
        type: "manual",
        message: "Department is required for faculty users",
      });
      return;
    }

    try {
      await updateMutation.mutateAsync({
        department: normalizedDepartment.length > 0 ? normalizedDepartment : null,
      });

      clearProfileSetupRequired(user.id);
      pushToast("success", "Profile setup complete.");
      navigate("/", { replace: true });
    } catch (error) {
      pushToast(
        "error",
        error instanceof Error ? error.message : "Failed to save profile setup",
      );
    }
  };

  if (!user || profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 px-4">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
          <p className="text-sm text-slate-600 mt-3">Loading your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-2xl shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Complete Your Profile</CardTitle>
          <CardDescription>
            Finish this quick setup before using the booking system.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="text-xs font-semibold text-gray-600">Name</Label>
                <p className="text-sm font-medium mt-1">{profile?.name ?? user.name}</p>
              </div>

              <div>
                <Label className="text-xs font-semibold text-gray-600">Email</Label>
                <p className="text-sm font-medium mt-1">{profile?.email ?? user.email ?? "N/A"}</p>
              </div>

              <div>
                <Label className="text-xs font-semibold text-gray-600">Role</Label>
                <div className="mt-1">
                  <Badge className={getRoleBadgeColor(effectiveRole)}>{effectiveRole}</Badge>
                </div>
              </div>

              <div>
                <Label htmlFor="department" className="text-xs font-semibold text-gray-600">
                  Department {isFaculty ? "*" : "(Optional)"}
                </Label>
                <Input
                  id="department"
                  placeholder="e.g., Computer Science"
                  {...register("department")}
                  disabled={updateMutation.isPending}
                  className="mt-1"
                />
                {errors.department && (
                  <p className="text-sm text-red-600 mt-1">{errors.department.message}</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="text-sm text-blue-900">
                This page appears only on your first login. You can update these details later from Profile & Settings.
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  logout();
                  navigate("/login", { replace: true });
                }}
                disabled={updateMutation.isPending}
              >
                Sign Out
              </Button>

              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save and Continue"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
