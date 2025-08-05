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

// App Routes setup
const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
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
          <ProtectedRoute>
            <DailyProgress />
          </ProtectedRoute>
        }
      />
      <Route
        path="/weekly-feedback"
        element={
          <ProtectedRoute>
            <WeeklyFeedback />
          </ProtectedRoute>
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
      <Route path="/add-student" element={<AddStudent />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Router>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </Router>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
