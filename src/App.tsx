import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import DailyProgress from "./pages/DailyProgress";
import WeeklyFeedback from "./pages/WeeklyFeedback";
import StudentProfile from "./pages/StudentProfile";
import Students from "./pages/Students";
import NotFound from "./pages/NotFound";
import Navbar from "./components/layout/Navbar";
import PageTransition from "./components/layout/PageTransition";
import Signup from "./pages/Signup";
import AddStudent from "@/pages/AddStudent";
import AdminLogin from '@/pages/admin/AdminLogin';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import StudentDetail from './pages/StudentDetail';
import DailyProgressPage from '@/pages/DailyProgress';
import ProgressForm from '@/pages/ProgressForm';
import VerifyEmail from './pages/VerifyEmail';


const queryClient = new QueryClient();

// Protected route component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return (
    <>
      <Navbar />
      <PageTransition>{children}</PageTransition>
    </>
  );
};

// Teacher-only route component
const TeacherRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, role } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  if (role !== 'teacher') {
    return <Navigate to="/dashboard" replace />;
  }
  
  return (
    <>
      <Navbar />
      <PageTransition>{children}</PageTransition>
    </>
  );
};

// App Routes setup
const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/dashboard" element={<AdminDashboard />} />
      <Route path="/daily-progress" element={<DailyProgressPage />} />
      <Route path="/progress-form" element={<ProgressForm />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/students"
        element={
          <ProtectedRoute>
            <Students />
          </ProtectedRoute>
        }
      />
      <Route
        path="/daily-progress"
        element={
          <TeacherRoute>
            <DailyProgress />
          </TeacherRoute>
        }
      />
      <Route
        path="/weekly-feedback"
        element={
          <TeacherRoute>
            <WeeklyFeedback />
          </TeacherRoute>
        }
      />
      <Route
        path="/student-profile"
        element={
          <ProtectedRoute>
            <StudentProfile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/:id"
        element={
          <ProtectedRoute>
            <StudentProfile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/add-student"
        element={
          <TeacherRoute>
            <AddStudent />
          </TeacherRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Router basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </Router>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
