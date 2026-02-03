import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Plus, Clock, Calendar, CheckCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Student, DailyProgress, WeeklyFeedback, api } from '@/services/api';
import { buildApiUrl } from '@/config/api';
import { getAuthHeaders } from '@/utils/auth';

type FilterType = 'all' | 'pending-daily' | 'pending-weekly';

const Students: React.FC = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();

  // State for students and filtering
  const [students, setStudents] = useState<Student[]>([]);
  const [dailyProgress, setDailyProgress] = useState<DailyProgress[]>([]);
  const [weeklyFeedback, setWeeklyFeedback] = useState<WeeklyFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setError(null);
        
        // Always fetch students first
        const studentsRes = await fetch(buildApiUrl('students'), {
          headers: getAuthHeaders(),
        });
        if (!studentsRes.ok) throw new Error(`Failed to fetch students: ${studentsRes.status}`);
        const studentsData = await studentsRes.json();
        setStudents(studentsData);
        
        // Try to fetch progress and feedback, but don't fail if they error
        try {
          const progressRes = await fetch(buildApiUrl('progress'), {
            headers: getAuthHeaders(),
          });
          if (progressRes.ok) {
            const progressData = await progressRes.json();
            setDailyProgress(progressData);
          }
        } catch (progressError) {
          console.warn('Failed to fetch daily progress:', progressError);
          setDailyProgress([]);
        }
        
        try {
          const feedbackRes = await fetch(buildApiUrl('feedback'), {
            headers: getAuthHeaders(),
          });
          if (feedbackRes.ok) {
            const feedbackData = await feedbackRes.json();
            setWeeklyFeedback(feedbackData);
          }
        } catch (feedbackError) {
          console.warn('Failed to fetch weekly feedback:', feedbackError);
          setWeeklyFeedback([]);
        }
        
      } catch (error) {
        console.error('Failed to fetch students:', error);
        setError(error instanceof Error ? error.message : 'Failed to fetch students');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Helper functions to determine pending status
  const getTodayProgressStatus = (studentId: string) => {
    // If no progress data available, assume pending
    if (dailyProgress.length === 0) return 'pending';
    
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // Check if today is Sunday-Thursday (0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday)
    const dayOfWeek = today.getDay();
    const isStudyDay = dayOfWeek >= 0 && dayOfWeek <= 4; // Sunday to Thursday
    
    if (!isStudyDay) return 'no-class'; // No class on Friday/Saturday
    
    const hasProgress = dailyProgress.some(p => 
      p.studentId === studentId && 
      p.date === todayStr
    );
    
    return hasProgress ? 'completed' : 'pending';
  };

  const getWeeklyFeedbackStatus = (studentId: string) => {
    // If no feedback data available, assume pending
    if (weeklyFeedback.length === 0) return 'pending';
    
    const today = new Date();
    const dayOfWeek = today.getDay();
    
    // Check if it's Friday (5) or Saturday (6) - time to write weekly feedback
    const isFeedbackTime = dayOfWeek === 5 || dayOfWeek === 6;
    
    if (!isFeedbackTime) return 'not-time';
    
    // Get the most recent Sunday (start of week)
    const daysSinceSunday = dayOfWeek;
    const lastSunday = new Date(today);
    lastSunday.setDate(today.getDate() - daysSinceSunday);
    const lastSundayStr = lastSunday.toISOString().split('T')[0];
    
    // Check if weekly feedback exists for this week
    const hasFeedback = weeklyFeedback.some(f => 
      f.studentId === studentId && 
      new Date(f.weekEnding) >= lastSunday
    );
    
    return hasFeedback ? 'completed' : 'pending';
  };

  // Filter students based on selected filter
  const getFilteredStudents = () => {
    if (filter === 'all') return students;
    
    if (filter === 'pending-daily') {
      return students.filter(student => getTodayProgressStatus(student.id) === 'pending');
    }
    
    if (filter === 'pending-weekly') {
      return students.filter(student => getWeeklyFeedbackStatus(student.id) === 'pending');
    }
    
    return students;
  };

  const visibleStudents = role === 'teacher'
    ? getFilteredStudents()
    : students.filter((s) => (s.parentId || s.parent_id) === user?.id);

  const getStatusBadge = (student: Student) => {
    const dailyStatus = getTodayProgressStatus(student.id);
    const weeklyStatus = getWeeklyFeedbackStatus(student.id);
    
    if (filter === 'pending-daily') {
      if (dailyStatus === 'no-class') {
        return <Badge variant="secondary">No Class Today</Badge>;
      }
      return <Badge variant="destructive">Pending Daily Progress</Badge>;
    }
    
    if (filter === 'pending-weekly') {
      if (weeklyStatus === 'not-time') {
        return <Badge variant="secondary">Not Feedback Time</Badge>;
      }
      return <Badge variant="destructive">Pending Weekly Feedback</Badge>;
    }
    
    // For 'all' filter, show current status
    if (dailyStatus === 'pending') {
      return <Badge variant="destructive">Pending Daily Progress</Badge>;
    } else if (dailyStatus === 'completed') {
      return <Badge variant="default">Daily Progress ✓</Badge>;
    } else if (dailyStatus === 'no-class') {
      return <Badge variant="secondary">No Class Today</Badge>;
    }
    
    return null;
  };

  return (
    <div className="container mx-auto py-8 px-4 animate-fade-in">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Students</h1>
          <p className="text-muted-foreground mt-1">
            {role === 'teacher' ? 'Manage and view all student profiles' : 'Your child\'s profile'}
          </p>
        </div>

        {role === 'teacher' && (
          <Button onClick={() => navigate('/add-student')}>
            <Plus className="h-4 w-4 mr-2" />
            Add Student
          </Button>
        )}
      </div>

      {role === 'teacher' && (
        <div className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-blue-600 font-medium">Total Students</p>
                    <p className="text-2xl font-bold text-blue-800">{students.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-orange-50 border-orange-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm text-orange-600 font-medium">Pending Daily Progress</p>
                    <p className="text-2xl font-bold text-orange-800">
                      {students.filter(s => getTodayProgressStatus(s.id) === 'pending').length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-purple-50 border-purple-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <Calendar className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-purple-600 font-medium">Pending Weekly Feedback</p>
                    <p className="text-2xl font-bold text-purple-800">
                      {students.filter(s => getWeeklyFeedbackStatus(s.id) === 'pending').length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="flex items-center gap-4">
            <Select value={filter} onValueChange={(value: FilterType) => setFilter(value)}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Filter students..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    All Students ({students.length})
                  </div>
                </SelectItem>
                <SelectItem value="pending-daily">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Pending Daily Progress
                  </div>
                </SelectItem>
                <SelectItem value="pending-weekly">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Pending Weekly Feedback
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            
            {filter !== 'all' && (
              <div className="text-sm text-muted-foreground">
                Showing {getFilteredStudents().length} of {students.length} students
              </div>
            )}
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-blue-200 flex items-center justify-center mt-0.5">
                <span className="text-xs text-blue-600 font-bold">i</span>
              </div>
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Study Schedule:</p>
                <p>• <strong>Regular Schedule:</strong> Sunday to Thursday, 6:00 PM - 9:00 PM</p>
                <p>• <strong>Daily Progress:</strong> Due by 9:00 PM after each study session</p>
                <p>• <strong>Weekly Feedback:</strong> Due Friday night or Saturday morning</p>
                <p>• <strong>Occasional Schedule:</strong> Monday to Friday (when Sunday is not available)</p>
                {(dailyProgress.length === 0 || weeklyFeedback.length === 0) && (
                  <div className="mt-2 p-2 bg-yellow-100 border border-yellow-300 rounded">
                    <p className="text-yellow-800 text-xs">
                      ⚠️ Progress tracking tables are not yet set up in the database. 
                      Students will show as "pending" by default until the database is configured.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading students...</p>
          </div>
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </div>
      ) : visibleStudents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleStudents.map((student) => (
            <Card key={student.id} className="hover:shadow-lg transition-all duration-200 border-l-4 border-l-blue-500">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center">
                    <Users className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg text-gray-900">{student.name}</CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        Grade {student.grade}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {role === 'teacher' && getStatusBadge(student)}
                
                {role === 'teacher' && (
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => navigate(`/daily-progress?student=${student.id}`)}
                    >
                      <Clock className="h-3 w-3 mr-1" />
                      Daily
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => navigate(`/weekly-feedback?student=${student.id}`)}
                    >
                      <Calendar className="h-3 w-3 mr-1" />
                      Weekly
                    </Button>
                  </div>
                )}
                
                <div className="pt-2">
                  <Button asChild className="w-full bg-blue-600 hover:bg-blue-700">
                    <Link to={`/student/${student.id}`}>
                      View Profile
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          {filter === 'all' ? (
            <p className="text-muted-foreground">No students to show.</p>
          ) : filter === 'pending-daily' ? (
            <div>
              <p className="text-muted-foreground mb-2">No students pending daily progress!</p>
              <p className="text-sm text-green-600">All students have their daily progress recorded for today.</p>
            </div>
          ) : (
            <div>
              <p className="text-muted-foreground mb-2">No students pending weekly feedback!</p>
              <p className="text-sm text-green-600">All students have their weekly feedback recorded for this week.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Students;
