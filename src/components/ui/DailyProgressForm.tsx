import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Edit2, MinusCircle, Plus, Save, XCircle } from 'lucide-react';
import { format, parse } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { buildApiUrl } from '@/config/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getAuthHeaders } from '@/utils/auth';
import {
  addAssignedSubjectActivity,
  AssignedSubject,
  createDefaultEnglishActivity,
  CustomEnglishTask,
  DailyActivity,
  EnglishExercise,
  EnglishFields,
  EnglishScoredBlock,
  ensureEnglishActivity,
  isEnglishSubject,
  mergeConfiguredCustomEnglishTasks,
} from '@/utils/dailyProgressParity';
import { describeApiSaveError } from '@/utils/weeklyFeedbackParity';

type Student = { id: string; name: string; grade?: string };
type TopicProgress = {
  id: string;
  name?: string;
  title?: string;
  definitionRecited?: boolean;
  chapterExerciseCompleted?: boolean;
  children?: TopicProgress[];
};
type SubjectResponse = { subject?: { id?: string; name?: string; code?: string }; topics?: TopicProgress[] };
type EnglishTaskConfig = {
  id?: string;
  key: string;
  displayName?: string;
  chineseName?: string;
  englishName?: string;
  enabled?: boolean;
  enabledFields?: string[];
  weeklyTargetCount?: number;
};
type LossPoint = { id: string; label: string };
type LossCatalog = Record<string, LossPoint[]>;
type NamedOption = { id: string; name: string };
type PracticePaper = {
  id?: string;
  subjectId: string;
  subjectName: string;
  typeId: string;
  schoolId: string;
  description: string;
  strengths: string;
  improvements: string;
  score: number | null;
  total: number | null;
  updatedAt?: string;
};
type DailyProgressEntry = {
  id?: string;
  studentId: string;
  date: string;
  attendance: string;
  attendanceStart?: string | null;
  attendanceEnd?: string | null;
  summary?: string | null;
  activities: unknown[];
  updatedAt?: string | null;
};

const today = () => format(new Date(), 'yyyy-MM-dd');
const numberValue = (value: string) => value === '' ? null : Number(value);
const emptyExercise = (): EnglishExercise => ({ score: null, totalScore: 100, problems: '' });

const applyTaskConfiguration = (activities: DailyActivity[], tasks: EnglishTaskConfig[]) => activities.map((activity) => {
  if (activity.type !== 'english') return activity;
  const customEnglishTasks = mergeConfiguredCustomEnglishTasks(activity.customEnglishTasks || [], tasks);
  return { ...activity, customEnglishTasks };
});

const DailyProgressForm: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { role } = useAuth();
  const isReadOnly = role !== 'teacher';

  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState(searchParams.get('student') || '');
  const [selectedDate, setSelectedDate] = useState(searchParams.get('date') || today());
  const [assignedSubjects, setAssignedSubjects] = useState<AssignedSubject[]>([]);
  const [topicSubjects, setTopicSubjects] = useState<SubjectResponse[]>([]);
  const [subjectToAdd, setSubjectToAdd] = useState('');
  const [taskConfig, setTaskConfig] = useState<EnglishTaskConfig[]>([]);
  const [lossCatalog, setLossCatalog] = useState<LossCatalog>({});
  const [paperTypes, setPaperTypes] = useState<NamedOption[]>([]);
  const [paperSchools, setPaperSchools] = useState<NamedOption[]>([]);
  const [papers, setPapers] = useState<PracticePaper[]>([]);
  const [papersUpdatedAt, setPapersUpdatedAt] = useState('');
  const [attendance, setAttendance] = useState('present');
  const [attendanceStart, setAttendanceStart] = useState('18:00');
  const [attendanceEnd, setAttendanceEnd] = useState('21:00');
  const [summary, setSummary] = useState('');
  const [activities, setActivities] = useState<DailyActivity[]>([createDefaultEnglishActivity()]);
  const [existingProgressId, setExistingProgressId] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [backup, setBackup] = useState<DailyProgressEntry | null>(null);
  const [loading, setLoading] = useState(false);

  const isEditable = isEditing && !isReadOnly;
  const selectedStudentRow = students.find((student) => student.id === selectedStudent);
  const availableSubjects = assignedSubjects.filter((subject) =>
    !activities.some((activity) => activity.subjectId === subject.id || (isEnglishSubject(subject) && activity.type === 'english')));
  const configByKey = useMemo(() => new Map(taskConfig.map((task) => [task.key.toLowerCase(), task])), [taskConfig]);

  useEffect(() => {
    fetch(buildApiUrl('students'), { headers: getAuthHeaders() })
      .then(async (response) => {
        if (!response.ok) throw new Error('Failed to load students');
        const rows = await response.json() as Student[];
        setStudents(rows);
        if (selectedStudent && !rows.some((student) => student.id === selectedStudent)) setSelectedStudent('');
      })
      .catch(() => toast({ title: 'Unable to load students', variant: 'destructive' }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (selectedStudent) next.set('student', selectedStudent); else next.delete('student');
    if (selectedDate) next.set('date', selectedDate); else next.delete('date');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent, selectedDate]);

  useEffect(() => {
    if (!selectedStudent) {
      setAssignedSubjects([]);
      setTopicSubjects([]);
      setActivities([createDefaultEnglishActivity()]);
      return;
    }
    let cancelled = false;
    Promise.all([
      fetch(buildApiUrl(`students/${selectedStudent}/subjects/full`), { headers: getAuthHeaders() }).then((response) => response.ok ? response.json() : []),
      fetch(buildApiUrl(`students/${selectedStudent}/english-tasks`), { headers: getAuthHeaders() }).then((response) => response.ok ? response.json() : { tasks: [] }),
      fetch(buildApiUrl('loss-points'), { headers: getAuthHeaders() }).then((response) => response.ok ? response.json() : { categories: [] }),
      fetch(buildApiUrl('study-settings'), { headers: getAuthHeaders() }).then((response) => response.ok ? response.json() : null),
      fetch(buildApiUrl('paper-types'), { headers: getAuthHeaders() }).then((response) => response.ok ? response.json() : []),
      fetch(buildApiUrl('paper-schools'), { headers: getAuthHeaders() }).then((response) => response.ok ? response.json() : []),
    ]).then(([subjectRows, taskData, lossData, studySettings, typeRows, schoolRows]) => {
      if (cancelled) return;
      const subjects = (subjectRows as SubjectResponse[])
        .map((entry) => ({ id: entry.subject?.id || '', name: entry.subject?.name || '', code: entry.subject?.code || '' }))
        .filter((subject) => subject.id && subject.name);
      const tasks = Array.isArray(taskData?.tasks) ? taskData.tasks as EnglishTaskConfig[] : [];
      const catalog = Object.fromEntries((lossData?.categories || []).map((category: { code: string; points: LossPoint[] }) => [category.code, category.points || []]));
      setAssignedSubjects(subjects);
      setTopicSubjects(Array.isArray(subjectRows) ? subjectRows as SubjectResponse[] : []);
      setTaskConfig(tasks);
      setLossCatalog(catalog);
      setPaperTypes(Array.isArray(typeRows) ? typeRows : []);
      setPaperSchools(Array.isArray(schoolRows) ? schoolRows : []);
      setAttendanceStart(studySettings?.startTime || '18:00');
      setAttendanceEnd(studySettings?.endTime || '21:00');
      setActivities((current) => applyTaskConfiguration(ensureEnglishActivity(current, subjects), tasks));
    }).catch(() => toast({ title: 'Unable to load the student learning configuration', variant: 'destructive' }));
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent]);

  useEffect(() => {
    if (!selectedStudent || !selectedDate) return;
    const controller = new AbortController();
    setLoading(true);
    fetch(`${buildApiUrl('progress/student')}?studentId=${encodeURIComponent(selectedStudent)}&date=${encodeURIComponent(selectedDate)}`, {
      headers: getAuthHeaders(),
      signal: controller.signal,
    }).then(async (response) => {
      if (response.status === 404) {
        setExistingProgressId(null);
        setUpdatedAt('');
        setAttendance('present');
        setSummary('');
        setActivities(applyTaskConfiguration(ensureEnglishActivity([], assignedSubjects), taskConfig));
        setIsEditing(!isReadOnly);
        return;
      }
      if (!response.ok) throw new Error('Failed to load daily progress');
      const entry = await response.json() as DailyProgressEntry;
      setExistingProgressId(entry.id || null);
      setUpdatedAt(entry.updatedAt || '');
      setAttendance(entry.attendance || 'present');
      setAttendanceStart(entry.attendanceStart || '');
      setAttendanceEnd(entry.attendanceEnd || '');
      setSummary(entry.summary || '');
      setActivities(applyTaskConfiguration(ensureEnglishActivity(entry.activities || [], assignedSubjects), taskConfig));
      setIsEditing(false);
      setBackup(null);
    }).catch((error) => {
      if (error instanceof Error && error.name === 'AbortError') return;
      toast({ title: 'Unable to load daily progress', variant: 'destructive' });
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  // taskConfig/subjects are intentionally included so legacy activities are rebound after configuration loads.
  }, [selectedStudent, selectedDate, assignedSubjects, taskConfig, isReadOnly, toast]);

  useEffect(() => {
    if (!selectedStudent || !selectedDate) {
      setPapers([]);
      setPapersUpdatedAt('');
      return;
    }
    const controller = new AbortController();
    fetch(buildApiUrl(`students/${selectedStudent}/papers?date=${encodeURIComponent(selectedDate)}`), {
      headers: getAuthHeaders(),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error('Failed to load practice papers');
      const rows = await response.json() as Array<Partial<PracticePaper>>;
      const normalized = (Array.isArray(rows) ? rows : []).map((paper): PracticePaper => ({
        id: paper.id,
        subjectId: paper.subjectId || '',
        subjectName: paper.subjectName || '',
        typeId: paper.typeId || '',
        schoolId: paper.schoolId || '',
        description: paper.description || '',
        strengths: paper.strengths || '',
        improvements: paper.improvements || '',
        score: paper.score == null ? null : Number(paper.score),
        total: paper.total == null ? null : Number(paper.total),
        updatedAt: paper.updatedAt,
      }));
      setPapers(normalized);
      const responseVersion = response.headers.get('X-Papers-Updated-At') || '';
      setPapersUpdatedAt(responseVersion || normalized
        .map((paper) => paper.updatedAt || '')
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || '');
    }).catch((error) => {
      if (error instanceof Error && error.name === 'AbortError') return;
      setPapers([]);
      setPapersUpdatedAt('');
      toast({ title: 'Unable to load practice papers', variant: 'destructive' });
    });
    return () => controller.abort();
  }, [selectedStudent, selectedDate, toast]);

  useEffect(() => {
    if (!selectedStudent || !selectedDate || existingProgressId) return;
    const draft = localStorage.getItem(`edunet-daily-draft:${selectedStudent}:${selectedDate}`);
    if (!draft) return;
    try {
      const parsedDraft = JSON.parse(draft) as DailyProgressEntry;
      setAttendance(parsedDraft.attendance || 'present');
      setAttendanceStart(parsedDraft.attendanceStart || '');
      setAttendanceEnd(parsedDraft.attendanceEnd || '');
      setSummary(parsedDraft.summary || '');
      setActivities(applyTaskConfiguration(ensureEnglishActivity(parsedDraft.activities || [], assignedSubjects), taskConfig));
    } catch {
      localStorage.removeItem(`edunet-daily-draft:${selectedStudent}:${selectedDate}`);
    }
  }, [selectedStudent, selectedDate, existingProgressId, assignedSubjects, taskConfig]);

  const updateActivity = (index: number, updater: (activity: DailyActivity) => DailyActivity) =>
    setActivities((current) => current.map((activity, activityIndex) => activityIndex === index ? updater(activity) : activity));

  const updateEnglish = (index: number, updater: (english: EnglishFields) => EnglishFields) =>
    updateActivity(index, (activity) => ({ ...activity, english: updater(activity.english!) }));

  const addSubject = () => {
    const subject = assignedSubjects.find((row) => row.id === subjectToAdd);
    if (!subject) return;
    setActivities((current) => addAssignedSubjectActivity(current, subject));
    setSubjectToAdd('');
  };

  const removeActivity = (index: number) => setActivities((current) => current.filter((activity, activityIndex) => activityIndex !== index || activity.locked));

  const updateTopicProgress = async (topicId: string, condition: 'definitionRecited' | 'chapterExerciseCompleted', value: boolean) => {
    try {
      const response = await fetch(buildApiUrl(`students/${selectedStudent}/topics/${topicId}/progress`), {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ [condition]: value }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Unable to update topic progress');
      const updateTopics = (topics: TopicProgress[]): TopicProgress[] => topics.map((topic) => topic.id === topicId
        ? { ...topic, [condition]: value }
        : { ...topic, children: updateTopics(topic.children || []) });
      setTopicSubjects((rows) => rows.map((row) => ({ ...row, topics: updateTopics(row.topics || []) })));
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : 'Unable to update topic progress', variant: 'destructive' });
    }
  };

  const validationError = () => {
    if (!selectedStudent || !selectedDate) return 'Select a student and date.';
    if (!attendanceStart || !attendanceEnd) return 'Enter attendance start and end times.';
    for (const activity of activities) {
      if (activity.type === 'generic' && (!activity.taskSummary?.trim() || !activity.strengths?.trim() || !activity.improvements?.trim())) {
        return `Complete work, strengths, and improvements for ${activity.subjectName}.`;
      }
      if (activity.type === 'english') {
        for (const key of ['editing', 'reading', 'grammar'] as const) {
          const block = activity.english![key];
          if (block.exercises.some((exercise) => exercise.score != null && exercise.totalScore != null && exercise.score < exercise.totalScore && !exercise.problems.trim())) {
            return `Describe problems for every non-full ${key} score.`;
          }
        }
      }
    }
    return '';
  };

  const paperValidationError = () => {
    for (const paper of papers) {
      if (!paper.subjectId || !paper.typeId || !paper.schoolId) return 'Choose a subject, type, and school for every practice paper.';
      if (paper.score == null || paper.total == null || paper.total <= 0) return 'Enter a score and total for every practice paper.';
      if (!paper.strengths.trim() || !paper.improvements.trim()) return 'Complete what went well and needs improvement for every practice paper.';
    }
    return '';
  };

  const payload = (): DailyProgressEntry => ({
    studentId: selectedStudent,
    date: selectedDate,
    attendance,
    attendanceStart,
    attendanceEnd,
    summary,
    activities,
    ...(updatedAt ? { updatedAt } : {}),
  });

  const saveDraft = () => {
    if (!selectedStudent || !selectedDate) return;
    localStorage.setItem(`edunet-daily-draft:${selectedStudent}:${selectedDate}`, JSON.stringify(payload()));
    toast({ title: 'Draft saved on this device' });
  };

  const savePapers = async () => {
    const error = paperValidationError();
    if (error) return toast({ title: error, variant: 'destructive' });
    setLoading(true);
    try {
      const response = await fetch(buildApiUrl(`students/${selectedStudent}/papers/batch`), {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          date: selectedDate,
          papers: papers.map(({ subjectId, subjectName, typeId, schoolId, description, strengths, improvements, score, total }) => ({
            subjectId, subjectName, typeId, schoolId, description, strengths, improvements, score, total,
          })),
          expectedUpdatedAt: papersUpdatedAt,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(describeApiSaveError(result, response.status));
      setPapersUpdatedAt(response.headers.get('X-Papers-Updated-At') || papersUpdatedAt);
      toast({ title: 'Practice papers saved' });
    } catch (saveError) {
      toast({ title: saveError instanceof Error ? saveError.message : 'Unable to save practice papers', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const error = validationError();
    if (error) return toast({ title: error, variant: 'destructive' });
    setLoading(true);
    try {
      const response = await fetch(existingProgressId ? buildApiUrl(`progress/${existingProgressId}`) : buildApiUrl('progress'), {
        method: existingProgressId ? 'PUT' : 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload()),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(describeApiSaveError(result, response.status));

      setExistingProgressId(result.id || existingProgressId);
      setUpdatedAt(result.updatedAt || updatedAt);
      setActivities(applyTaskConfiguration(ensureEnglishActivity(result.activities || activities, assignedSubjects), taskConfig));
      setIsEditing(false);
      setBackup(null);
      localStorage.removeItem(`edunet-daily-draft:${selectedStudent}:${selectedDate}`);
      toast({ title: 'Daily progress saved' });
    } catch (saveError) {
      toast({ title: saveError instanceof Error ? saveError.message : 'Unable to save daily progress', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <Button variant="ghost" onClick={() => navigate('/students')} className="mb-4"><ArrowLeft className="mr-2 h-4 w-4" />Back to students</Button>
      <div className="mb-6"><h1 className="text-3xl font-bold">Daily progress</h1><p className="text-muted-foreground">Same English-first activity model and backend records as the WeChat Mini Program.</p></div>
      <form onSubmit={submit} className="space-y-6">
        <Card><CardHeader><CardTitle>Student and attendance</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Student"><Select value={selectedStudent} onValueChange={setSelectedStudent}><SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger><SelectContent>{students.map((student) => <SelectItem key={student.id} value={student.id}>{student.name}{student.grade ? ` · ${student.grade}` : ''}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Date"><Input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></Field>
          <Field label="Attendance"><Select value={attendance} onValueChange={setAttendance} disabled={!isEditable}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="present">Present</SelectItem><SelectItem value="late">Late</SelectItem><SelectItem value="absent">Absent</SelectItem></SelectContent></Select></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Start"><Input type="time" value={attendanceStart} onChange={(event) => setAttendanceStart(event.target.value)} readOnly={!isEditable} /></Field><Field label="End"><Input type="time" value={attendanceEnd} onChange={(event) => setAttendanceEnd(event.target.value)} readOnly={!isEditable} /></Field></div>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Activity records</CardTitle><CardDescription>English is always present. Add other cards only from subjects assigned to {selectedStudentRow?.name || 'the student'}.</CardDescription></CardHeader><CardContent className="space-y-5">
          {activities.map((activity, index) => activity.type === 'english'
            ? <EnglishActivityCard key={`${activity.subjectId || 'english'}-${index}`} activity={activity} editable={isEditable} configByKey={configByKey} lossCatalog={lossCatalog} onEnglish={(updater) => updateEnglish(index, updater)} onActivity={(patch) => updateActivity(index, (current) => ({ ...current, ...patch }))} onCustomTasks={(customEnglishTasks) => updateActivity(index, (current) => ({ ...current, customEnglishTasks }))} />
            : <AssignedSubjectActivityCard key={`${activity.subjectId}-${index}`} activity={activity} editable={isEditable} onChange={(patch) => updateActivity(index, (current) => ({ ...current, ...patch }))} onRemove={() => removeActivity(index)} />)}
          {isEditable && <div className="flex gap-2"><Select value={subjectToAdd} onValueChange={setSubjectToAdd}><SelectTrigger className="flex-1"><SelectValue placeholder={availableSubjects.length ? 'Choose an assigned subject' : 'All assigned subjects are added'} /></SelectTrigger><SelectContent>{availableSubjects.map((subject) => <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>)}</SelectContent></Select><Button type="button" variant="outline" onClick={addSubject} disabled={!subjectToAdd}><Plus className="mr-2 h-4 w-4" />Add subject</Button></div>}
        </CardContent></Card>

        <PracticePapersEditor
          papers={papers}
          subjects={activities.map((activity) => ({ id: activity.subjectId, name: activity.subjectDisplayName || activity.subjectName })).filter((subject) => subject.id)}
          paperTypes={paperTypes}
          paperSchools={paperSchools}
          editable={isEditable}
          onChange={setPapers}
          onSave={savePapers}
        />

        <TopicProgressPanel subjects={topicSubjects} editable={isEditable} onToggle={updateTopicProgress} />

        <Card><CardHeader><CardTitle>Daily summary</CardTitle></CardHeader><CardContent><Textarea value={summary} onChange={(event) => setSummary(event.target.value)} readOnly={!isEditable} rows={4} placeholder="Summarize the day" /></CardContent><CardFooter className="justify-end gap-2">
          {isEditable && <Button type="button" variant="outline" onClick={saveDraft}><Save className="mr-2 h-4 w-4" />Save draft</Button>}
          {!isEditing && existingProgressId && !isReadOnly && <Button type="button" variant="outline" onClick={() => { setBackup(payload()); setIsEditing(true); }}><Edit2 className="mr-2 h-4 w-4" />Edit</Button>}
          {isEditing && existingProgressId && <Button type="button" variant="ghost" onClick={() => { if (backup) { setAttendance(backup.attendance); setAttendanceStart(backup.attendanceStart || ''); setAttendanceEnd(backup.attendanceEnd || ''); setSummary(backup.summary || ''); setActivities(ensureEnglishActivity(backup.activities, assignedSubjects)); } setBackup(null); setIsEditing(false); }}><XCircle className="mr-2 h-4 w-4" />Cancel</Button>}
          {isEditable && <Button type="submit" disabled={loading}><CheckCircle2 className="mr-2 h-4 w-4" />{existingProgressId ? 'Update' : 'Publish'}</Button>}
        </CardFooter></Card>
      </form>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="space-y-2"><Label>{label}</Label>{children}</div>;

function TopicRows({ topics, editable, onToggle, depth = 0 }: {
  topics: TopicProgress[];
  editable: boolean;
  onToggle: (topicId: string, condition: 'definitionRecited' | 'chapterExerciseCompleted', value: boolean) => void;
  depth?: number;
}) {
  return <div className="space-y-2">{topics.map((topic) => <div key={topic.id} className="rounded-md border p-3" style={{ marginLeft: depth * 12 }}>
    <p className="font-medium">{topic.name || topic.title || 'Topic'}</p>
    <div className="mt-2 flex flex-wrap gap-2">
      <Button type="button" size="sm" variant={topic.definitionRecited ? 'default' : 'outline'} disabled={!editable} onClick={() => onToggle(topic.id, 'definitionRecited', !topic.definitionRecited)}>Definition recited</Button>
      <Button type="button" size="sm" variant={topic.chapterExerciseCompleted ? 'default' : 'outline'} disabled={!editable} onClick={() => onToggle(topic.id, 'chapterExerciseCompleted', !topic.chapterExerciseCompleted)}>Chapter exercise</Button>
    </div>
    {topic.children?.length ? <div className="mt-2"><TopicRows topics={topic.children} editable={editable} onToggle={onToggle} depth={depth + 1} /></div> : null}
  </div>)}</div>;
}

function TopicProgressPanel({ subjects, editable, onToggle }: {
  subjects: SubjectResponse[];
  editable: boolean;
  onToggle: (topicId: string, condition: 'definitionRecited' | 'chapterExerciseCompleted', value: boolean) => void;
}) {
  const rows = subjects.filter((subject) => (subject.topics || []).length > 0);
  return <Card><CardHeader><CardTitle>Topic progress</CardTitle><CardDescription>Definition-recitation and chapter-exercise status from the student's assigned subject hierarchy.</CardDescription></CardHeader><CardContent className="space-y-3">
    {rows.length === 0 ? <p className="text-sm text-muted-foreground">No topics are configured for this student.</p> : null}
    {rows.map((row) => <details key={row.subject?.id || row.subject?.name} className="rounded-lg border p-4"><summary className="cursor-pointer font-semibold">{row.subject?.name || 'Subject'}</summary><div className="mt-3"><TopicRows topics={row.topics || []} editable={editable} onToggle={onToggle} /></div></details>)}
  </CardContent></Card>;
}

function PracticePapersEditor({ papers, subjects, paperTypes, paperSchools, editable, onChange, onSave }: {
  papers: PracticePaper[];
  subjects: AssignedSubject[];
  paperTypes: NamedOption[];
  paperSchools: NamedOption[];
  editable: boolean;
  onChange: (papers: PracticePaper[]) => void;
  onSave: () => void;
}) {
  const update = (index: number, patch: Partial<PracticePaper>) => onChange(papers.map((paper, paperIndex) => {
    if (paperIndex !== index) return paper;
    if (patch.subjectId) {
      const subject = subjects.find((row) => row.id === patch.subjectId);
      return { ...paper, ...patch, subjectName: subject?.name || paper.subjectName };
    }
    return { ...paper, ...patch };
  }));
  const add = () => {
    const subject = subjects[0];
    if (!subject) return;
    onChange([...papers, {
      subjectId: subject.id,
      subjectName: subject.name,
      typeId: '',
      schoolId: '',
      description: '',
      strengths: '',
      improvements: '',
      score: null,
      total: 100,
    }]);
  };
  return <Card><CardHeader><CardTitle>Practice papers and quizzes</CardTitle><CardDescription>Saved through the same separate paper records used by the WeChat Mini Program.</CardDescription></CardHeader><CardContent className="space-y-4">
    {papers.length === 0 ? <p className="text-sm text-muted-foreground">No practice paper recorded for this date.</p> : null}
    {papers.map((paper, index) => <div key={paper.id || index} className="space-y-3 rounded-lg border p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Subject"><Select value={paper.subjectId} onValueChange={(subjectId) => update(index, { subjectId })} disabled={!editable}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{subjects.map((subject) => <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="Paper type"><Select value={paper.typeId} onValueChange={(typeId) => update(index, { typeId })} disabled={!editable}><SelectTrigger><SelectValue placeholder="Choose type" /></SelectTrigger><SelectContent>{paperTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="School"><Select value={paper.schoolId} onValueChange={(schoolId) => update(index, { schoolId })} disabled={!editable}><SelectTrigger><SelectValue placeholder="Choose school" /></SelectTrigger><SelectContent>{paperSchools.map((school) => <SelectItem key={school.id} value={school.id}>{school.name}</SelectItem>)}</SelectContent></Select></Field>
      </div>
      <Field label="Paper / quiz description"><Input value={paper.description} onChange={(event) => update(index, { description: event.target.value })} readOnly={!editable} /></Field>
      <div className="grid gap-3 md:grid-cols-2"><Field label="Score"><Input type="number" value={paper.score ?? ''} onChange={(event) => update(index, { score: numberValue(event.target.value) })} readOnly={!editable} /></Field><Field label="Total"><Input type="number" value={paper.total ?? ''} onChange={(event) => update(index, { total: numberValue(event.target.value) })} readOnly={!editable} /></Field></div>
      <div className="grid gap-3 md:grid-cols-2"><Field label="What went well"><Textarea value={paper.strengths} onChange={(event) => update(index, { strengths: event.target.value })} readOnly={!editable} /></Field><Field label="Needs improvement"><Textarea value={paper.improvements} onChange={(event) => update(index, { improvements: event.target.value })} readOnly={!editable} /></Field></div>
      {editable ? <Button type="button" variant="ghost" onClick={() => onChange(papers.filter((_, paperIndex) => paperIndex !== index))}><MinusCircle className="mr-2 h-4 w-4" />Remove paper</Button> : null}
    </div>)}
    {editable ? <Button type="button" variant="outline" onClick={add} disabled={subjects.length === 0}><Plus className="mr-2 h-4 w-4" />Add practice paper</Button> : null}
  </CardContent>{editable ? <CardFooter className="justify-end"><Button type="button" onClick={onSave}><Save className="mr-2 h-4 w-4" />Save practice papers</Button></CardFooter> : null}</Card>;
}

function AssignedSubjectActivityCard({ activity, editable, onChange, onRemove }: { activity: DailyActivity; editable: boolean; onChange: (patch: Partial<DailyActivity>) => void; onRemove: () => void }) {
  return <div className="space-y-4 rounded-lg border p-4"><div className="flex items-center justify-between"><h3 className="font-semibold">{activity.subjectDisplayName || activity.subjectName}</h3>{editable && <Button type="button" variant="ghost" size="icon" onClick={onRemove}><MinusCircle className="h-5 w-5 text-destructive" /></Button>}</div><Field label="What the student did *"><Textarea value={activity.taskSummary || ''} onChange={(event) => onChange({ taskSummary: event.target.value, practiceProgress: event.target.value })} readOnly={!editable} /></Field><div className="grid gap-4 md:grid-cols-2"><Field label="What went well *"><Textarea value={activity.strengths || ''} onChange={(event) => onChange({ strengths: event.target.value })} readOnly={!editable} /></Field><Field label="Needs improvement *"><Textarea value={activity.improvements || ''} onChange={(event) => onChange({ improvements: event.target.value })} readOnly={!editable} /></Field></div><Field label="Recitation / notes"><Textarea value={activity.definitionRecitation || ''} onChange={(event) => onChange({ definitionRecitation: event.target.value })} readOnly={!editable} /></Field></div>;
}

function EnglishActivityCard({ activity, editable, configByKey, lossCatalog, onEnglish, onActivity, onCustomTasks }: { activity: DailyActivity; editable: boolean; configByKey: Map<string, EnglishTaskConfig>; lossCatalog: LossCatalog; onEnglish: (updater: (english: EnglishFields) => EnglishFields) => void; onActivity: (patch: Partial<DailyActivity>) => void; onCustomTasks: (tasks: CustomEnglishTask[]) => void }) {
  const english = activity.english!;
  const updateBlock = (key: 'editing' | 'reading' | 'grammar', block: EnglishScoredBlock) => onEnglish((current) => ({ ...current, [key]: block }));
  return <div className="space-y-4 rounded-lg border-2 border-primary/20 p-4"><div><h3 className="font-semibold">{activity.subjectDisplayName || activity.subjectName}</h3><p className="text-sm text-muted-foreground">Default activity · scores use the same V2 fields as WeChat</p></div>
    {(['editing', 'reading', 'grammar'] as const).map((key) => configByKey.get(key)?.enabled === false ? null : <ScoredEnglishSection key={key} title={configByKey.get(key)?.displayName || key[0].toUpperCase() + key.slice(1)} block={english[key]} countKey={key === 'reading' ? 'articleCount' : 'exerciseCount'} countLabel={key === 'reading' ? 'Articles' : 'Exercises'} editable={editable} lossPoints={lossCatalog[key] || []} onChange={(block) => updateBlock(key, block)} />)}
    {configByKey.get('vocab')?.enabled !== false && <details className="rounded-md border p-3"><summary className="cursor-pointer font-medium">{configByKey.get('vocab')?.displayName || 'Vocabulary'}</summary><div className="mt-3 grid grid-cols-2 gap-3"><Field label="Words"><Input type="number" min="0" value={english.vocab.vocabularyWordCount} onChange={(event) => onEnglish((current) => ({ ...current, vocab: { ...current.vocab, vocabularyWordCount: Number(event.target.value) } }))} readOnly={!editable} /></Field><Field label="Sentences"><Input type="number" min="0" value={english.vocab.vocabularySentenceCount} onChange={(event) => onEnglish((current) => ({ ...current, vocab: { ...current.vocab, vocabularySentenceCount: Number(event.target.value) } }))} readOnly={!editable} /></Field></div></details>}
    {configByKey.get('recitation')?.enabled !== false && <details className="rounded-md border p-3"><summary className="cursor-pointer font-medium">{configByKey.get('recitation')?.displayName || 'Recitation'}</summary><Textarea className="mt-3" value={english.recitation.text} onChange={(event) => onEnglish((current) => ({ ...current, recitation: { text: event.target.value } }))} readOnly={!editable} placeholder="Recitation notes" /></details>}
    {configByKey.get('essay')?.enabled !== false && <details className="rounded-md border p-3"><summary className="cursor-pointer font-medium">{configByKey.get('essay')?.displayName || 'Essay'}</summary><div className="mt-3 grid gap-3 md:grid-cols-2"><Field label="Title"><Input value={english.essay.title} onChange={(event) => onEnglish((current) => ({ ...current, essay: { ...current.essay, title: event.target.value } }))} readOnly={!editable} /></Field><label className="flex items-end gap-2 pb-2"><input type="checkbox" checked={english.essay.completed} onChange={(event) => onEnglish((current) => ({ ...current, essay: { ...current.essay, completed: event.target.checked } }))} disabled={!editable} />Completed</label><Field label="Score"><Input type="number" value={english.essay.score ?? ''} onChange={(event) => onEnglish((current) => ({ ...current, essay: { ...current.essay, score: numberValue(event.target.value) } }))} readOnly={!editable} /></Field><Field label="Total"><Input type="number" value={english.essay.totalScore ?? ''} onChange={(event) => onEnglish((current) => ({ ...current, essay: { ...current.essay, totalScore: numberValue(event.target.value) } }))} readOnly={!editable} /></Field></div><Textarea className="mt-3" value={english.essay.text} onChange={(event) => onEnglish((current) => ({ ...current, essay: { ...current.essay, text: event.target.value } }))} readOnly={!editable} placeholder="Problems / comments" /></details>}
    {(activity.customEnglishTasks || []).map((task, taskIndex) => <CustomEnglishTaskCard key={task.taskId || task.key} task={task} editable={editable} onChange={(nextTask) => onCustomTasks((activity.customEnglishTasks || []).map((row, index) => index === taskIndex ? nextTask : row))} />)}
    <Field label="English activity summary"><Textarea value={activity.taskSummary || ''} onChange={(event) => onActivity({ taskSummary: event.target.value })} readOnly={!editable} /></Field>
  </div>;
}

function ScoredEnglishSection({ title, block, countKey, countLabel, editable, lossPoints, onChange }: { title: string; block: EnglishScoredBlock; countKey: 'exerciseCount' | 'articleCount'; countLabel: string; editable: boolean; lossPoints: LossPoint[]; onChange: (block: EnglishScoredBlock) => void }) {
  const count = block[countKey] || 0;
  const imperfect = block.exercises.some((exercise) => exercise.score != null && exercise.totalScore != null && exercise.score < exercise.totalScore);
  const changeCount = (nextCount: number) => {
    const exercises = [...block.exercises];
    while (exercises.length < nextCount) exercises.push(emptyExercise());
    onChange({ ...block, [countKey]: nextCount, exercises: exercises.slice(0, nextCount) });
  };
  const changeExercise = (index: number, patch: Partial<EnglishExercise>) => onChange({ ...block, exercises: block.exercises.map((exercise, exerciseIndex) => exerciseIndex === index ? { ...exercise, ...patch } : exercise) });
  const toggleLossPoint = (id: string) => onChange({ ...block, lossPointIds: block.lossPointIds.includes(id) ? block.lossPointIds.filter((value) => value !== id) : [...block.lossPointIds, id], lossPointLabelsSnapshot: lossPoints.filter((point) => block.lossPointIds.includes(point.id) ? point.id !== id : point.id === id || block.lossPointIds.includes(point.id)).map((point) => point.label) });
  return <details className="rounded-md border p-3" open={count > 0}><summary className="cursor-pointer font-medium">{title}{count ? ` · ${count}` : ''}</summary><div className="mt-3 space-y-3"><Field label={countLabel}><Input type="number" min="0" value={count} onChange={(event) => changeCount(Number(event.target.value))} readOnly={!editable} /></Field>{block.exercises.map((exercise, index) => <div key={index} className="rounded-md bg-muted/60 p-3"><div className="mb-2 text-sm font-medium">{countLabel.slice(0, -1)} {index + 1}</div><div className="grid grid-cols-2 gap-3"><Field label="Score"><Input type="number" value={exercise.score ?? ''} onChange={(event) => changeExercise(index, { score: numberValue(event.target.value) })} readOnly={!editable} /></Field><Field label="Total"><Input type="number" value={exercise.totalScore ?? ''} onChange={(event) => changeExercise(index, { totalScore: numberValue(event.target.value) })} readOnly={!editable} /></Field></div>{exercise.score != null && exercise.totalScore != null && exercise.score < exercise.totalScore && <Textarea className="mt-3" value={exercise.problems} onChange={(event) => changeExercise(index, { problems: event.target.value })} readOnly={!editable} placeholder="Problems for this non-full score *" />}</div>)}{imperfect && <div><Label>Loss points</Label><div className="mt-2 flex flex-wrap gap-2">{lossPoints.map((point) => <Button key={point.id} type="button" size="sm" variant={block.lossPointIds.includes(point.id) ? 'default' : 'outline'} onClick={() => editable && toggleLossPoint(point.id)}>{point.label}</Button>)}</div><Input className="mt-2" value={block.otherLossPointText} onChange={(event) => onChange({ ...block, otherLossPointText: event.target.value })} readOnly={!editable} placeholder="Other loss point" /></div>}</div></details>;
}

function CustomEnglishTaskCard({ task, editable, onChange }: { task: CustomEnglishTask; editable: boolean; onChange: (task: CustomEnglishTask) => void }) {
  const usesCount = task.fieldsUsed.includes('practiceCount');
  const usesScore = task.fieldsUsed.includes('score');
  const changeCount = (count: number) => { const exercises = [...task.exercises]; while (exercises.length < count) exercises.push(emptyExercise()); onChange({ ...task, practiceCount: count, exercises: exercises.slice(0, count), completed: count > 0 }); };
  return <details className="rounded-md border p-3"><summary className="cursor-pointer font-medium">{task.displayName}{task.targetCount ? ` · target ${task.targetCount}` : ''}</summary><div className="mt-3 space-y-3">{usesCount && <Field label="Practices"><Input type="number" min="0" value={task.practiceCount} onChange={(event) => changeCount(Number(event.target.value))} readOnly={!editable} /></Field>}{usesCount ? task.exercises.map((exercise, index) => <div key={index} className="grid gap-3 rounded-md bg-muted/60 p-3 md:grid-cols-2"><Field label={`Exercise ${index + 1} score`}><Input type="number" value={exercise.score ?? ''} onChange={(event) => onChange({ ...task, exercises: task.exercises.map((row, rowIndex) => rowIndex === index ? { ...row, score: numberValue(event.target.value) } : row) })} readOnly={!editable || !usesScore} /></Field><Field label="Total"><Input type="number" value={exercise.totalScore ?? ''} onChange={(event) => onChange({ ...task, exercises: task.exercises.map((row, rowIndex) => rowIndex === index ? { ...row, totalScore: numberValue(event.target.value) } : row) })} readOnly={!editable || !usesScore} /></Field></div>) : usesScore && <div className="grid grid-cols-2 gap-3"><Field label="Score"><Input type="number" value={task.score ?? ''} onChange={(event) => onChange({ ...task, score: numberValue(event.target.value) })} readOnly={!editable} /></Field><Field label="Total"><Input type="number" value={task.maxScore ?? ''} onChange={(event) => onChange({ ...task, maxScore: numberValue(event.target.value) })} readOnly={!editable} /></Field></div>}</div></details>;
}

export default DailyProgressForm;
