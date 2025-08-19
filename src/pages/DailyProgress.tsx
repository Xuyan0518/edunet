import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar as CalendarIcon, Plus, MinusCircle, CheckCircle2, Edit2, XCircle } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, parse } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';

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

const performanceOptions = [
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'needs improvement', label: 'Needs Improvement' },
];

const DailyProgress: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const studentIdFromUrl = searchParams.get('student') || '';

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

  const didLoadStudentsRef = useRef(false);

  // --- helpers ---
  const resetForm = () => {
    setAttendance('present');
    setActivities([{ subject: '', description: '', performance: '', notes: '' }]);
  };

  // Fetch students on component mount
  useEffect(() => {
    let cancelled = false;
    const fetchStudents = async () => {
      try {
        const response = await fetch(buildApiUrl('students'));
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        if (cancelled) return;
        setStudents(data);

        // If URL had ?student=, sync it only if valid; else clear
        if (studentIdFromUrl) {
          if (data.some((s: any) => s.id === studentIdFromUrl) && selectedStudent !== studentIdFromUrl) {
            setSelectedStudent(studentIdFromUrl);
          } else if (!data.some((s: any) => s.id === studentIdFromUrl) && selectedStudent !== '') {
            setSelectedStudent('');
          }
        }
      } catch (error) {
        console.error('Error fetching students:', error);
        toast({
          title: 'Error',
          description: 'Failed to fetch students',
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
        const response = await fetch(url, { signal: ac.signal });

        if (!response.ok) {
          if (response.status === 404) {
            // No existing progress, reset form for new entry
            setExistingProgressId(null);
            setIsEditing(true); // allow entering new data
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
      } catch (error: any) {
        if (error?.name === 'AbortError') return;
        console.error('Error fetching progress:', error);
        toast({
          title: 'Error',
          description: 'Failed to fetch progress entry',
          variant: 'destructive',
        });
        setExistingProgressId(null);
        setIsEditing(true);
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
    if (!isEditing) return;
    setActivities((prev) => [...prev, { subject: '', description: '', performance: '', notes: '' }]);
  };

  const handleRemoveActivity = (index: number) => {
    if (!isEditing) return;
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
    if (!isEditing) return;
    const updatedActivities = [...activities];
    updatedActivities[index] = { ...updatedActivities[index], [field]: value };
    setActivities(updatedActivities);
  };

  const validateForm = () => {
    if (!selectedStudent) {
      toast({ title: 'Error', description: 'Please select a student', variant: 'destructive' });
      return false;
    }
    if (!selectedDate) {
      toast({ title: 'Error', description: 'Please select a date', variant: 'destructive' });
      return false;
    }
    if (activities.some((a) => !a.subject || !a.description || !a.performance)) {
      toast({
        title: 'Error',
        description: 'Please fill out all required fields for each activity',
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(progressEntry),
        });
      } else if (!existingProgressId) {
        // Create new progress with POST
        response = await fetch(buildApiUrl('progress'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(progressEntry),
        });
      } else {
        // Not editing existing, no action
        toast({ title: 'Info', description: 'No changes to save', variant: 'default' });
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save progress');
      }

      const savedData = await response.json();

      toast({
        title: 'Success',
        description: `Progress ${existingProgressId ? 'updated' : 'created'} successfully`,
      });

      // Update state to reflect saved data
      setExistingProgressId(savedData.id || existingProgressId);
      setIsEditing(false);
      setBackupProgress(null);
    } catch (err: any) {
      console.error('Error saving progress:', err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to save progress. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 animate-fade-in max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Daily Progress Entry</h1>
        <p className="text-muted-foreground mt-1">
          {existingProgressId && !isEditing
            ? 'Viewing existing progress. Click Edit to modify.'
            : existingProgressId && isEditing
            ? 'Editing existing progress.'
            : 'Create a new progress entry.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <Card className="hover-card">
          <CardHeader>
            <CardTitle>Student Information</CardTitle>
            <CardDescription>Select a student and date for this progress entry</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="student">Student</Label>
                <Select
                  value={selectedStudent}
                  onValueChange={(val) => {
                    if (val !== selectedStudent) setSelectedStudent(val);
                    // Let the fetch effect determine existing vs new
                  }}
                  disabled={isLoading}
                >
                  <SelectTrigger id="student" className="focus-within-ring">
                    <SelectValue placeholder="Select a student" />
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
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal focus-within-ring"
                      disabled={isLoading}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, 'PPP') : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div>
              <Label>Attendance</Label>
              <div className="flex space-x-4 mt-2">
                {['present', 'absent', 'late'].map((status) => (
                  <div className="flex items-center space-x-2" key={status}>
                    <input
                      type="radio"
                      id={status}
                      value={status}
                      checked={attendance === status}
                      onChange={() => setAttendance(status)}
                      disabled={!isEditing}
                      className={`h-4 w-4 ${
                        status === 'present'
                          ? 'text-primary'
                          : status === 'absent'
                          ? 'text-destructive'
                          : 'text-amber-500'
                      }`}
                    />
                    <Label htmlFor={status} className="cursor-pointer capitalize">
                      {status}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover-card">
          <CardHeader>
            <CardTitle>Activities</CardTitle>
          </CardHeader>
          <CardDescription className="px-6 pt-0 pb-4">
            {isEditing ? 'Fill in the activities and performance details.' : 'View the recorded activities and performance.'}
          </CardDescription>
          <CardContent className="space-y-6">
            {activities.map((activity, index) => (
              <div
                key={index}
                className="space-y-4 p-4 border border-border rounded-md relative bg-muted"
                aria-disabled={!isEditing}
              >
                {isEditing && activities.length > 1 && (
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
                    <Label htmlFor={`subject-${index}`}>Subject</Label>
                    <Input
                      id={`subject-${index}`}
                      value={activity.subject}
                      onChange={(e) => handleActivityChange(index, 'subject', e.target.value)}
                      placeholder="Enter subject"
                      className="focus-within-ring"
                      readOnly={!isEditing}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`performance-${index}`}>Performance</Label>
                    {isEditing ? (
                      <Select
                        value={activity.performance}
                        onValueChange={(value) => handleActivityChange(index, 'performance', value)}
                      >
                        <SelectTrigger id={`performance-${index}`} className="focus-within-ring">
                          <SelectValue placeholder="Rate performance" />
                        </SelectTrigger>
                        <SelectContent>
                          {performanceOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input id={`performance-${index}`} value={activity.performance} readOnly />
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`description-${index}`}>Description</Label>
                  {isEditing ? (
                    <Input
                      id={`description-${index}`}
                      value={activity.description}
                      onChange={(e) => handleActivityChange(index, 'description', e.target.value)}
                      placeholder="Describe the activity"
                      className="focus-within-ring"
                    />
                  ) : (
                    <Input id={`description-${index}`} value={activity.description} readOnly />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`notes-${index}`}>Teacher Notes</Label>
                  {isEditing ? (
                    <Textarea
                      id={`notes-${index}`}
                      value={activity.notes}
                      onChange={(e) => handleActivityChange(index, 'notes', e.target.value)}
                      placeholder="Additional notes"
                      className="focus-within-ring"
                      rows={3}
                    />
                  ) : (
                    <Textarea id={`notes-${index}`} value={activity.notes} readOnly rows={3} />
                  )}
                </div>
              </div>
            ))}

            {isEditing && (
              <Button type="button" variant="outline" onClick={handleAddActivity} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Activity
              </Button>
            )}
          </CardContent>

          <CardFooter className="flex justify-end gap-2">
            {/* View existing (not editing) */}
            {!isEditing && existingProgressId && (
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
                Edit
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
                  Cancel Edit
                </Button>
                <Button type="submit" disabled={isLoading}>
                  Update Progress
                </Button>
              </>
            )}

            {/* Creating new */}
            {!existingProgressId && isEditing && (
              <Button type="submit" disabled={isLoading}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Save Progress
              </Button>
            )}
          </CardFooter>
        </Card>
      </form>
    </div>
  );
};

export default DailyProgress;
