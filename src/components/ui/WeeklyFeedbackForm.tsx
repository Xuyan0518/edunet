import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { format, addDays, parse } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';
import { getAuthHeaders } from '@/utils/auth';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import {
  type DailyProgressRecord,
  type WeeklyProgressDay,
  toWeeklyProgressDays,
} from '@/utils/dailyProgressParity';
import {
  buildWeeklyFeedbackWritePayload,
  canonicalWeekStarting,
  describeApiSaveError,
  resolveInitialWeekStarting,
} from '@/utils/weeklyFeedbackParity';

interface WeeklyFeedbackEntry {
  id?: string;
  studentId: string;
  weekStarting: string; // yyyy-MM-dd
  weekEnding: string;   // yyyy-MM-dd
  summary: string;
  strengths: string[];
  areasToImprove: string[];
  teacherNotes: string;
  nextWeekFocus: string;
  updatedAt?: string | null;
}

type WeeklyPaper = {
  id?: string;
  date: string;
  subjectName?: string;
  description?: string;
  typeName?: string;
  schoolName?: string;
  score?: number | string | null;
  total?: number | string | null;
  strengths?: string;
  improvements?: string;
};

function previousSunday(d: Date) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = date.getDay(); // 0=Sun
  date.setDate(date.getDate() - dow);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

const WeeklyDailyProgress: React.FC<{
  days: WeeklyProgressDay[];
  loading: boolean;
  onOpenDay: (date: string) => void;
}> = ({ days, loading, onOpenDay }) => (
  <Card className="hover-card">
    <CardHeader>
      <CardTitle>Daily progress for this week</CardTitle>
      <CardDescription>
        The same day-by-day activity, English score, attendance, and paper data shown in the WeChat Mini Program.
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {loading ? <p className="text-sm text-muted-foreground">Loading daily progress…</p> : null}
      {!loading && days.length === 0 ? (
        <p className="text-sm text-muted-foreground">No daily progress was recorded for this week.</p>
      ) : null}
      {days.map((day) => (
        <div key={day.id || day.date} className="rounded-lg border p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">
                {new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long' })} · {day.date}
              </p>
              {day.isAbsent ? (
                <p className="text-sm text-destructive">Absent{day.absenceReason ? ` — ${day.absenceReason}` : ''}</p>
              ) : day.attendanceStart || day.attendanceEnd ? (
                <p className="text-xs text-muted-foreground">
                  Attendance {day.attendanceStart || '--'} – {day.attendanceEnd || '--'}
                </p>
              ) : null}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenDay(day.date)}>
              Open daily record
            </Button>
          </div>

          {day.activities.map((activity, index) => (
            <div key={`${day.date}-${activity.subjectName}-${index}`} className="rounded-md bg-muted/40 p-3 space-y-2">
              <p className="font-medium">{activity.subjectName}</p>
              {activity.summary ? <p className="text-sm">{activity.summary}</p> : null}
              {activity.sections.map((section, sectionIndex) => (
                <div key={`${section.title}-${sectionIndex}`} className="border-t pt-2 text-sm">
                  <p className="font-medium">{section.title}</p>
                  {section.rows.map((row, rowIndex) => (
                    <p key={`${row.label}-${rowIndex}`} className="text-muted-foreground">
                      {row.label}: {row.scoreText || row.value || '--'}
                      {row.problems ? ` · ${row.problems}` : ''}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          ))}

          {!day.isAbsent && day.summary ? (
            <div className="text-sm"><span className="font-medium">Daily summary:</span> {day.summary}</div>
          ) : null}
        </div>
      ))}
    </CardContent>
  </Card>
);

const WeeklyPracticePapers: React.FC<{ papers: WeeklyPaper[]; loading: boolean; showTeacherDetails: boolean }> = ({ papers, loading, showTeacherDetails }) => {
  const groups = Object.entries(papers.reduce<Record<string, WeeklyPaper[]>>((result, paper) => {
    const key = paper.subjectName || 'Unassigned subject';
    (result[key] ||= []).push(paper);
    return result;
  }, {}));
  return <Card className="hover-card"><CardHeader><CardTitle>Practice papers and quizzes this week</CardTitle><CardDescription>Loaded from the same paper records as the WeChat Mini Program.</CardDescription></CardHeader><CardContent className="space-y-4">
    {loading ? <p className="text-sm text-muted-foreground">Loading practice papers…</p> : null}
    {!loading && papers.length === 0 ? <p className="text-sm text-muted-foreground">No practice papers were recorded for this week.</p> : null}
    {groups.map(([subjectName, rows]) => <div key={subjectName} className="rounded-lg border p-4"><p className="mb-2 font-semibold">{subjectName} · {rows.length}</p>{rows.map((paper, index) => <div key={paper.id || index} className="border-t py-2 text-sm first:border-t-0">
      <p>{paper.date} · {paper.description || 'Practice paper'} · {paper.score ?? '--'}/{paper.total ?? '--'}</p>
      {showTeacherDetails && (paper.typeName || paper.schoolName) ? <p className="text-muted-foreground">{paper.typeName || '--'} · {paper.schoolName || '--'}</p> : null}
      {showTeacherDetails && paper.strengths ? <p className="text-muted-foreground">What went well: {paper.strengths}</p> : null}
      {showTeacherDetails && paper.improvements ? <p className="text-muted-foreground">Needs improvement: {paper.improvements}</p> : null}
    </div>)}</div>)}
  </CardContent></Card>;
};

const WeeklyFeedbackForm: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // URL param: only student (optional)
  const [searchParams, setSearchParams] = useSearchParams();
  const studentIdFromUrl = searchParams.get('student') || '';
  const weekStartingFromUrl = searchParams.get('weekStarting') || '';

  // Students list
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string>(studentIdFromUrl || '');

  // Week selection follows the Mini Program's full Sunday-to-Saturday range.
  const defaultStart = useMemo(() => previousSunday(new Date()), []);
  const [weekStarting, setWeekStarting] = useState<Date | undefined>(() => {
    const initial = resolveInitialWeekStarting(weekStartingFromUrl, format(defaultStart, 'yyyy-MM-dd'));
    return parse(initial, 'yyyy-MM-dd', new Date());
  });
  const weekEnding = useMemo(() => (weekStarting ? addDays(weekStarting, 6) : undefined), [weekStarting]);
  const [dailyProgress, setDailyProgress] = useState<DailyProgressRecord[]>([]);
  const [progressLoading, setProgressLoading] = useState(false);
  const [weeklyPapers, setWeeklyPapers] = useState<WeeklyPaper[]>([]);
  const [weeklyPapersLoading, setWeeklyPapersLoading] = useState(false);
  const weeklyProgressDays = useMemo(
    () => weekStarting && weekEnding
      ? toWeeklyProgressDays(dailyProgress, format(weekStarting, 'yyyy-MM-dd'), format(weekEnding, 'yyyy-MM-dd'))
      : [],
    [dailyProgress, weekStarting, weekEnding]
  );

  // Form state
  const [summary, setSummary] = useState<string>('');
  const [strengths, setStrengths] = useState<string[]>(['']);
  const [areasToImprove, setAreasToImprove] = useState<string[]>(['']);
  const [teacherNotes, setTeacherNotes] = useState<string>('');
  const [nextWeekFocus, setNextWeekFocus] = useState<string>('');

  // View/edit flow
  const [existingId, setExistingId] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [backup, setBackup] = useState<WeeklyFeedbackEntry | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [aiLoading, setAiLoading] = useState(false);

  const didLoadStudentsRef = useRef(false);
  const didSyncWeekRef = useRef(false);

  const { role } = useAuth();
  const { t, language } = useI18n();
  const isReadOnly = role !== 'teacher' && role !== 'admin';
  const isEditable = isEditing && !isReadOnly;
  const locale = language === 'zh-CN' ? zhCN : enUS;

  // Helpers
  const resetForm = () => {
    setSummary('');
    setStrengths(['']);
    setAreasToImprove(['']);
    setTeacherNotes('');
    setNextWeekFocus('');
  };

  const safeSetWeekStarting = (d?: Date) => {
    if (!d) return;
    if (!weekStarting || d.getTime() !== weekStarting.getTime()) setWeekStarting(d);
  };

  const formatDisplayDate = (date: Date) =>
    date.toLocaleDateString(language === 'zh-CN' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  // Load students (once)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(buildApiUrl('students'), {
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error('Network response was not ok');
        const data: Array<{ id: string; name: string }> = await res.json();
        if (cancelled) return;
        setStudents(data);

        // If URL had ?student=, set only if valid; else leave blank
        if (studentIdFromUrl) {
          if (data.some((s) => s.id === studentIdFromUrl) && selectedStudent !== studentIdFromUrl) {
            setSelectedStudent(studentIdFromUrl);
          } else if (!data.some((s) => s.id === studentIdFromUrl) && selectedStudent !== '') {
            setSelectedStudent('');
          }
        }
      } catch (err) {
        console.error('Error fetching students:', err);
        toast({ title: t('toast.title.error'), description: t('weeklyFeedback.toast.fetchStudents'), variant: 'destructive' });
      } finally {
        didLoadStudentsRef.current = true;
      }
    })();
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

  // Single guarded URL-sync effect — only for ?student=
  useEffect(() => {
    if (!didLoadStudentsRef.current) return;

    const currentStudent = searchParams.get('student') || '';
    const desiredStudent = selectedStudent || '';

    let changed = false;
    const next = new URLSearchParams(searchParams);

    if (desiredStudent) {
      if (currentStudent !== desiredStudent) {
        next.set('student', desiredStudent);
        changed = true;
      }
    } else if (currentStudent) {
      next.delete('student');
      changed = true;
    }

    if (changed) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent]);

  useEffect(() => {
    if (!weekStarting) return;
    const desired = format(weekStarting, 'yyyy-MM-dd');
    const current = searchParams.get('weekStarting') || '';
    if (current === desired) return;
    const next = new URLSearchParams(searchParams);
    next.set('weekStarting', desired);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStarting]);

  useEffect(() => {
    if (!weekStartingFromUrl) return;
    const canonical = canonicalWeekStarting(weekStartingFromUrl);
    if (!canonical) return;
    const parsedDate = parse(canonical, 'yyyy-MM-dd', new Date());
    if (!didSyncWeekRef.current || (weekStarting && format(weekStarting, 'yyyy-MM-dd') !== canonical)) {
      if (!weekStarting || parsedDate.getTime() !== weekStarting.getTime()) setWeekStarting(parsedDate);
      didSyncWeekRef.current = true;
    }
  }, [weekStartingFromUrl, weekStarting]);

  // Fetch existing weekly feedback when student or week changes
  useEffect(() => {
    if (!selectedStudent || !weekStarting) {
      setExistingId(null);
      setLastUpdatedAt('');
      setIsEditing(false);
      resetForm();
      return;
    }

    const ac = new AbortController();
    (async () => {
      setIsLoading(true);
      try {
        const startStr = format(weekStarting, 'yyyy-MM-dd');
        const url = `${buildApiUrl('feedback/one')}?studentId=${encodeURIComponent(
          selectedStudent
        )}&weekStarting=${encodeURIComponent(startStr)}`;
        const res = await fetch(url, { 
          signal: ac.signal,
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error('Failed to fetch weekly feedback');
        const data: WeeklyFeedbackEntry | null = await res.json();

        if (ac.signal.aborted) return;

        if (data) {
          setExistingId(data.id || null);
          setLastUpdatedAt(data.updatedAt || '');
          setSummary(data.summary ?? '');
          setStrengths(Array.isArray(data.strengths) && data.strengths.length ? data.strengths : ['']);
          setAreasToImprove(
            Array.isArray(data.areasToImprove) && data.areasToImprove.length ? data.areasToImprove : ['']
          );
          setTeacherNotes(data.teacherNotes ?? '');
          setNextWeekFocus(data.nextWeekFocus ?? '');
          setIsEditing(false);
        } else {
          setExistingId(null);
          setLastUpdatedAt('');
          setIsEditing(!isReadOnly);
          resetForm();
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') return;
        console.error(e);
        toast({ title: t('toast.title.error'), description: t('weeklyFeedback.toast.fetchEntry'), variant: 'destructive' });
        setExistingId(null);
        setLastUpdatedAt('');
        setIsEditing(!isReadOnly);
        resetForm();
      } finally {
        if (!ac.signal.aborted) setIsLoading(false);
      }
    })();

    return () => ac.abort();
    // Only re-run on actual triggers; do NOT include toast/searchParams/etc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent, weekStarting]);

  useEffect(() => {
    if (!selectedStudent || !weekStarting || !weekEnding) {
      setDailyProgress([]);
      return;
    }

    const ac = new AbortController();
    (async () => {
      setProgressLoading(true);
      try {
        const startDate = format(weekStarting, 'yyyy-MM-dd');
        const endDate = format(weekEnding, 'yyyy-MM-dd');
        const res = await fetch(
          buildApiUrl(`progress/list?studentId=${encodeURIComponent(selectedStudent)}&startDate=${startDate}&endDate=${endDate}`),
          { signal: ac.signal, headers: getAuthHeaders() }
        );
        if (!res.ok) throw new Error('Failed to fetch daily progress for weekly feedback');
        const body = await res.json();
        if (!ac.signal.aborted) setDailyProgress(Array.isArray(body) ? body : Array.isArray(body?.entries) ? body.entries : []);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('Error fetching weekly daily progress:', error);
        if (!ac.signal.aborted) {
          setDailyProgress([]);
          toast({
            title: t('toast.title.error'),
            description: 'Daily progress for this week could not be loaded.',
            variant: 'destructive',
          });
        }
      } finally {
        if (!ac.signal.aborted) setProgressLoading(false);
      }
    })();
    return () => ac.abort();
  }, [selectedStudent, weekStarting, weekEnding, toast, t]);

  useEffect(() => {
    if (!selectedStudent || !weekStarting || !weekEnding) {
      setWeeklyPapers([]);
      return;
    }
    const ac = new AbortController();
    setWeeklyPapersLoading(true);
    const startDate = format(weekStarting, 'yyyy-MM-dd');
    const endDate = format(weekEnding, 'yyyy-MM-dd');
    fetch(buildApiUrl(`students/${selectedStudent}/papers?startDate=${startDate}&endDate=${endDate}`), {
      signal: ac.signal,
      headers: getAuthHeaders(),
    }).then(async (response) => {
      if (!response.ok) throw new Error('Failed to fetch weekly practice papers');
      const rows = await response.json();
      setWeeklyPapers((Array.isArray(rows) ? rows : []).filter((paper: WeeklyPaper) => paper.date >= startDate && paper.date <= endDate));
    }).catch((error) => {
      if (error instanceof Error && error.name === 'AbortError') return;
      setWeeklyPapers([]);
      toast({ title: t('toast.title.error'), description: 'Practice papers for this week could not be loaded.', variant: 'destructive' });
    }).finally(() => { if (!ac.signal.aborted) setWeeklyPapersLoading(false); });
    return () => ac.abort();
  }, [selectedStudent, weekStarting, weekEnding, toast, t]);

  // List field handlers (respect view/edit)
  const handleAddStrength = () => isEditable && setStrengths((s) => [...s, '']);
  const handleRemoveStrength = (i: number) => {
    if (!isEditable) return;
    setStrengths((s) => (s.length <= 1 ? s : s.filter((_, idx) => idx !== i)));
  };
  const handleStrengthChange = (i: number, v: string) => {
    if (!isEditable) return;
    setStrengths((s) => s.map((x, idx) => (idx === i ? v : x)));
  };

  const handleAddAreaToImprove = () => isEditable && setAreasToImprove((a) => [...a, '']);
  const handleRemoveAreaToImprove = (i: number) => {
    if (!isEditable) return;
    setAreasToImprove((a) => (a.length <= 1 ? a : a.filter((_, idx) => idx !== i)));
  };
  const handleAreaToImproveChange = (i: number, v: string) => {
    if (!isEditable) return;
    setAreasToImprove((a) => a.map((x, idx) => (idx === i ? v : x)));
  };

  const handleWeekSelect = (date: Date | undefined) => {
    if (date && date.getDay() === 0) safeSetWeekStarting(date);
  };

  const generateSummary = async () => {
    if (!isEditable || !selectedStudent || !weekStarting || !weekEnding) return;
    setAiLoading(true);
    try {
      const response = await fetch(buildApiUrl('ai/weekly-summary'), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          studentId: selectedStudent,
          weekStarting: format(weekStarting, 'yyyy-MM-dd'),
          weekEnding: format(weekEnding, 'yyyy-MM-dd'),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error === 'AI_NOT_CONFIGURED' ? 'AI is not configured.' : result?.message || result?.error || 'Unable to generate summary');
      setSummary(result?.summary || '');
      toast({ title: 'Weekly summary generated' });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : 'Unable to generate summary', variant: 'destructive' });
    } finally {
      setAiLoading(false);
    }
  };

  // Validation
  const validate = () => {
    if (!selectedStudent) {
      toast({ title: t('toast.title.error'), description: t('weeklyFeedback.toast.selectStudent'), variant: 'destructive' });
      return false;
    }
    if (!weekStarting || !weekEnding) {
      toast({ title: t('toast.title.error'), description: t('weeklyFeedback.toast.selectWeek'), variant: 'destructive' });
      return false;
    }
    if (!summary.trim()) {
      toast({ title: t('toast.title.error'), description: t('weeklyFeedback.toast.provideSummary'), variant: 'destructive' });
      return false;
    }
    if (strengths.some((s) => !s.trim()) || areasToImprove.some((a) => !a.trim())) {
      toast({
        title: t('toast.title.error'),
        description: t('weeklyFeedback.toast.fillStrengths'),
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  // Submit (create or update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const payload = buildWeeklyFeedbackWritePayload({
      studentId: selectedStudent,
      weekStarting: format(weekStarting!, 'yyyy-MM-dd'),
      weekEnding: format(weekEnding!, 'yyyy-MM-dd'),
      summary: summary.trim(),
      strengths: strengths.map((s) => s.trim()),
      areasToImprove: areasToImprove.map((a) => a.trim()),
      teacherNotes: teacherNotes.trim(),
      nextWeekFocus: nextWeekFocus.trim(),
    }, existingId ? lastUpdatedAt : undefined);

    try {
      let res: Response;
      if (existingId && isEditing) {
        res = await fetch(buildApiUrl(`feedback/${existingId}`), {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
      } else if (!existingId) {
        res = await fetch(buildApiUrl('feedback'), {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
      } else {
        toast({ title: t('toast.title.info'), description: t('weeklyFeedback.toast.noChanges'), variant: 'default' });
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(describeApiSaveError(errorData, res.status));
      }

      const saved = await res.json();
      setExistingId(saved.id ?? existingId);
      setLastUpdatedAt(saved.updatedAt || lastUpdatedAt);
      setIsEditing(false);
      setBackup(null);

      toast({
        title: t('toast.title.success'),
        description: t('weeklyFeedback.toast.saved', {
          action: existingId
            ? t('weeklyFeedback.toast.action.updated')
            : t('weeklyFeedback.toast.action.created'),
        }),
      });
    } catch (err: unknown) {
      console.error('Error saving weekly feedback:', err);
      toast({
        title: t('toast.title.error'),
        description: err instanceof Error ? err.message : t('weeklyFeedback.toast.saveFailed'),
        variant: 'destructive',
      });
    }
  };

  // UI
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
      </div>
      
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{t('weeklyFeedbackForm.title')}</h1>
        <p className="text-muted-foreground mt-1">
          {existingId
            ? isEditing
              ? t('weeklyFeedbackForm.subtitle.editing')
              : isReadOnly
              ? t('weeklyFeedbackForm.subtitle.viewOnly')
              : t('weeklyFeedbackForm.subtitle.viewing')
            : isReadOnly
            ? t('weeklyFeedbackForm.subtitle.none')
            : t('weeklyFeedbackForm.subtitle.new')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <Card className="hover-card">
          <CardHeader>
            <CardTitle>{t('weeklyFeedbackForm.studentWeek.title')}</CardTitle>
            <CardDescription>{t('weeklyFeedbackForm.studentWeek.desc')}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="student">{t('weeklyFeedbackForm.student.label')}</Label>
              <Select
                value={selectedStudent}
                onValueChange={(val) => {
                  if (val !== selectedStudent) setSelectedStudent(val);
                }}
                disabled={isLoading}
              >
                <SelectTrigger id="student" className="focus-within-ring">
                  <SelectValue placeholder={t('weeklyFeedbackForm.student.placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('weeklyFeedbackForm.week.label')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal focus-within-ring"
                    disabled={isLoading}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {weekStarting ? (
                      <>
                        {formatDisplayDate(weekStarting)} {'->'}{' '}
                        {weekEnding ? formatDisplayDate(weekEnding) : t('weeklyFeedbackForm.week.endPlaceholder')}
                      </>
                    ) : (
                      <span>{t('weeklyFeedbackForm.week.pick')}</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={weekStarting}
                    onSelect={handleWeekSelect}
                    disabled={(date) => date.getDay() !== 0}
                    initialFocus
                    locale={locale}
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                {t('weeklyFeedbackForm.week.note')}
              </p>
            </div>
          </CardContent>
        </Card>

        <WeeklyDailyProgress
          days={weeklyProgressDays}
          loading={progressLoading}
          onOpenDay={(date) => navigate(`/daily-progress?tab=form&student=${encodeURIComponent(selectedStudent)}&date=${date}`)}
        />

        <WeeklyPracticePapers
          papers={weeklyPapers}
          loading={weeklyPapersLoading}
          showTeacherDetails={!isReadOnly}
        />

        <Card className="hover-card">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><CardTitle>{t('weeklyFeedbackForm.summary.title')}</CardTitle><CardDescription>{t('weeklyFeedbackForm.summary.desc')}</CardDescription></div>
              {isEditable ? <Button type="button" variant="outline" onClick={generateSummary} disabled={aiLoading || progressLoading}>{aiLoading ? 'Generating…' : 'Generate from daily progress'}</Button> : null}
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              value={summary}
              onChange={(e) => isEditable && setSummary(e.target.value)}
              placeholder={t('weeklyFeedbackForm.summary.placeholder')}
              className="min-h-[120px] focus-within-ring"
              readOnly={!isEditable}
            />
          </CardContent>
        </Card>

        <Card className="hover-card">
          <CardHeader>
            <CardTitle>{t('weeklyFeedbackForm.strengths.title')}</CardTitle>
            <CardDescription>{t('weeklyFeedbackForm.strengths.desc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {strengths.map((strength, index) => (
              <div key={index} className="flex items-center space-x-2">
                <Input
                  value={strength}
                  onChange={(e) => handleStrengthChange(index, e.target.value)}
                  placeholder={t('weeklyFeedbackForm.strengths.placeholder', { n: index + 1 })}
                  className="focus-within-ring"
                  readOnly={!isEditable}
                />
                {isEditable && index > 0 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveStrength(index)}>
                    <MinusCircle className="h-5 w-5 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
            {isEditable && (
              <Button type="button" variant="outline" onClick={handleAddStrength} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                {t('weeklyFeedbackForm.strengths.add')}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="hover-card">
          <CardHeader>
            <CardTitle>{t('weeklyFeedbackForm.areas.title')}</CardTitle>
            <CardDescription>{t('weeklyFeedbackForm.areas.desc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {areasToImprove.map((area, index) => (
              <div key={index} className="flex items-center space-x-2">
                <Input
                  value={area}
                  onChange={(e) => handleAreaToImproveChange(index, e.target.value)}
                  placeholder={t('weeklyFeedbackForm.areas.placeholder', { n: index + 1 })}
                  className="focus-within-ring"
                  readOnly={!isEditable}
                />
                {isEditable && index > 0 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveAreaToImprove(index)}>
                    <MinusCircle className="h-5 w-5 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
            {isEditable && (
              <Button type="button" variant="outline" onClick={handleAddAreaToImprove} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                {t('weeklyFeedbackForm.areas.add')}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="hover-card">
          <CardHeader>
            <CardTitle>{t('weeklyFeedbackForm.additional.title')}</CardTitle>
            <CardDescription>{t('weeklyFeedbackForm.additional.desc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="teacher-notes">{t('weeklyFeedbackForm.teacherNotes.label')}</Label>
              <Textarea
                id="teacher-notes"
                value={teacherNotes}
                onChange={(e) => isEditable && setTeacherNotes(e.target.value)}
                placeholder={t('weeklyFeedbackForm.teacherNotes.placeholder')}
                className="min-h-[100px] focus-within-ring"
                readOnly={!isEditable}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="next-week">{t('weeklyFeedbackForm.nextWeek.label')}</Label>
              <Textarea
                id="next-week"
                value={nextWeekFocus}
                onChange={(e) => isEditable && setNextWeekFocus(e.target.value)}
                placeholder={t('weeklyFeedbackForm.nextWeek.placeholder')}
                className="min-h-[100px] focus-within-ring"
                readOnly={!isEditable}
              />
            </div>
          </CardContent>

          <CardFooter className="flex justify-end gap-2">
            {/* View mode: Edit */}
            {!isEditing && existingId && !isReadOnly && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBackup({
                    id: existingId || undefined,
                    studentId: selectedStudent,
                    weekStarting: format(weekStarting!, 'yyyy-MM-dd'),
                    weekEnding: format(weekEnding!, 'yyyy-MM-dd'),
                    summary,
                    strengths: [...strengths],
                    areasToImprove: [...areasToImprove],
                    teacherNotes,
                    nextWeekFocus,
                  });
                  setIsEditing(true);
                }}
              >
                <Edit2 size={16} className="mr-2" />
                {t('weeklyFeedbackForm.edit')}
              </Button>
            )}

            {/* Edit mode on existing: Cancel + Update */}
            {isEditing && existingId && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => {
                    if (backup) {
                      setSummary(backup.summary);
                      setStrengths(backup.strengths);
                      setAreasToImprove(backup.areasToImprove);
                      setTeacherNotes(backup.teacherNotes);
                      setNextWeekFocus(backup.nextWeekFocus);
                      const restored = parse(backup.weekStarting, 'yyyy-MM-dd', new Date());
                      safeSetWeekStarting(restored);
                      setExistingId(backup.id || null);
                    }
                    setBackup(null);
                    setIsEditing(false);
                  }}
                >
                  <XCircle size={16} className="mr-2" />
                  {t('weeklyFeedbackForm.cancelEdit')}
                </Button>
                {!isReadOnly && (
                  <Button type="submit" disabled={isLoading}>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    {t('weeklyFeedbackForm.update')}
                  </Button>
                )}
              </>
            )}

            {/* New record: Save */}
            {!existingId && isEditing && !isReadOnly && (
              <Button type="submit" disabled={isLoading}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {t('weeklyFeedbackForm.save')}
              </Button>
            )}
          </CardFooter>
        </Card>
      </form>
    </div>
  );
};

export default WeeklyFeedbackForm;








// const ViewWeeklyFeedback: React.FC = () => {
//   // Group weekly feedback by student
//   const feedbackByStudent: Record<string, type> = {};
  
//   weeklyFeedback.forEach(feedback => {
//     if (!feedbackByStudent[feedback.studentId]) {
//       feedbackByStudent[feedback.studentId] = [];
//     }
//     feedbackByStudent[feedback.studentId].push(feedback);
//   });
  
//   return (
//     <div className="container mx-auto py-8 px-4 animate-fade-in">
//       <div className="mb-8">
//         <h1 className="text-3xl font-bold tracking-tight">View Weekly Feedback</h1>
//         <p className="text-muted-foreground mt-1">Review past weekly feedback for your students</p>
//       </div>
      
//       <Tabs defaultValue={Object.keys(feedbackByStudent)[0]} className="space-y-8">
//         <TabsList className="flex flex-wrap space-x-2 space-y-2">
//           {Object.keys(feedbackByStudent).map(studentId => {
//             const student = students.find(s => s.id === studentId);
//             return (
//               <TabsTrigger key={studentId} value={studentId} className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
//                 {student?.name}
//               </TabsTrigger>
//             );
//           })}
//         </TabsList>
        
//         {Object.entries(feedbackByStudent).map(([studentId, entries]) => {
//           const student = students.find(s => s.id === studentId);
          
//           return (
//             <TabsContent key={studentId} value={studentId} className="space-y-6">
//               <Card>
//                 <CardHeader>
//                   <div className="flex justify-between items-center">
//                     <CardTitle>{student?.name}</CardTitle>
//                     <Badge variant="outline">
//                       {entries.length} Reports
//                     </Badge>
//                   </div>
//                   <CardDescription>{student?.grade} • Age {student?.age}</CardDescription>
//                 </CardHeader>
//                 <CardContent>
//                   <div className="space-y-6">
//                     {entries.sort((a, b) => new Date(b.weekStarting).getTime() - new Date(a.weekStarting).getTime()).map(feedback => (
//                       <Card key={feedback.id} className="hover-card">
//                         <CardContent className="p-6">
//                           <div className="flex justify-between items-center mb-4">
//                             <h3 className="text-lg font-semibold">Week of {formatDateRange(feedback.weekStarting, feedback.weekEnding)}</h3>
//                           </div>
                          
//                           <div className="space-y-6">
//                             <div>
//                               <h4 className="font-medium text-sm mb-2">Weekly Summary</h4>
//                               <p className="text-sm">{feedback.summary}</p>
//                             </div>
                            
//                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                               <div>
//                                 <h4 className="font-medium text-sm mb-2">Strengths</h4>
//                                 <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
//                                   {feedback.strengths.map((strength, index) => (
//                                     <li key={index}>{strength}</li>
//                                   ))}
//                                 </ul>
//                               </div>
                              
//                               <div>
//                                 <h4 className="font-medium text-sm mb-2">Areas to Improve</h4>
//                                 <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
//                                   {feedback.areasToImprove.map((area, index) => (
//                                     <li key={index}>{area}</li>
//                                   ))}
//                                 </ul>
//                               </div>
//                             </div>
                            
//                             <div>
//                               <h4 className="font-medium text-sm mb-2">Weekly Tasks Summary</h4>
//                               <p className="text-sm text-muted-foreground">{feedback.weeklyTasksSummary}</p>
//                             </div>
                            
//                             <div>
//                               <h4 className="font-medium text-sm mb-2">Teacher Notes</h4>
//                               <p className="text-sm text-muted-foreground">{feedback.teacherNotes}</p>
//                             </div>
                            
//                             <div className="bg-secondary/50 p-4 rounded-md">
//                               <h4 className="font-medium text-sm mb-2">Next Week's Focus</h4>
//                               <p className="text-sm">{feedback.nextWeekFocus}</p>
//                             </div>
//                           </div>
//                         </CardContent>
//                       </Card>
//                     ))}
//                   </div>
//                 </CardContent>
//               </Card>
//             </TabsContent>
//           );
//         })}
//       </Tabs>
//     </div>
//   );
// };

// // Helper function to format date range
// const formatDateRange = (start: string, end: string): string => {
//   const startDate = new Date(start);
//   const endDate = new Date(end);
  
//   return `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
// };

// const WeeklyFeedback: React.FC = () => {
//   const [activeTab, setActiveTab] = useState<'create' | 'view'>('create');
//   const { role } = useAuth();
  
//   if (role !== 'teacher') {
//     return (
//       <div className="min-h-screen flex items-center justify-center">
//         <p>Unauthorized access. Only teachers can view this page.</p>
//       </div>
//     );
//   }
  
//   return (
//     <div className="container mx-auto py-8 px-4 animate-fade-in">
//       <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'create' | 'view')} className="space-y-8">
//         <div className="flex justify-between items-center">
//           <h1 className="text-3xl font-bold tracking-tight">Weekly Feedback</h1>
//           <TabsList>
//             <TabsTrigger value="create" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
//               Create New
//             </TabsTrigger>
//             <TabsTrigger value="view" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
//               View Reports
//             </TabsTrigger>
//           </TabsList>
//         </div>
        
//         <TabsContent value="create">
//           <CreateWeeklyFeedback />
//         </TabsContent>
        
//         <TabsContent value="view">
//           <ViewWeeklyFeedback />
//         </TabsContent>
//       </Tabs>
//     </div>
//   );
// };
