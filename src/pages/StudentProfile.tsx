import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { useParams, useNavigate } from 'react-router-dom';
import { Student, DailyProgress, WeeklyFeedback, api } from '@/services/api';
import { ArrowLeft, User, Users, GraduationCap, Calendar, Clock, CheckCircle, XCircle, Minus, Filter, Edit } from 'lucide-react';
import { DateRangeFilter, DateRange, filterByDateRange } from '@/components/ui/date-range-filter';
import SubjectTopicsPanel from '@/components/ui/SubjectTopicsPanel';
import { buildApiUrl } from '@/config/api';
import { getAuthHeaders } from '@/utils/auth';
import { isWithinInterval, parseISO } from 'date-fns';

const StudentProfile: React.FC = () => {
  const { user, role } = useAuth();
  const { t, language } = useI18n();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [childrenStudentsList, setChildrenStudentsList] = useState<Student[]>([]);
  const [dailyProgress, setDailyProgress] = useState<DailyProgress[]>([]);
  const [weeklyFeedback, setWeeklyFeedback] = useState<WeeklyFeedback[]>([]);
  const [progressLoading, setProgressLoading] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  const defaultWeekRange = useMemo<DateRange>(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { from: start, to: end };
  }, []);

  const [dateRange, setDateRange] = useState<DateRange>(defaultWeekRange);
  const [feedbackDateRange, setFeedbackDateRange] = useState<DateRange>(defaultWeekRange);

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
      // If no student ID, fetch all children for parent or all students for teacher
      const fetchChildren = async () => {
        try {
          const studentsData = await api.getStudents();
          if (studentsData) {
            if (role === 'parent') {
              // Filter to only show parent's children
              const children = studentsData.filter(
                (s) => (s.parentId || s.parent_id) === user?.id
              );
              setChildrenStudentsList(children);
            } else {
              // For teachers, show all students
              setChildrenStudentsList(studentsData);
            }
          }
        } catch (error) {
          console.error('Failed to fetch children:', error);
        } finally {
          setLoading(false);
        }
      };
      fetchChildren();
    }
  }, [id, role, user?.id]);

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

  // Fetch weekly feedback when student is loaded
  useEffect(() => {
    if (student && id) {
      const fetchFeedback = async () => {
        setFeedbackLoading(true);
        try {
          const res = await fetch(buildApiUrl(`feedback/list?studentId=${encodeURIComponent(id)}`), {
            headers: getAuthHeaders(),
          });
          if (!res.ok) throw new Error('Failed to fetch weekly feedback');
          const data: WeeklyFeedback[] = await res.json();
          setWeeklyFeedback(data);
        } catch (error) {
          console.error('Failed to fetch weekly feedback:', error);
        } finally {
          setFeedbackLoading(false);
        }
      };
      fetchFeedback();
    }
  }, [student, id]);

  // Filter progress based on date range
  const filteredProgress = filterByDateRange(dailyProgress, dateRange);
  const filteredFeedback = useMemo(() => {
    if (!feedbackDateRange.from || !feedbackDateRange.to) return weeklyFeedback;
    return weeklyFeedback.filter((entry) => {
      const start = parseISO(entry.weekStarting);
      return isWithinInterval(start, { start: feedbackDateRange.from!, end: feedbackDateRange.to! });
    });
  }, [weeklyFeedback, feedbackDateRange]);

  // Debug logging for date range changes
  useEffect(() => {
    console.log('Date range changed:', dateRange);
    console.log('Filtered progress count:', filteredProgress.length);
  }, [dateRange, filteredProgress]);

  const handleDailyProgressClick = (progress: DailyProgress) => {
    if (!student) return;
    const qs = new URLSearchParams({
      student: student.id,
      date: progress.date,
      tab: 'form',
    });
    navigate(`/daily-progress?${qs.toString()}`);
  };

  const handleWeeklyFeedbackClick = (entry: WeeklyFeedback) => {
    if (!student) return;
    const qs = new URLSearchParams({
      student: student.id,
      weekStarting: entry.weekStarting,
      tab: 'form',
    });
    navigate(`/weekly-feedback?${qs.toString()}`);
  };

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

  const getAttendanceLabel = (attendance: string) => {
    switch (attendance.toLowerCase()) {
      case 'present':
        return t('attendance.present');
      case 'absent':
        return t('attendance.absent');
      case 'late':
        return t('attendance.late');
      default:
        return attendance;
    }
  };

  const getPerformanceLabel = (performance: string) => {
    switch (performance.toLowerCase()) {
      case 'excellent':
        return t('dailyProgressForm.activity.performance.excellent');
      case 'good':
        return t('dailyProgressForm.activity.performance.good');
      case 'needs improvement':
        return t('dailyProgressForm.activity.performance.needsImprovement');
      default:
        return performance;
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
            {t('student.backToStudents')}
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
                  {t('student.grade')} {student.grade}
                </Badge>
              </div>
            </div>
            {role === 'teacher' && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => navigate(`/add-student?edit=${student.id}`)}
              >
                <Edit className="h-4 w-4 mr-2" />
                {t('student.edit')}
              </Button>
            )}
          </div>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>{t('student.info.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="font-medium">{t('student.info.name')}</span>
              <span>{student.name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-medium">{t('student.info.grade')}</span>
              <span>{student.grade}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-medium">{t('student.info.enrolled')}</span>
              <span>{new Date(student.createdAt).toLocaleDateString(language === 'zh-CN' ? 'zh-CN' : 'en-US')}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm text-muted-foreground">{t('student.info.totalProgress')}</span>
              <Badge variant="outline">{dailyProgress.length}</Badge>
            </div>
          </CardContent>
        </Card>

        <div className="mb-6">
          <SubjectTopicsPanel studentId={student.id} readOnly={role === 'parent'} />
        </div>

        {/* Date Range Filter */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              {t('filter.progress.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">{t('filter.dateRange.label')}</label>
                <DateRangeFilter
                  dateRange={dateRange}
                  onDateRangeChange={setDateRange}
                  placeholder={t('filter.progress.placeholder')}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const today = new Date();
                    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
                    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
                    setDateRange({ from: start, to: end });
                  }}
                >
                  {t('filter.button.thisWeek')}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const today = new Date();
                    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() - 7);
                    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
                    setDateRange({ from: start, to: end });
                  }}
                >
                  {t('filter.button.lastWeek')}
                </Button>

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
                  {t('filter.button.thisMonth')}
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
                  {t('filter.button.lastMonth')}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDateRange({ from: undefined, to: undefined });
                  }}
                >
                  {t('filter.button.showAll')}
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
              {t('dailyProgress.historyTitle')}
              {dateRange.from && dateRange.to && (
                <Badge variant="outline" className="ml-2">
                  {filteredProgress.length}/{dailyProgress.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {progressLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-muted-foreground">{t('dailyProgress.loading')}</p>
              </div>
            ) : filteredProgress.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>
                  {dateRange.from && dateRange.to
                    ? t('dailyProgress.noneRange')
                    : t('dailyProgress.none')
                  }
                </p>
                <p className="text-sm">
                  {dateRange.from && dateRange.to
                    ? t('dailyProgress.tryAdjust')
                    : t('dailyProgress.willAppear')
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredProgress.map((progress) => (
                  <Card
                    key={progress.id}
                    className="border-l-4 border-l-blue-500 cursor-pointer transition-shadow hover:shadow-md"
                    onClick={() => handleDailyProgressClick(progress)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            {getAttendanceIcon(progress.attendance)}
                            <Badge variant={getAttendanceBadgeVariant(progress.attendance)}>
                              {getAttendanceLabel(progress.attendance)}
                            </Badge>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {new Date(progress.date).toLocaleDateString(language === 'zh-CN' ? 'zh-CN' : 'en-US', {
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
                          <h5 className="font-medium text-sm">{t('dailyProgress.activities')}</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {progress.activities.map((activity, index) => (
                              <div key={index} className="pl-4 border-l-2 border-gray-200">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-sm">{activity.subject}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {getPerformanceLabel(activity.performance)}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground mb-1">
                                  {activity.description}
                                </p>
                                {activity.notes && (
                                <p className="text-xs text-muted-foreground">
                                    {t('dailyProgress.notesLabel')} {activity.notes}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-sm">{t('dailyProgress.noActivities')}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t('weeklyFeedback.historyTitle')}
              {feedbackDateRange.from && feedbackDateRange.to && (
                <Badge variant="outline" className="ml-2">
                  {filteredFeedback.length}/{weeklyFeedback.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-2">{t('filter.dateRange.label')}</label>
                <DateRangeFilter
                  dateRange={feedbackDateRange}
                  onDateRangeChange={setFeedbackDateRange}
                  placeholder={t('filter.feedback.placeholder')}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const today = new Date();
                    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
                    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
                    setFeedbackDateRange({ from: start, to: end });
                  }}
                >
                  {t('filter.button.thisWeek')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const today = new Date();
                    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() - 7);
                    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
                    setFeedbackDateRange({ from: start, to: end });
                  }}
                >
                  {t('filter.button.lastWeek')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFeedbackDateRange({ from: undefined, to: undefined })}
                >
                  {t('filter.button.showAll')}
                </Button>
              </div>
            </div>

            {feedbackLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-muted-foreground">{t('weeklyFeedback.loading')}</p>
              </div>
            ) : filteredFeedback.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>
                  {feedbackDateRange.from && feedbackDateRange.to
                    ? t('weeklyFeedback.noneRange')
                    : t('weeklyFeedback.none')
                  }
                </p>
                <p className="text-sm">
                  {feedbackDateRange.from && feedbackDateRange.to
                    ? t('weeklyFeedback.tryAdjust')
                    : t('weeklyFeedback.willAppear')
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredFeedback.map((entry) => (
                  <Card
                    key={entry.id ?? entry.weekStarting}
                    className="border-l-4 border-l-emerald-500 cursor-pointer transition-shadow hover:shadow-md"
                    onClick={() => handleWeeklyFeedbackClick(entry)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {new Date(entry.weekStarting).toLocaleDateString(language === 'zh-CN' ? 'zh-CN' : 'en-US')}
                            {' -> '}
                            {new Date(entry.weekEnding).toLocaleDateString(language === 'zh-CN' ? 'zh-CN' : 'en-US')}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <section>
                        <h5 className="font-medium text-sm">{t('weeklyFeedback.summary')}</h5>
                        <p className="text-sm text-muted-foreground">{entry.summary || '—'}</p>
                      </section>

                      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h5 className="font-medium text-sm">{t('weeklyFeedback.strengths')}</h5>
                          <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                            {(entry.strengths ?? []).length
                              ? entry.strengths.map((s, i) => <li key={i}>{s}</li>)
                              : <li className="list-none text-muted-foreground">—</li>}
                          </ul>
                        </div>
                        <div>
                          <h5 className="font-medium text-sm">{t('weeklyFeedback.areas')}</h5>
                          <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                            {(entry.areasToImprove ?? []).length
                              ? entry.areasToImprove.map((a, i) => <li key={i}>{a}</li>)
                              : <li className="list-none text-muted-foreground">—</li>}
                          </ul>
                        </div>
                      </section>

                      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h5 className="font-medium text-sm">{t('weeklyFeedback.teacherNotes')}</h5>
                          <p className="text-sm text-muted-foreground">{entry.teacherNotes || '—'}</p>
                        </div>
                        <div>
                          <h5 className="font-medium text-sm">{t('weeklyFeedback.nextWeekFocus')}</h5>
                          <p className="text-sm text-muted-foreground">{entry.nextWeekFocus || '—'}</p>
                        </div>
                      </section>
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
        <h1 className="text-3xl font-bold tracking-tight mb-6">{t('student.overview.allTitle')}</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* This will be populated by the Students page */}
          <p className="text-muted-foreground">{t('student.overview.allDesc')}</p>
        </div>
      </div>
    );
  } else {
    // Parent sees only their children
    if (loading) {
      return (
        <div className="container mx-auto py-8 px-4 animate-fade-in">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-muted-foreground">{t('student.parent.loading')}</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="container mx-auto py-8 px-4 animate-fade-in">
        <h1 className="text-3xl font-bold tracking-tight mb-4">{t('student.parent.myChildren')}</h1>
        {childrenStudentsList.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {childrenStudentsList.map(student => (
              <Card
                key={student.id}
                className="hover-card cursor-pointer"
                onClick={() => navigate(`/student/${student.id}`, { state: { student } })}
              >
                <CardHeader>
                  <CardTitle>{student.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>{t('student.info.grade')} {student.grade}</p>
                  <Badge>{student.grade}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="text-muted-foreground">{t('student.parent.noneTitle')}</p>
            <p className="text-sm text-muted-foreground mt-2">
              {t('student.parent.noneDesc')}
            </p>
          </div>
        )}
      </div>
    );
  }
};

export default StudentProfile;
