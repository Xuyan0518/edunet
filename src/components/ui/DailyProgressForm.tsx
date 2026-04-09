import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarIcon, Plus, MinusCircle, CheckCircle2, Edit2, XCircle, ArrowLeft } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, parse } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';
import { getAuthHeaders } from '@/utils/auth';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';

interface Activity {
  subject: string;
  description: string;
  performance: string;
  notes: string;
}

interface DailyProgressEntry {
  id?: string; // for existing entries
  studentId: string;
  date: string; // yyyy-MM-dd
  attendance: string;
  activities: Activity[];
}

const DailyProgressForm: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const studentIdFromUrl = searchParams.get('student') || '';
  const dateFromUrl = searchParams.get('date') || '';

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedStudent, setSelectedStudent] = useState<string>(studentIdFromUrl || '');
  const [attendance, setAttendance] = useState<string>('present');
  const [activities, setActivities] = useState<Activity[]>([
    { subject: '', description: '', performance: '', notes: '' },
  ]);
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [existingProgressId, setExistingProgressId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [backupProgress, setBackupProgress] = useState<DailyProgressEntry | null>(null);

  const navigate = useNavigate();
  const { toast } = useToast();
  const { role } = useAuth();
  const { t, language } = useI18n();
  const isReadOnly = role !== 'teacher';
  const isEditable = isEditing && !isReadOnly;
  const locale = language === 'zh-CN' ? zhCN : enUS;
  const formatDisplayDate = (date: Date) =>
    date.toLocaleDateString(language === 'zh-CN' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  const didLoadStudentsRef = useRef(false);
  const didSyncDateRef = useRef(false);

  // --- helpers ---
  const resetForm = () => {
    setAttendance('present');
    setActivities([{ subject: '', description: '', performance: '', notes: '' }]);
  };

  const getAttendanceLabel = (status: string) => {
    switch (status) {
      case 'present':
        return t('attendance.present');
      case 'absent':
        return t('attendance.absent');
      case 'late':
        return t('attendance.late');
      default:
        return status;
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

  // Fetch students on component mount
  useEffect(() => {
    let cancelled = false;
    const fetchStudents = async () => {
      try {
        const response = await fetch(buildApiUrl('students'), {
          headers: getAuthHeaders(),
        });
        if (!response.ok) throw new Error('Network response was not ok');
        const data: Array<{ id: string; name: string }> = await response.json();
        if (cancelled) return;
        setStudents(data);

        // If URL had ?student=, sync it only if valid; else clear
        if (studentIdFromUrl) {
          if (data.some((s) => s.id === studentIdFromUrl) && selectedStudent !== studentIdFromUrl) {
            setSelectedStudent(studentIdFromUrl);
          } else if (!data.some((s) => s.id === studentIdFromUrl) && selectedStudent !== '') {
            setSelectedStudent('');
          }
        }
      } catch (error) {
        console.error('Error fetching students:', error);
        toast({
          title: t('toast.title.error'),
          description: t('dailyProgress.toast.fetchStudents'),
          variant: 'destructive',
        });
      } finally {
        didLoadStudentsRef.current = true;
      }
    };
    fetchStudents();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!didLoadStudentsRef.current) return;
    if (!studentIdFromUrl) return;
    if (students.some((s) => s.id === studentIdFromUrl) && selectedStudent !== studentIdFromUrl) {
      setSelectedStudent(studentIdFromUrl);
    }
  }, [studentIdFromUrl, students, selectedStudent]);

  // Keep URL in sync — only for ?student=
  useEffect(() => {
    if (!didLoadStudentsRef.current) return;
    const current = searchParams.get('student') || '';
    const desired = selectedStudent || '';
    if (current === desired) return;

    const next = new URLSearchParams(searchParams);
    if (desired) next.set('student', desired);
    else next.delete('student');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent]);

  useEffect(() => {
    if (!didLoadStudentsRef.current) return;
    if (!selectedDate) return;
    const desired = format(selectedDate, 'yyyy-MM-dd');
    const current = searchParams.get('date') || '';
    if (current === desired) return;
    const next = new URLSearchParams(searchParams);
    next.set('date', desired);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  useEffect(() => {
    if (!dateFromUrl) return;
    const parsedDate = parse(dateFromUrl, 'yyyy-MM-dd', new Date());
    if (isNaN(parsedDate.getTime())) return;
    if (!didSyncDateRef.current || (selectedDate && format(selectedDate, 'yyyy-MM-dd') !== dateFromUrl)) {
      setSelectedDate(parsedDate);
      didSyncDateRef.current = true;
    }
  }, [dateFromUrl, selectedDate]);

  // Fetch existing progress when student or date changes (with AbortController)
  useEffect(() => {
    if (!selectedStudent || !selectedDate) {
      setExistingProgressId(null);
      setIsEditing(false);
      resetForm();
      return;
    }

    const ac = new AbortController();

    const fetchProgress = async () => {
      setIsLoading(true);
      try {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const url = `${buildApiUrl('progress/student')}?studentId=${encodeURIComponent(
          selectedStudent
        )}&date=${encodeURIComponent(dateStr)}`;
        const response = await fetch(url, { 
          signal: ac.signal,
          headers: getAuthHeaders(),
        });

        if (!response.ok) {
          if (response.status === 404) {
            // No existing progress, reset form for new entry
            setExistingProgressId(null);
            setIsEditing(!isReadOnly); // allow entering new data for teachers only
            resetForm();
            return;
          }
          throw new Error('Failed to fetch progress');
        }

        const data: DailyProgressEntry = await response.json();
        if (ac.signal.aborted) return;

        setExistingProgressId(data.id || null);
        setAttendance(data.attendance ?? 'present');
        setActivities(
          Array.isArray(data.activities) && data.activities.length
            ? data.activities
            : [{ subject: '', description: '', performance: '', notes: '' }]
        );
        setIsEditing(false); // view mode initially
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('Error fetching progress:', error);
        toast({
          title: t('toast.title.error'),
          description: t('dailyProgress.toast.fetchEntry'),
          variant: 'destructive',
        });
        setExistingProgressId(null);
        setIsEditing(!isReadOnly);
        resetForm();
      } finally {
        if (!ac.signal.aborted) setIsLoading(false);
      }
    };

    fetchProgress();
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent, selectedDate]);

  const handleAddActivity = () => {
    if (!isEditable) return;
    setActivities((prev) => [...prev, { subject: '', description: '', performance: '', notes: '' }]);
  };

  const handleRemoveActivity = (index: number) => {
    if (!isEditable) return;
    if (activities.length <= 1) return;
    const updatedActivities = [...activities];
    updatedActivities.splice(index, 1);
    setActivities(
      updatedActivities.length
        ? updatedActivities
        : [{ subject: '', description: '', performance: '', notes: '' }]
    );
  };

  const handleActivityChange = (index: number, field: keyof Activity, value: string) => {
    if (!isEditable) return;
    const updatedActivities = [...activities];
    updatedActivities[index] = { ...updatedActivities[index], [field]: value };
    setActivities(updatedActivities);
  };

  const validateForm = () => {
    if (!selectedStudent) {
      toast({ title: t('toast.title.error'), description: t('dailyProgress.toast.selectStudent'), variant: 'destructive' });
      return false;
    }
    if (!selectedDate) {
      toast({ title: t('toast.title.error'), description: t('dailyProgress.toast.selectDate'), variant: 'destructive' });
      return false;
    }
    if (activities.some((a) => !a.subject || !a.description || !a.performance)) {
      toast({
        title: t('toast.title.error'),
        description: t('dailyProgress.toast.fillRequired'),
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const progressEntry: DailyProgressEntry = {
      studentId: selectedStudent,
      date: format(selectedDate!, 'yyyy-MM-dd'),
      attendance,
      activities,
    };

    try {
      let response: Response;
      if (existingProgressId && isEditing) {
        // Update existing progress with PUT
        response = await fetch(buildApiUrl(`progress/${existingProgressId}`), {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(progressEntry),
        });
      } else if (!existingProgressId) {
        // Create new progress with POST
        response = await fetch(buildApiUrl('progress'), {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(progressEntry),
        });
      } else {
        // Not editing existing, no action
        toast({ title: t('toast.title.info'), description: t('dailyProgress.toast.noChanges'), variant: 'default' });
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save progress');
      }

      const savedData = await response.json();

      toast({
        title: t('toast.title.success'),
        description: t('dailyProgress.toast.saved', {
          action: existingProgressId
            ? t('dailyProgress.toast.action.updated')
            : t('dailyProgress.toast.action.created'),
        }),
      });

      // Update state to reflect saved data
      setExistingProgressId(savedData.id || existingProgressId);
      setIsEditing(false);
      setBackupProgress(null);
    } catch (err: unknown) {
      console.error('Error saving progress:', err);
      toast({
        title: t('toast.title.error'),
        description: t('dailyProgress.toast.saveFailed'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 animate-fade-in max-w-4xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/students')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('student.backToStudents')}
        </Button>
      </div>
      
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{t('dailyProgressForm.title')}</h1>
        <p className="text-muted-foreground mt-1">
          {existingProgressId
            ? isEditing
              ? t('dailyProgressForm.subtitle.editing')
              : isReadOnly
              ? t('dailyProgressForm.subtitle.viewOnly')
              : t('dailyProgressForm.subtitle.viewing')
            : isReadOnly
            ? t('dailyProgressForm.subtitle.none')
            : t('dailyProgressForm.subtitle.new')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <Card className="hover-card">
          <CardHeader>
            <CardTitle>{t('dailyProgressForm.studentInfo.title')}</CardTitle>
            <CardDescription>{t('dailyProgressForm.studentInfo.desc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="student">{t('dailyProgressForm.student.label')}</Label>
                <Select
                  value={selectedStudent}
                  onValueChange={(val) => {
                    if (val !== selectedStudent) setSelectedStudent(val);
                    // Let the fetch effect determine existing vs new
                  }}
                  disabled={isLoading}
                >
                  <SelectTrigger id="student" className="focus-within-ring">
                    <SelectValue placeholder={t('dailyProgressForm.student.placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('dailyProgressForm.date.label')}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal focus-within-ring"
                      disabled={isLoading}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? formatDisplayDate(selectedDate) : <span>{t('dailyProgressForm.date.pick')}</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      initialFocus
                      locale={locale}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div>
              <Label>{t('dailyProgressForm.attendance.label')}</Label>
              <div className="flex space-x-4 mt-2">
                {['present', 'absent', 'late'].map((status) => (
                  <div className="flex items-center space-x-2" key={status}>
                    <input
                      type="radio"
                      id={status}
                      value={status}
                      checked={attendance === status}
                      onChange={() => setAttendance(status)}
                      disabled={!isEditable}
                      className={`h-4 w-4 ${
                        status === 'present'
                          ? 'text-primary'
                          : status === 'absent'
                          ? 'text-destructive'
                          : 'text-amber-500'
                      }`}
                    />
                    <Label htmlFor={status} className="cursor-pointer capitalize">
                      {getAttendanceLabel(status)}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-card">
          <CardHeader>
            <CardTitle>{t('dailyProgressForm.activities.title')}</CardTitle>
          </CardHeader>
          <CardDescription className="px-6 pt-0 pb-4">
            {isEditing ? t('dailyProgressForm.activities.desc.edit') : t('dailyProgressForm.activities.desc.view')}
          </CardDescription>
          <CardContent className="space-y-6">
            {activities.map((activity, index) => (
              <div
                key={index}
                className="space-y-4 p-4 border border-border rounded-md relative bg-muted"
                aria-disabled={!isEditing}
              >
                {isEditable && activities.length > 1 && (
                  <div className="absolute top-4 right-4">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveActivity(index)}
                      aria-label="Remove activity"
                    >
                      <MinusCircle className="h-5 w-5 text-destructive" />
                    </Button>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`subject-${index}`}>{t('dailyProgressForm.activity.subject')}</Label>
                    <Input
                      id={`subject-${index}`}
                      value={activity.subject}
                      onChange={(e) => handleActivityChange(index, 'subject', e.target.value)}
                      placeholder={t('dailyProgressForm.activity.subject.placeholder')}
                      className="focus-within-ring"
                      readOnly={!isEditable}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`performance-${index}`}>{t('dailyProgressForm.activity.performance')}</Label>
                    {isEditable ? (
                      <Select
                        value={activity.performance}
                        onValueChange={(value) => handleActivityChange(index, 'performance', value)}
                      >
                        <SelectTrigger id={`performance-${index}`} className="focus-within-ring">
                          <SelectValue placeholder={t('dailyProgressForm.activity.performance.placeholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="excellent">{t('dailyProgressForm.activity.performance.excellent')}</SelectItem>
                          <SelectItem value="good">{t('dailyProgressForm.activity.performance.good')}</SelectItem>
                          <SelectItem value="needs improvement">{t('dailyProgressForm.activity.performance.needsImprovement')}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input id={`performance-${index}`} value={getPerformanceLabel(activity.performance)} readOnly />
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`description-${index}`}>{t('dailyProgressForm.activity.description')}</Label>
                  {isEditable ? (
                    <Input
                      id={`description-${index}`}
                      value={activity.description}
                      onChange={(e) => handleActivityChange(index, 'description', e.target.value)}
                      placeholder={t('dailyProgressForm.activity.description.placeholder')}
                      className="focus-within-ring"
                    />
                  ) : (
                    <Input id={`description-${index}`} value={activity.description} readOnly />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`notes-${index}`}>{t('dailyProgressForm.activity.notes')}</Label>
                  {isEditable ? (
                    <Textarea
                      id={`notes-${index}`}
                      value={activity.notes}
                      onChange={(e) => handleActivityChange(index, 'notes', e.target.value)}
                      placeholder={t('dailyProgressForm.activity.notes.placeholder')}
                      className="focus-within-ring"
                      rows={3}
                    />
                  ) : (
                    <Textarea id={`notes-${index}`} value={activity.notes} readOnly rows={3} />
                  )}
                </div>
              </div>
            ))}

            {isEditable && (
              <Button type="button" variant="outline" onClick={handleAddActivity} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                {t('dailyProgressForm.addActivity')}
              </Button>
            )}
          </CardContent>

          <CardFooter className="flex justify-end gap-2">
            {/* View existing (not editing) */}
            {!isEditing && existingProgressId && !isReadOnly && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBackupProgress({
                    id: existingProgressId || undefined,
                    studentId: selectedStudent,
                    date: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '',
                    attendance,
                    activities: [...activities],
                  });
                  setIsEditing(true);
                }}
              >
                <Edit2 size={16} className="mr-2" />
                {t('dailyProgressForm.edit')}
              </Button>
            )}

            {/* Editing existing: Cancel + Update */}
            {isEditing && existingProgressId && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (backupProgress) {
                      setAttendance(backupProgress.attendance);
                      setActivities(backupProgress.activities);
                      setSelectedStudent(backupProgress.studentId);
                      // timezone-safe restore from yyyy-MM-dd
                      const restored = parse(backupProgress.date, 'yyyy-MM-dd', new Date());
                      setSelectedDate(restored);
                      setExistingProgressId(backupProgress.id || null);
                    }
                    setIsEditing(false);
                    setBackupProgress(null);
                  }}
                >
                  <XCircle size={16} className="mr-2" />
                  {t('dailyProgressForm.cancelEdit')}
                </Button>
                {!isReadOnly && (
                  <Button type="submit" disabled={isLoading}>
                    {t('dailyProgressForm.update')}
                  </Button>
                )}
              </>
            )}

            {/* Creating new */}
            {!existingProgressId && isEditing && !isReadOnly && (
              <Button type="submit" disabled={isLoading}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {t('dailyProgressForm.save')}
              </Button>
            )}
          </CardFooter>
        </Card>
      </form>
    </div>
  );
};

export default DailyProgressForm;
