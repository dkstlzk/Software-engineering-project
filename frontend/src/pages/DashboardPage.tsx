import { useEffect, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  getDashboardData,
  type DashboardStats,
  type UpcomingBooking,
  type ActivityItem,
} from "../lib/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import {
  Calendar,
  Clock,
  Users,
  AlertCircle,
  Plus,
  Search,
  Settings,
  Activity,
  TrendingUp,
  CheckCircle,
  XCircle,
  Info,
} from "lucide-react";
import { formatError } from "../utils/formatError";
import { formatDateDDMMYYYY, formatTimeHHMMIST } from "../utils/datetime";

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // States
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [upcomingBookings, setUpcomingBookings] = useState<UpcomingBooking[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canManageRooms = user?.role === "ADMIN" || user?.role === "STAFF";
  const role = user?.role;
  const isAdmin = role === "ADMIN";
  const isStaff = role === "STAFF";
  const isStudent = role === "STUDENT";
  const isFaculty = role === "FACULTY";

  // Load dashboard data
  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await getDashboardData();

        setStats(data.stats);
        setUpcomingBookings(data.upcomingBookings);
        setActivities(data.activities);
      } catch (err) {
        console.error("Error loading dashboard:", err);
        setError(formatError(err, "Failed to load dashboard data"));
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  const handleQuickAction = (action: string) => {
    switch (action) {
      case "new-booking":
        navigate("/requests");
        break;
      case "check-availability":
        navigate("/availability");
        break;
      case "manage-rooms":
        navigate("/rooms");
        break;
      default:
        break;
    }
  };

  const formatTime = (dateString: string) => {
    return formatTimeHHMMIST(dateString);
  };

  const formatDate = (dateString: string) => {
    return formatDateDDMMYYYY(dateString);
  };

  const formatActivityTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return formatDateDDMMYYYY(date);
  };

  const getActivityIcon = (status: string) => {
    switch (status) {
      case "APPROVED":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "REJECTED":
      case "CANCELLED":
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getActivityLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      PENDING_FACULTY: "Pending Review",
      PENDING_STAFF: "Awaiting Staff",
      APPROVED: "Approved",
      REJECTED: "Rejected",
      CANCELLED: "Cancelled",
    };
    return statusMap[status] || status;
  };

  const welcomeText = isAdmin
    ? `Welcome back, ${user?.name}! Here's an overview of all bookings across campus.`
    : isStaff
      ? `Welcome back, ${user?.name}! Here's an overview for your assigned buildings.`
      : `Welcome back, ${user?.name}! Here's an overview of your bookings.`;

  const upcomingTitle = isAdmin
    ? "Upcoming Bookings"
    : isStaff
      ? "Upcoming Bookings in Your Assigned Buildings"
      : "Your Upcoming Bookings";

  const upcomingDescription = isAdmin
    ? "Next 5 confirmed bookings"
    : isStaff
      ? "Next 5 bookings in your assigned buildings"
      : "Your next 5 incoming bookings";

  const noUpcomingText = isAdmin
    ? "No upcoming bookings scheduled"
    : isStaff
      ? "No upcoming bookings in your assigned buildings"
      : "You have no upcoming bookings scheduled";

  const activityTitle = isAdmin
    ? "Recent Activity"
    : isStaff
      ? "Recent Actions in Your Assigned Buildings"
      : "Your Recent Actions";

  const activityDescription = isAdmin
    ? "Last 10 actions"
    : isStaff
      ? "Last 10 actions in your assigned buildings"
      : "Your last 10 recent actions";

  const noActivityText = isAdmin
    ? "No recent activities"
    : isStaff
      ? "No recent actions in your assigned buildings"
      : "You have no recent actions";

  const statsCards: Array<{
    key: string;
    title: string;
    value: number;
    description: string;
    icon: ReactElement;
  }> = (() => {
    if (isAdmin) {
      return [
        {
          key: "admin-total-bookings",
          title: "Total Bookings",
          value: stats?.totalBookingsThisMonth || 0,
          description: "This month",
          icon: <Calendar className="w-8 h-8 text-blue-500 opacity-20" />,
        },
        {
          key: "admin-pending",
          title: "Pending Requests",
          value: stats?.pendingRequests || 0,
          description: "Needs action",
          icon: <AlertCircle className="w-8 h-8 text-yellow-500 opacity-20" />,
        },
        {
          key: "admin-utilization",
          title: "Room Utilization",
          value: stats?.roomUtilization || 0,
          description: "Today (%)",
          icon: <TrendingUp className="w-8 h-8 text-green-500 opacity-20" />,
        },
        {
          key: "admin-active-users",
          title: "Active Users",
          value: stats?.activeUsers || 0,
          description: "Last 30 days",
          icon: <Users className="w-8 h-8 text-purple-500 opacity-20" />,
        },
      ];
    }

    if (isStaff) {
      return [
        {
          key: "staff-total-bookings",
          title: "Bookings in Your Assigned Buildings",
          value: stats?.totalBookingsThisMonth || 0,
          description: "Accepted this month",
          icon: <Calendar className="w-8 h-8 text-blue-500 opacity-20" />,
        },
        {
          key: "staff-pending",
          title: "Pending in Your Assigned Buildings",
          value: stats?.pendingRequests || 0,
          description: "Requests awaiting staff approval",
          icon: <AlertCircle className="w-8 h-8 text-yellow-500 opacity-20" />,
        },
      ];
    }

    if (isStudent) {
      return [
        {
          key: "student-total-bookings",
          title: "Your Accepted Bookings",
          value: stats?.totalBookingsThisMonth || 0,
          description: "Accepted this month",
          icon: <Calendar className="w-8 h-8 text-blue-500 opacity-20" />,
        },
        {
          key: "student-pending-faculty",
          title: "Your Pending Faculty Approvals",
          value: stats?.pendingRequestsByFaculty || 0,
          description: "Your requests waiting for faculty",
          icon: <AlertCircle className="w-8 h-8 text-orange-500 opacity-20" />,
        },
        {
          key: "student-pending-staff",
          title: "Your Pending Staff Approvals",
          value: stats?.pendingRequestsByStaff || 0,
          description: "Your requests waiting for staff",
          icon: <AlertCircle className="w-8 h-8 text-yellow-500 opacity-20" />,
        },
      ];
    }

    if (isFaculty) {
      return [
        {
          key: "faculty-total-bookings",
          title: "Your Accepted Bookings",
          value: stats?.totalBookingsThisMonth || 0,
          description: "Accepted this month",
          icon: <Calendar className="w-8 h-8 text-blue-500 opacity-20" />,
        },
        {
          key: "faculty-pending-own",
          title: "Your Pending Requests",
          value: stats?.pendingRequests || 0,
          description: "Requests made by you awaiting approval",
          icon: <AlertCircle className="w-8 h-8 text-yellow-500 opacity-20" />,
        },
        {
          key: "faculty-pending-clear",
          title: "Requests Waiting for Your Approval",
          value: stats?.pendingRequestsToClear || 0,
          description: "Pending requests you need to clear",
          icon: <Activity className="w-8 h-8 text-indigo-500 opacity-20" />,
        },
      ];
    }

    return [
      {
        key: "fallback-total-bookings",
        title: "Your Accepted Bookings",
        value: stats?.totalBookingsThisMonth || 0,
        description: "Accepted this month",
        icon: <Calendar className="w-8 h-8 text-blue-500 opacity-20" />,
      },
      {
        key: "fallback-pending",
        title: "Your Pending Requests",
        value: stats?.pendingRequests || 0,
        description: "Awaiting review",
        icon: <AlertCircle className="w-8 h-8 text-yellow-500 opacity-20" />,
      },
    ];
  })();

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6">
                <div className="h-8 bg-muted rounded w-1/2"></div>
                <div className="h-4 bg-muted rounded w-1/3 mt-4"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-500 mt-1">{welcomeText}</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Stats Cards */}
      <div
        className={`grid gap-6 ${
          isAdmin
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
            : isStaff
              ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        }`}
      >
        {statsCards.map((card) => (
          <Card key={card.key} className="hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {card.title}
                  </p>
                  <p className="text-2xl font-bold mt-2">{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {card.description}
                  </p>
                </div>
                {card.icon}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightning className="w-5 h-5" />
            Quick Actions
          </CardTitle>
          <CardDescription>Get started with common tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => handleQuickAction("new-booking")}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              New Booking Request
            </Button>
            <Button
              onClick={() => handleQuickAction("check-availability")}
              variant="outline"
              className="gap-2"
            >
              <Search className="w-4 h-4" />
              Check Availability
            </Button>
            {canManageRooms && (
              <Button
                onClick={() => handleQuickAction("manage-rooms")}
                variant="outline"
                className="gap-2"
              >
                <Settings className="w-4 h-4" />
                Manage Rooms
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming Bookings */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              {upcomingTitle}
            </CardTitle>
            <CardDescription>{upcomingDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingBookings.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="w-12 h-12 text-muted-foreground mx-auto opacity-30 mb-3" />
                <p className="text-muted-foreground">{noUpcomingText}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingBookings.map((booking, index) => (
                  <div
                    key={booking.id}
                    className="flex gap-4 pb-4 border-b last:border-b-0 last:pb-0"
                  >
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center gap-2 flex-shrink-0">
                      <div className="w-3 h-3 rounded-full bg-blue-500 ring-4 ring-blue-100"></div>
                      {index < upcomingBookings.length - 1 && (
                        <div className="w-0.5 h-12 bg-gray-200"></div>
                      )}
                    </div>

                    {/* Booking details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-semibold text-sm truncate">
                            {booking.roomName || "Unknown Room"}
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDate(booking.startAt)}
                          </p>
                        </div>
                        <span className="text-xs font-medium text-blue-600 flex-shrink-0 whitespace-nowrap">
                          {formatTime(booking.startAt)} - {formatTime(booking.endAt)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-2 capitalize">
                        {booking.source.replace(/_/g, " ")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              {activityTitle}
            </CardTitle>
            <CardDescription>{activityDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <div className="text-center py-8">
                <Activity className="w-12 h-12 text-muted-foreground mx-auto opacity-30 mb-3" />
                <p className="text-muted-foreground text-sm">{noActivityText}</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {activities.map((activity) => (
                  <div
                    key={`${activity.type}-${activity.id}`}
                    className="flex gap-3 pb-3 border-b last:border-b-0 last:pb-0"
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {getActivityIcon(activity.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700">
                        Request{" "}
                        <span className="text-muted-foreground">
                          {getActivityLabel(activity.status)}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {activity.roomName || "Unknown Room"}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatActivityTime(activity.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Lightning icon (not in lucide-react by default, so we create it)
function Lightning({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

