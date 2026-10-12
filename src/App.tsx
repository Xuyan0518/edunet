import StudentSubjects from "@/pages/StudentSubjects";
import Accounts from "@/pages/admin/Accounts";
import ReviewQueue from "@/pages/admin/ReviewQueue";
import Reports from "@/pages/Reports";
import ReportDetail from "@/features/reports/ReportDetail";
import StudentBin from "@/pages/StudentBin";
import Planning from "@/pages/Planning";
import PlanSummaries from "@/pages/admin/PlanSummaries";
import Assessments from "@/pages/Assessments";
import Curriculum from "@/pages/Curriculum";
import Parents, { StudentParents } from "@/pages/Parents";
import EnglishSettings from "@/pages/EnglishSettings";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useParams
} from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { I18nProvider } from "@/context/I18nContext";
import { queryDefaults } from "@/app/queryKeys";
import { RouteGuard } from "@/app/RouteGuard";
import AppShell from "@/components/layout/AppShell";
import Login from "@/pages/Login";
import WebAuthCallback from '@/pages/WebAuthCallback';
import AccountAccess from "@/pages/AccountAccess";
import Dashboard from "@/pages/Dashboard";
import Students from "@/pages/Students";
import StudentProfile from "@/pages/StudentProfile";
import DailyProgress from "@/pages/DailyProgress";
import WeeklyFeedback from "@/pages/WeeklyFeedback";
import AddStudent from "@/pages/AddStudent";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import Profile from "@/pages/Profile";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";
const queryClient = new QueryClient({ defaultOptions: queryDefaults });
function LegacyStudent() {
  const { id } = useParams();
  const { search } = useLocation();
  return (
    <Navigate replace to={`/students/${encodeURIComponent(id!)}${search}`} />
  );
}
function LegacyAdd() {
  const { search } = useLocation();
  const id = new URLSearchParams(search).get("edit");
  return (
    <Navigate
      replace
      to={id ? `/students/${encodeURIComponent(id)}/edit` : "/students/new"}
    />
  );
}
function LegacyDaily() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  if (params.has("studentId") && !params.has("student"))
    params.set("student", params.get("studentId")!);
  return <Navigate replace to={`/daily-progress?${params}`} />;
}
function AssessmentEntry({ papers = false }: { papers?: boolean }) {
  const { id } = useParams();
  return <Assessments key={`${id}:${papers}`} papers={papers} />;
}
function ParentEntry() {
  const { id } = useParams();
  return <StudentParents key={id} />;
}
function StudentEntry() {
  const { id } = useParams();
  return <StudentProfile key={id} />;
}
function DatedEntry({ weekly = false }: { weekly?: boolean }) {
  const { studentId, date, weekStarting } = useParams();
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set("student", studentId!);
  params.set(weekly ? "weekStarting" : "date", weekly ? weekStarting! : date!);
  return (
    <Navigate
      replace
      to={`${weekly ? "/weekly-feedback" : "/daily-progress"}?${params}`}
    />
  );
}
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<Login key="password" />} />
      <Route path="/admin/login" element={<Login key="admin" mode="admin" />} />
      <Route
        path="/login/reviewer"
        element={<Login key="reviewer" mode="reviewer" />}
      />
      <Route path="/signup" element={<Login key="signup" mode="signup" />} />
      <Route path="/web-auth" element={<WebAuthCallback />} />
      <Route path="/forgot-password" element={<AccountAccess key="forgot" mode="forgot" />} />
      <Route path="/reset-password" element={<AccountAccess key="reset" mode="reset" />} />
      <Route path="/verify-email" element={<AccountAccess key="verify" mode="verify" />} />
      <Route path="/resend-verification" element={<AccountAccess key="verify-request" mode="verify-request" />} />
      <Route element={<RouteGuard />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/students" element={<Students />} />
          <Route path="/students/:id" element={<StudentEntry />} />
          <Route path="/students/:id/subjects" element={<StudentSubjects />} />
          <Route
            path="/students/:id/daily-progress"
            element={<DailyProgress />}
          />
          <Route
            path="/students/:id/weekly-feedback"
            element={<WeeklyFeedback />}
          />
          <Route path="/students/:id/exams" element={<AssessmentEntry />} />
          <Route
            path="/students/:id/papers"
            element={<AssessmentEntry papers />}
          />
          <Route path="/student/:id" element={<LegacyStudent />} />
          <Route path="/students/:id/reports" element={<Reports />} />
          <Route path="/reports/:reportId" element={<ReportDetail />} />
          <Route path="/daily-progress" element={<DailyProgress />} />
          <Route path="/weekly-feedback" element={<WeeklyFeedback />} />
          <Route path="/progress-form" element={<LegacyDaily />} />
          <Route
            path="/students/:studentId/daily/:date"
            element={<DatedEntry />}
          />
          <Route
            path="/students/:studentId/weekly/:weekStarting"
            element={<DatedEntry weekly />}
          />
          <Route element={<RouteGuard capability="createStudent" />}>
            <Route path="/students/new" element={<AddStudent />} />
          </Route>
          <Route element={<RouteGuard capability="catalog" />}>
            <Route path="/subjects" element={<Curriculum />} />
            <Route path="/planning/grades" element={<Planning />} />
          </Route>
          <Route path="/add-student" element={<LegacyAdd />} />
          <Route element={<RouteGuard capability="manageStudents" />}>
            <Route path="/students/:id/edit" element={<AddStudent />} />
            <Route path="/parents" element={<Parents />} />
            <Route path="/students/manage" element={<Students management />} />
            <Route path="/students/:id/parents" element={<ParentEntry />} />
          </Route>
          <Route element={<RouteGuard capability="admin" />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<Accounts />} />
            <Route path="/admin/review" element={<ReviewQueue />} />
            <Route path="/admin/plans" element={<PlanSummaries />} />
            <Route
              path="/admin/settings"
              element={<EnglishSettings globalScope />}
            />
          </Route>
          <Route element={<RouteGuard capability="author" />}>
            <Route path="/students/:id/bin" element={<StudentBin />} />
            <Route
              path="/students/:id/weekly-plan"
              element={<Planning studentScope />}
            />
            <Route
              path="/students/:id/english-tasks"
              element={<EnglishSettings />}
            />
          </Route>
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter
          basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}
        >
          <I18nProvider>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </I18nProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
