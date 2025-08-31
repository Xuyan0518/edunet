import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useParams, useNavigate } from 'react-router-dom';
import { Student, DailyProgress, api } from '@/services/api';
import { ArrowLeft, User, GraduationCap, Calendar, Clock, CheckCircle, XCircle, Minus, Filter } from 'lucide-react';
import { DateRangeFilter, DateRange, filterByDateRange } from '@/components/ui/date-range-filter';

const StudentProfile: React.FC = () => {
  const { user, role } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [childrenStudentsList, setChildrenStudentsList] = useState<Student[]>([]);
  const [dailyProgress, setDailyProgress] = useState<DailyProgress[]>([]);
  const [progressLoading, setProgressLoading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: undefined,
    to: undefined,
  });

  useEffect(() => {
    if (id) {
      // Fetch specific student data
      const fetchStudent = async () => {
        try {
          const studentData = await api.getStudent(id);
          setStudent(studentData);
        } catch (error) {
          console.error('Failed to fetch student:', error);
        } finally {
          setLoading(false);
        }
      };
      fetchStudent();
    } else {
      setLoading(false);
    }
  }, [id]);

  // Fetch daily progress when student is loaded
  useEffect(() => {
    if (student && id) {
      const fetchProgress = async () => {
        setProgressLoading(true);
        try {
          const progressData = await api.getStudentProgress(id);
          if (progressData) {
            setDailyProgress(progressData);
          }
        } catch (error) {
          console.error('Failed to fetch daily progress:', error);
        } finally {
          setProgressLoading(false);
        }
      };
      fetchProgress();
    }
  }, [student, id]);

  // Filter progress based on date range
  const filteredProgress = filterByDateRange(dailyProgress, dateRange);

  // Debug logging for date range changes
  useEffect(() => {
    console.log('Date range changed:', dateRange);
    console.log('Filtered progress count:', filteredProgress.length);
  }, [dateRange, filteredProgress]);

  // Helper function to get attendance icon
  const getAttendanceIcon = (attendance: string) => {
    switch (attendance.toLowerCase()) {
      case 'present':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'absent':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'late':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      default:
        return <Minus className="h-4 w-4 text-gray-600" />;
    }
  };

  // Helper function to get attendance badge variant
  const getAttendanceBadgeVariant = (attendance: string) => {
    switch (attendance.toLowerCase()) {
      case 'present':
        return 'default';
      case 'absent':
        return 'destructive';
      case 'late':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  // If viewing a specific student
  if (id && student) {
    return (
      <div className="container mx-auto py-8 px-4 animate-fade-in">
        <div className="mb-6">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/students')}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Students
          </Button>
          
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
              <User className="h-8 w-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{student.name}</h1>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="text-lg px-3 py-1">
                  <GraduationCap className="h-4 w-4 mr-2" />
                  Grade {student.grade}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Student Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="font-medium">Name:</span>
              <span>{student.name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-medium">Grade:</span>
              <span>{student.grade}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-medium">Enrolled:</span>
              <span>{new Date(student.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm text-muted-foreground">Total Progress Entries:</span>
              <Badge variant="outline">{dailyProgress.length}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Date Range Filter */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filter Progress by Date Range
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Date Range</label>
                <DateRangeFilter
                  dateRange={dateRange}
                  onDateRangeChange={setDateRange}
                  placeholder="Select date range to filter progress"
                />
              </div>
              
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const today = new Date();
                    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                    setDateRange({ from: startOfMonth, to: endOfMonth });
                  }}
                >
                  This Month
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const today = new Date();
                    const startOfMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                    const endOfMonth = new Date(today.getFullYear(), today.getMonth(), 0);
                    setDateRange({ from: startOfMonth, to: endOfMonth });
                  }}
                >
                  Last Month
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDateRange({ from: undefined, to: undefined });
                  }}
                >
                  Show All
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Daily Progress List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Daily Progress History
              {dateRange.from && dateRange.to && (
                <Badge variant="outline" className="ml-2">
                  {filteredProgress.length} of {dailyProgress.length} entries
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {progressLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-muted-foreground">Loading progress data...</p>
              </div>
            ) : filteredProgress.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>
                  {dateRange.from && dateRange.to 
                    ? `No progress records found for the selected date range`
                    : 'No daily progress records found'
                  }
                </p>
                <p className="text-sm">
                  {dateRange.from && dateRange.to 
                    ? 'Try adjusting the date range or check if progress exists for other dates'
                    : 'Progress entries will appear here once they are recorded'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredProgress.map((progress) => (
                  <Card key={progress.id} className="border-l-4 border-l-blue-500">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            {getAttendanceIcon(progress.attendance)}
                            <Badge variant={getAttendanceBadgeVariant(progress.attendance)}>
                              {progress.attendance}
                            </Badge>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {new Date(progress.date).toLocaleDateString('en-US', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </span>
                        </div>

                      </div>
                    </CardHeader>
                    <CardContent>
                      {progress.activities && progress.activities.length > 0 ? (
                        <div className="space-y-3">
                          <h5 className="font-medium text-sm">Activities:</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {progress.activities.map((activity, index) => (
                              <div key={index} className="pl-4 border-l-2 border-gray-200">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-sm">{activity.subject}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {activity.performance}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground mb-1">
                                  {activity.description}
                                </p>
                                {activity.notes && (
                                  <p className="text-xs text-muted-foreground">
                                    Notes: {activity.notes}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-sm">No activities recorded</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // If no specific student ID, show the overview (existing logic)
  if (role === 'teacher') {
    // Teacher sees all students
    return (
      <div className="container mx-auto py-8 px-4 animate-fade-in">
        <h1 className="text-3xl font-bold tracking-tight mb-6">All Students</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* This will be populated by the Students page */}
          <p className="text-muted-foreground">Use the Students page to view individual student profiles.</p>
        </div>
      </div>
    );
  } else {
    // Parent sees only their children
    return (
      <div className="container mx-auto py-8 px-4 animate-fade-in">
        <h1 className="text-3xl font-bold tracking-tight mb-4">My Child(ren)</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(childrenStudentsList || []).map(student => (
            <Card
              key={student.id}
              className="hover-card cursor-pointer"
              onClick={() => navigate(`/student/${student.id}`, { state: { student } })}
            >
              <CardHeader>
                <CardTitle>{student.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p>Grade: {student.grade}</p>
                <Badge>{student.grade}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }
};

export default StudentProfile;
