import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, MinusCircle, ArrowLeft } from 'lucide-react';
import { buildApiUrl } from '@/config/api';
import { getAuthHeaders } from '@/utils/auth';
import { format, parseISO } from 'date-fns';

interface Activity {
  subject: string;
  description: string;
  performance: string;
  notes: string;
  subjectId?: string;
  subjectName?: string;
  subjectDisplayName?: string;
  type?: 'english' | 'generic';
  taskSummary?: string;
  strengths?: string;
  improvements?: string;
  comment?: string;
  papers?: unknown[];
  english?: Record<string, unknown>;
  englishTasks?: EnglishTaskState[];
}

interface DailyProgressEntry {
  id?: string;
  studentId: string;
  date: string;
  attendance: string;
  attendanceStart?: string | null;
  attendanceEnd?: string | null;
  summary?: string | null;
  activities: Activity[];
}

type AssignedSubject = {
  id: string;
  name: string;
  code?: string | null;
};

type EnglishTaskConfig = {
  id: string;
  key: string;
  displayName: string;
  weeklyTargetCount: number;
  enabled: boolean;
  enabledFields: string[];
};

type EnglishTaskState = EnglishTaskConfig & {
  practiceCount: string;
  score: string;
  maxScore: string;
  problems: string;
  uiExpanded: boolean;
};

const emptyActivity = (): Activity => ({
  subject: '',
  description: '',
  performance: '',
  notes: '',
});

const isEnglishSubject = (subject: { name?: string; code?: string | null }) => {
  const text = `${subject.name || ''} ${subject.code || ''}`.toLowerCase();
  return text.includes('english') || text.includes('eng') || text.includes('英文') || text.includes('英语');
};

const buildTaskStates = (tasks: EnglishTaskConfig[], activity?: Activity): EnglishTaskState[] => {
  const existingTasks = Array.isArray(activity?.englishTasks) ? activity.englishTasks : [];
  return tasks
    .filter((task) => task.enabled !== false)
    .sort((a, b) => (a as any).sortOrder - (b as any).sortOrder)
    .map((task) => {
      const existing = existingTasks.find((item) => item.key === task.key);
      return {
        ...task,
        practiceCount: existing?.practiceCount ?? '',
        score: existing?.score ?? '',
        maxScore: existing?.maxScore ?? '100',
        problems: existing?.problems ?? '',
        uiExpanded: existing?.uiExpanded ?? false,
      };
    });
};

const buildEnglishActivity = (subject: AssignedSubject | undefined, tasks: EnglishTaskConfig[], existing?: Activity): Activity => ({
  ...emptyActivity(),
  ...existing,
  subject: subject?.name || existing?.subject || 'English',
  subjectId: subject?.id || existing?.subjectId || '',
  subjectName: subject?.name || existing?.subjectName || existing?.subject || 'English',
  subjectDisplayName: subject?.name || existing?.subjectDisplayName || existing?.subjectName || existing?.subject || 'English',
  type: 'english',
  papers: Array.isArray(existing?.papers) ? existing?.papers : [],
  englishTasks: buildTaskStates(tasks, existing),
});

const buildSubjectActivity = (subject: AssignedSubject): Activity => ({
  ...emptyActivity(),
  subject: subject.name,
  subjectId: subject.id,
  subjectName: subject.name,
  subjectDisplayName: subject.name,
  type: 'generic',
  taskSummary: '',
  strengths: '',
  improvements: '',
  comment: '',
  papers: [],
});

const toNumberOrNull = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
};

const taskSummary = (task: EnglishTaskState) => {
  const count = task.practiceCount.trim();
  if (!count) return 'Not practiced';
  const unit = task.key === 'reading' ? 'articles' : task.key === 'vocab' ? 'items' : 'times';
  return `${count} ${unit}`;
};

const buildEnglishPayload = (activity: Activity) => {
  const tasks = Array.isArray(activity.englishTasks) ? activity.englishTasks : [];
  const byKey = new Map(tasks.map((task) => [task.key, task]));
  const scored = (key: string, countField: 'exerciseCount' | 'articleCount') => {
    const task = byKey.get(key);
    return {
      text: task?.problems || '',
      otherLossPointText: task?.problems || '',
      score: toNumberOrNull(task?.score || ''),
      totalScore: toNumberOrNull(task?.maxScore || '') ?? 100,
      [countField]: Number(task?.practiceCount || 0) || 0,
    };
  };
  const vocab = byKey.get('vocab');
  const recitation = byKey.get('recitation');
  const essay = byKey.get('essay');
  return {
    editing: scored('editing', 'exerciseCount'),
    reading: scored('reading', 'articleCount'),
    grammar: scored('grammar', 'exerciseCount'),
    vocab: {
      text: vocab?.problems || '',
      vocabularySentenceCount: Number(vocab?.practiceCount || 0) || 0,
    },
    recitation: {
      text: recitation?.problems || recitation?.practiceCount || '',
    },
    essay: {
      text: essay?.problems || '',
      title: '',
      completed: Boolean(essay?.practiceCount || essay?.score),
      score: toNumberOrNull(essay?.score || ''),
      totalScore: toNumberOrNull(essay?.maxScore || ''),
    },
  };
};

const prepareActivityForSave = (activity: Activity): Activity => {
  if (activity.type === 'english') {
    return {
      ...activity,
      english: buildEnglishPayload(activity),
      taskSummary: 'English practice',
      description: 'English practice',
      performance: 'good',
      notes: activity.comment || '',
    };
  }

  return {
    ...activity,
    subject: activity.subjectName || activity.subject,
    description: activity.taskSummary || activity.description,
    performance: activity.performance || 'good',
    notes: activity.comment || activity.notes,
  };
};

const normalizeActivityForForm = (
  activity: Activity,
  subjects: AssignedSubject[],
  tasks: EnglishTaskConfig[],
): Activity => {
  const rawSubjectName = activity.subjectName || activity.subject || '';
  const rawSubject = { name: rawSubjectName, code: '' };
  const isEnglish = activity.type === 'english' || isEnglishSubject(rawSubject);
  if (isEnglish) {
    const matchingSubject = subjects.find((subject) => subject.id === activity.subjectId) || subjects.find(isEnglishSubject);
    return buildEnglishActivity(matchingSubject, tasks, activity);
  }

  return {
    ...emptyActivity(),
    ...activity,
    type: 'generic',
    subject: rawSubjectName,
    subjectName: rawSubjectName,
    subjectDisplayName: activity.subjectDisplayName || rawSubjectName,
    taskSummary: activity.taskSummary || activity.description || '',
    strengths: activity.strengths || '',
    improvements: activity.improvements || '',
    comment: activity.comment || activity.notes || '',
    papers: Array.isArray(activity.papers) ? activity.papers : [],
  };
};

const ProgressForm: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const studentId = searchParams.get('student') || '';
  const dateParam = searchParams.get('date') || '';
  const navigate = useNavigate();

  const [selectedStudent, setSelectedStudent] = useState<string>(studentId);
  const [selectedDate, setSelectedDate] = useState<Date>(dateParam ? parseISO(dateParam) : new Date());
  const [attendance, setAttendance] = useState<string>('present');
  const [attendanceStart, setAttendanceStart] = useState('18:00');
  const [attendanceEnd, setAttendanceEnd] = useState('21:00');
  const [summary, setSummary] = useState('');
  const [activities, setActivities] = useState<Activity[]>([emptyActivity()]);
  const [students, setStudents] = useState<{ id: string; name: string; grade: string }[]>([]);
  const [assignedSubjects, setAssignedSubjects] = useState<AssignedSubject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [englishTasks, setEnglishTasks] = useState<EnglishTaskConfig[]>([]);
  const [subjectToAdd, setSubjectToAdd] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [existingProgressId, setExistingProgressId] = useState<string | null>(null);
  const availableSubjectsToAdd = assignedSubjects
    .filter((subject) => !isEnglishSubject(subject))
    .filter((subject) => !activities.some((activity) => activity.subjectId === subject.id));

  useEffect(() => {
    setSelectedStudent(studentId);
  }, [studentId]);

  useEffect(() => {
    if (!dateParam) return;
    const parsedDate = parseISO(dateParam);
    if (!Number.isNaN(parsedDate.getTime())) {
      setSelectedDate(parsedDate);
    }
  }, [dateParam]);

  // Fetch students
  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const response = await fetch(buildApiUrl('students'), {
          headers: getAuthHeaders(),
        });
        if (response.ok) {
          const data = await response.json();
          setStudents(data);
          
          if (!selectedStudent && data.length > 0) {
            setSelectedStudent(data[0].id);
          }
        }
      } catch (error) {
        console.error('Error fetching students:', error);
      }
    };

    fetchStudents();
  }, [selectedStudent]);

  useEffect(() => {
    if (!selectedStudent) {
      setAssignedSubjects([]);
      return;
    }

    let cancelled = false;
    const fetchAssignedSubjects = async () => {
      setSubjectsLoading(true);
      try {
        const [assignedResponse, subjectsResponse] = await Promise.all([
          fetch(buildApiUrl(`students/${selectedStudent}/subjects`), {
            headers: getAuthHeaders(),
          }),
          fetch(buildApiUrl('subjects'), {
            headers: getAuthHeaders(),
          }),
        ]);
        if (!assignedResponse.ok) throw new Error(`Assigned subjects HTTP error ${assignedResponse.status}`);
        if (!subjectsResponse.ok) throw new Error(`Subjects HTTP error ${subjectsResponse.status}`);

        const assignedIds: string[] = await assignedResponse.json();
        const allSubjects: Array<{
          id: string;
          name?: string | null;
          chineseName?: string | null;
          englishName?: string | null;
          code?: string | null;
        }> = await subjectsResponse.json();
        if (cancelled) return;

        const assignedSet = new Set(assignedIds);
        const nextSubjects = allSubjects
          .filter((subject) => assignedSet.has(subject.id))
          .map((subject) => ({
            id: subject.id,
            name: subject.name || subject.chineseName || subject.englishName || subject.code || 'Unnamed subject',
            code: subject.code || null,
          }));

        setAssignedSubjects(nextSubjects);
        setActivities((prev) =>
          prev.map((activity) =>
            activity.subject && !nextSubjects.some((subject) => subject.name === activity.subject)
              ? { ...activity, subject: '' }
              : activity
          )
        );
      } catch (error) {
        if (!cancelled) {
          console.error('Error fetching assigned subjects:', error);
          setAssignedSubjects([]);
        }
      } finally {
        if (!cancelled) setSubjectsLoading(false);
      }
    };

    fetchAssignedSubjects();
    return () => {
      cancelled = true;
    };
  }, [selectedStudent]);

  useEffect(() => {
    if (!selectedStudent) {
      setEnglishTasks([]);
      return;
    }

    let cancelled = false;
    const fetchEnglishTasks = async () => {
      try {
        const response = await fetch(buildApiUrl(`students/${selectedStudent}/english-tasks`), {
          headers: getAuthHeaders(),
        });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data: { tasks?: EnglishTaskConfig[] } = await response.json();
        if (cancelled) return;
        setEnglishTasks(data.tasks || []);
      } catch (error) {
        if (!cancelled) {
          console.error('Error fetching English tasks:', error);
          setEnglishTasks([]);
        }
      }
    };

    fetchEnglishTasks();
    return () => {
      cancelled = true;
    };
  }, [selectedStudent]);

  useEffect(() => {
    if (!assignedSubjects.length || !englishTasks.length) return;
    const englishSubject = assignedSubjects.find(isEnglishSubject);
    setActivities((prev) => {
      const existingEnglish = prev.find((activity) => activity.type === 'english');
      const withoutEnglish = prev.filter((activity) => activity.type !== 'english');
      return [buildEnglishActivity(englishSubject, englishTasks, existingEnglish), ...withoutEnglish];
    });
  }, [assignedSubjects, englishTasks]);

  // Fetch existing progress if editing
  useEffect(() => {
    if (!selectedStudent || !selectedDate) return;

    const fetchExistingProgress = async () => {
      try {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const url = `${buildApiUrl('progress/student')}?studentId=${encodeURIComponent(selectedStudent)}&date=${encodeURIComponent(dateStr)}`;
        const response = await fetch(url, {
          headers: getAuthHeaders(),
        });

        if (response.ok) {
          const data = await response.json();
          setExistingProgressId(data.id || null);
          setAttendance(data.attendance || 'present');
          setAttendanceStart(data.attendanceStart || '18:00');
          setAttendanceEnd(data.attendanceEnd || '21:00');
          setSummary(data.summary || '');
          setActivities(
            Array.isArray(data.activities) && data.activities.length > 0
              ? data.activities.map((activity: Activity) => normalizeActivityForForm(activity, assignedSubjects, englishTasks))
              : [emptyActivity()]
          );
        } else if (response.status === 404) {
          // No existing progress, reset form
          setExistingProgressId(null);
          setAttendance('present');
          setAttendanceStart('18:00');
          setAttendanceEnd('21:00');
          setSummary('');
          const englishSubject = assignedSubjects.find(isEnglishSubject);
          setActivities(englishTasks.length ? [buildEnglishActivity(englishSubject, englishTasks)] : []);
        }
      } catch (error) {
        console.error('Error fetching existing progress:', error);
      }
    };

    fetchExistingProgress();
  }, [selectedStudent, selectedDate, assignedSubjects, englishTasks]);

  const handleAddActivity = () => {
    if (!subjectToAdd) return;
    const subject = assignedSubjects.find((item) => item.id === subjectToAdd);
    if (!subject) return;
    if (activities.some((activity) => activity.subjectId === subject.id)) {
      alert('This subject has already been added');
      return;
    }
    setActivities([...activities, buildSubjectActivity(subject)]);
    setSubjectToAdd('');
  };

  const handleRemoveActivity = (index: number) => {
    const target = activities[index];
    if (target?.type === 'english') return;
    const updatedActivities = activities.filter((_, i) => i !== index);
    setActivities(updatedActivities);
  };

  const handleActivityChange = (index: number, field: keyof Activity, value: string) => {
    const updatedActivities = [...activities];
    updatedActivities[index] = { ...updatedActivities[index], [field]: value };
    setActivities(updatedActivities);
  };

  const handleEnglishTaskChange = (activityIndex: number, taskIndex: number, field: keyof EnglishTaskState, value: string | boolean) => {
    setActivities((prev) =>
      prev.map((activity, index) => {
        if (index !== activityIndex || !Array.isArray(activity.englishTasks)) return activity;
        const englishTasks = activity.englishTasks.map((task, i) =>
          i === taskIndex ? { ...task, [field]: value } : task
        );
        return { ...activity, englishTasks };
      })
    );
  };

  const validateForm = () => {
    if (!selectedStudent) {
      alert('Please select a student');
      return false;
    }
    if (!selectedDate) {
      alert('Please select a date');
      return false;
    }
    if (!attendanceStart || !attendanceEnd) {
      alert('Please fill out attendance start and end times');
      return false;
    }
    const genericActivities = activities.filter((activity) => activity.type !== 'english');
    if (genericActivities.some(a => !a.subjectName || !a.taskSummary || !a.strengths || !a.improvements)) {
      alert('Please complete the activity details for each added subject');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const progressEntry: DailyProgressEntry = {
        id: existingProgressId,
        studentId: selectedStudent,
        date: format(selectedDate, 'yyyy-MM-dd'),
        attendance,
        attendanceStart,
        attendanceEnd,
        summary,
        activities: activities.map(prepareActivityForSave),
      };

      const url = existingProgressId 
        ? buildApiUrl(`progress/${existingProgressId}`)
        : buildApiUrl('progress');
      
      const method = existingProgressId ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(progressEntry),
      });

      if (response.ok) {
        alert(`Progress ${existingProgressId ? 'updated' : 'created'} successfully!`);
        navigate('/daily-progress');
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save progress');
      }
    } catch (error: unknown) {
      console.error('Error saving progress:', error);
      const message = error instanceof Error ? error.message : 'Failed to save progress. Please try again.';
      alert(message);
    } finally {
      setIsLoading(false);
    }
  };

  const getStudentName = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    return student?.name || 'Unknown Student';
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/daily-progress')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Progress
        </Button>
        
        <h1 className="text-3xl font-bold tracking-tight">
          {existingProgressId ? 'Edit Progress' : 'Add Progress'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {existingProgressId 
            ? `Editing progress for ${getStudentName(selectedStudent)} on ${format(selectedDate, 'PPP')}`
            : 'Create a new progress entry'
          }
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Student Information</CardTitle>
            <CardDescription>Select a student and date for this progress entry</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="student">Student</Label>
                <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a student" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map(student => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.name} (Grade {student.grade})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={format(selectedDate, 'yyyy-MM-dd')}
                  onChange={(e) => setSelectedDate(parseISO(e.target.value))}
                />
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
                      className="h-4 w-4"
                    />
                    <Label htmlFor={status} className="cursor-pointer capitalize">
                      {status}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start time</Label>
                <Input
                  type="time"
                  value={attendanceStart}
                  onChange={(e) => setAttendanceStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>End time</Label>
                <Input
                  type="time"
                  value={attendanceEnd}
                  onChange={(e) => setAttendanceEnd(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activities</CardTitle>
            <CardDescription>Record English tasks first, then add any other assigned subjects</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activities.map((activity, index) => (
              <div key={index} className="space-y-4 p-4 border border-border rounded-md">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{activity.subjectDisplayName || activity.subjectName || activity.subject || `Activity ${index + 1}`}</h4>
                    {activity.type === 'english' ? (
                      <p className="text-xs text-muted-foreground">English practice tasks</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Subject activity record</p>
                    )}
                  </div>
                  {activity.type !== 'english' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveActivity(index)}
                    >
                      <MinusCircle className="h-4 w-4 mr-2" />
                      Remove
                    </Button>
                  )}
                </div>

                {activity.type === 'english' ? (
                  <div className="space-y-2">
                    {(activity.englishTasks || []).map((task, taskIndex) => (
                      <div key={task.key} className="rounded-md border bg-muted/20">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                          onClick={() => handleEnglishTaskChange(index, taskIndex, 'uiExpanded', !task.uiExpanded)}
                        >
                          <span className="font-medium">{task.displayName}</span>
                          <span className="text-xs text-muted-foreground">
                            {taskSummary(task)} · {task.uiExpanded ? 'Collapse' : 'Expand'}
                          </span>
                        </button>
                        {task.uiExpanded && (
                          <div className="space-y-3 border-t px-3 py-3">
                            {task.enabledFields.includes('practiceCount') && (
                              <div className="space-y-2">
                                <Label>Practice count</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  value={task.practiceCount}
                                  onChange={(e) => handleEnglishTaskChange(index, taskIndex, 'practiceCount', e.target.value)}
                                />
                              </div>
                            )}
                            {task.enabledFields.includes('score') && (
                              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                                <div className="space-y-2">
                                  <Label>Score</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    value={task.score}
                                    onChange={(e) => handleEnglishTaskChange(index, taskIndex, 'score', e.target.value)}
                                  />
                                </div>
                                <span className="pb-2 text-muted-foreground">/</span>
                                <div className="space-y-2">
                                  <Label>Max</Label>
                                  <Input
                                    type="number"
                                    min={1}
                                    value={task.maxScore}
                                    onChange={(e) => handleEnglishTaskChange(index, taskIndex, 'maxScore', e.target.value)}
                                  />
                                </div>
                              </div>
                            )}
                            {task.enabledFields.includes('problems') && (
                              <div className="space-y-2">
                                <Label>Problems / notes</Label>
                                <Textarea
                                  value={task.problems}
                                  onChange={(e) => handleEnglishTaskChange(index, taskIndex, 'problems', e.target.value)}
                                  placeholder="Record mistakes, weak points, or notes"
                                  rows={3}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    <div className="rounded-md bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                      Paper practice: no papers
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>What did the student do? *</Label>
                      <Textarea
                        value={activity.taskSummary || ''}
                        onChange={(e) => handleActivityChange(index, 'taskSummary', e.target.value)}
                        placeholder="e.g. completed chapter practice, corrected mistakes, reviewed concepts"
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Strengths *</Label>
                      <Textarea
                        value={activity.strengths || ''}
                        onChange={(e) => handleActivityChange(index, 'strengths', e.target.value)}
                        placeholder="e.g. solid concept understanding, efficient problem solving"
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Needs improvement *</Label>
                      <Textarea
                        value={activity.improvements || ''}
                        onChange={(e) => handleActivityChange(index, 'improvements', e.target.value)}
                        placeholder="e.g. needs better wording, checking details, or time allocation"
                        rows={3}
                      />
                    </div>
                    <div className="rounded-md bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                      Paper practice: no papers
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={subjectToAdd} onValueChange={setSubjectToAdd} disabled={subjectsLoading}>
                <SelectTrigger className="sm:flex-1">
                  <SelectValue
                    placeholder={
                      subjectsLoading
                        ? 'Loading subjects...'
                        : availableSubjectsToAdd.length
                          ? 'Add assigned subject'
                          : 'No more assigned subjects'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableSubjectsToAdd
                    .map((subject) => (
                      <SelectItem key={subject.id} value={subject.id}>
                        {subject.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={handleAddActivity} disabled={!subjectToAdd}>
                <Plus className="h-4 w-4 mr-2" />
                Add subject
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>Optional daily summary</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Write a short summary for the day..."
              rows={4}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/daily-progress')}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : (existingProgressId ? 'Update Progress' : 'Save Progress')}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ProgressForm;
