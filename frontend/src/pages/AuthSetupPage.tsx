import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "../auth/AuthContext";
import { Card } from "../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Label } from "../components/ui/label";
import { AlertCircle, CheckCircle, Loader2, Users, BookOpen, Shield } from "lucide-react";

type SetupStep = 1 | 2 | 3;

// Get available roles based on auth provider
function getAvailableRoles(authProvider: string | null): string[] {
  if (authProvider === "google") {
    return ["STUDENT"];
  }
  // Email auth only allows STUDENT in setup (STAFF/ADMIN need manual assignment)
  return ["STUDENT"];
}

const buildSetupSchema = (authProvider: string | null) => {
  const availableRoles = getAvailableRoles(authProvider);
  
  return z.object({
    role: z.enum(availableRoles.length > 0 ? (availableRoles as [string, ...string[]]) : ["STUDENT"], {
      errorMap: () => ({ message: "Please select a role" }),
    }),
    department: z.string().optional(),
  });
};

type SetupFormData = {
  role: string;
  department?: string;
};

const DEPARTMENTS = [
  "Computer Science",
  "Engineering",
  "Business",
  "Arts",
  "Science",
  "Medicine",
  "Law",
  "Other",
];

// Role descriptions for different auth methods
const ROLE_DESCRIPTIONS: Record<string, string> = {
  STUDENT: "Access room booking and check availability",
  FACULTY: "Manage rooms, view requests, and approve bookings",
  ADMIN: "Administrative access to system management",
};

const ROLE_ICONS: Record<string, any> = {
  STUDENT: Users,
  FACULTY: BookOpen,
  ADMIN: Shield,
};

const ROLE_COLORS: Record<string, { border: string; bg: string; icon: string }> = {
  STUDENT: { border: "border-blue-600", bg: "bg-blue-50", icon: "bg-blue-100 text-blue-600" },
  FACULTY: { border: "border-green-600", bg: "bg-green-50", icon: "bg-green-100 text-green-600" },
  ADMIN: { border: "border-purple-600", bg: "bg-purple-50", icon: "bg-purple-100 text-purple-600" },
};

export default function AuthSetupPage() {
  const navigate = useNavigate();
  const { completeSetup } = useAuth();
  const [step, setStep] = useState<SetupStep>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [authProvider, setAuthProvider] = useState<string | null>(null);

  // Extract authProvider from URL
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const provider = searchParams.get("authProvider") || "email";
    setAuthProvider(provider);
  }, []);

  const setupSchema = buildSetupSchema(authProvider);
  const availableRoles = getAvailableRoles(authProvider);

  const {
    handleSubmit,
    watch,
    formState: { errors },
    setValue,
  } = useForm<SetupFormData>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      role: undefined,
      department: undefined,
    },
  });

  const selectedRole = watch("role");

  useEffect(() => {
    if (authProvider === "google") {
      setValue("role", "STUDENT");
      setValue("department", undefined);
    }
  }, [authProvider, setValue]);

  // Extract setup token from URL
  const setupToken = new URLSearchParams(window.location.search).get("token");

  useEffect(() => {
    if (!setupToken) {
      setSubmitError("Missing setup token. Please contact support.");
    }
  }, [setupToken]);

  const onSubmit = async (data: SetupFormData) => {
    if (!setupToken) {
      setSubmitError("Setup token missing. Please try again.");
      return;
    }

    // Validation: Faculty requires department
    if (data.role === "FACULTY" && !data.department) {
      setSubmitError("Department is required for Faculty role");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      await completeSetup(setupToken, data.role as any, data.department);
      setShowSuccess(true);

      // Redirect to dashboard after 1.5 seconds
      setTimeout(() => {
        window.history.replaceState({}, "", "/");
      }, 1500);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Setup failed. Please try again."
      );
      setIsSubmitting(false);
    }
  };

  if (showSuccess) {
    return (
      <div className="flex items-center justify-center w-full h-screen bg-gradient-to-br from-green-50 to-slate-100">
        <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-lg text-center">
          <div className="flex justify-center mb-6">
            <div className="rounded-full bg-green-100 p-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            Setup Complete!
          </h1>

          <p className="text-slate-600 mb-8">
            Your account has been successfully configured. Redirecting you to your
            dashboard...
          </p>

          <div className="flex justify-center">
            <Loader2 className="w-6 h-6 text-green-600 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen w-full bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Welcome to Room Booking!
          </h1>
          <p className="text-lg text-slate-600">
            Let's set up your account to get started
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex gap-4 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center flex-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                  s <= step
                    ? "bg-blue-600 text-white"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                {s}
              </div>
              {s < 3 && (
                <div
                  className={`flex-1 h-1 mx-2 transition-all ${
                    s < step ? "bg-blue-600" : "bg-slate-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Labels */}
        <div className="mb-8 text-center">
          <p className="text-sm font-medium text-slate-600">
            Step {step} of 3:{" "}
            {step === 1
              ? authProvider === "google"
                ? "Continue as Student"
                : "Select Your Role"
              : step === 2
                ? "Choose Department"
                : "Review & Complete"}
          </p>
        </div>

        {/* Error Message */}
        {submitError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{submitError}</p>
          </div>
        )}

        {/* Form Container */}
        <Card className="p-8 bg-white shadow-lg">
          <form onSubmit={handleSubmit(onSubmit)}>
            {/* Step 1: Role Selection */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  {authProvider === "google" ? (
                    <div className="space-y-4">
                      <Label className="text-base font-semibold block">
                        Continue as Student
                      </Label>

                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                        <p className="text-sm text-slate-800">
                          Your Google account will be activated with STUDENT access.
                        </p>
                        <p className="mt-2 text-sm text-slate-700">
                          Need FACULTY, STAFF, or ADMIN access? Contact admin after signing in.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setValue("role", "STUDENT", { shouldValidate: true });
                          setValue("department", undefined);
                          setStep(3);
                        }}
                        className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Continue as Student
                      </button>
                    </div>
                  ) : (
                    <>
                      <Label className="text-base font-semibold mb-4 block">
                        What is your role?
                      </Label>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {availableRoles.map((role) => {
                          const Icon = ROLE_ICONS[role];
                          const colors = ROLE_COLORS[role];
                          const description = ROLE_DESCRIPTIONS[role];

                          return (
                            <button
                              key={role}
                              type="button"
                              onClick={() => {
                                setValue("role", role);
                                setValue("department", undefined);
                                if (role !== "FACULTY") {
                                  setStep(3);
                                } else {
                                  setStep(2);
                                }
                              }}
                              className={`p-6 rounded-lg border-2 transition-all text-left ${
                                selectedRole === role
                                  ? `border-current ${colors.bg}`
                                  : "border-slate-200 bg-white hover:border-slate-300"
                              }`}
                            >
                              <div className="flex items-start gap-4">
                                <div className={`rounded-lg ${colors.icon} p-3 flex-shrink-0`}>
                                  <Icon className="w-6 h-6" />
                                </div>
                                <div>
                                  <h3 className="font-semibold text-slate-900 mb-1">
                                    {role}
                                  </h3>
                                  <p className="text-sm text-slate-600">
                                    {description}
                                  </p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {errors.role && (
                        <p className="text-sm text-red-600 mt-2">{errors.role.message}</p>
                      )}
                    </>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => navigate("/login")}
                    className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Department Selection (only for Faculty) */}
            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <Label htmlFor="department" className="text-base font-semibold mb-2 block">
                    Select Your Department
                  </Label>

                  <Select
                    value={watch("department") || ""}
                    onValueChange={(value) => setValue("department", value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a department..." />
                    </SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map((dept) => (
                        <SelectItem key={dept} value={dept}>
                          {dept}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {errors.department && (
                    <p className="text-sm text-red-600 mt-2">{errors.department.message}</p>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (watch("department")) {
                        setStep(3);
                      }
                    }}
                    disabled={!watch("department")}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Review & Complete */}
            {step === 3 && (
              <div className="space-y-6">
                <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                  <h3 className="font-semibold text-slate-900 mb-4">Review Your Setup</h3>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Role:</span>
                      <span className="font-medium text-slate-900">
                        {selectedRole === "STUDENT" && "👤 Student"}
                        {selectedRole === "FACULTY" && "👨‍🏫 Faculty"}
                        {selectedRole === "ADMIN" && "🔐 Admin"}
                      </span>
                    </div>
                    {selectedRole === "FACULTY" && watch("department") && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">Department:</span>
                        <span className="font-medium text-slate-900">
                          {watch("department")}
                        </span>
                      </div>
                    )}
                    {authProvider && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600">Login Method:</span>
                        <span className="font-medium text-slate-900">
                          {authProvider === "google" ? "🔐 Google OAuth" : "📧 Email/Password"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-sm text-slate-600">
                  By completing this setup, you agree to our Terms of Service and Privacy Policy.
                </p>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setStep(selectedRole === "FACULTY" ? 2 : 1)}
                    className="px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Completing Setup...
                      </>
                    ) : (
                      "Complete Setup"
                    )}
                  </button>
                </div>
              </div>
            )}
          </form>
        </Card>
      </div>
    </div>
  );
}
