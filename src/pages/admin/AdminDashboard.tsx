import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  Check,
  ClipboardList,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { buildApiUrl } from '@/config/api';

type AccessUser = {
  id: string;
  name: string;
  email?: string | null;
  role?: string;
};

type DailyProgressRecord = {
  id: string;
  studentId: string;
  date: string;
  attendance: string;
  attendanceStart?: string | null;
  attendanceEnd?: string | null;
  summary?: string | null;
  activities: unknown[];
  updatedAt?: string | null;
  updatedByName?: string | null;
};

type WeeklyFeedbackRecord = {
  id: string;
  studentId: string;
  weekStarting: string;
  weekEnding: string;
  summary: string;
  strengths: string[];
  areasToImprove: string[];
  teacherNotes?: string | null;
  nextWeekFocus?: string | null;
  updatedAt?: string | null;
  updatedByName?: string | null;
};

type QuarterlySummaryRecord = {
  id: string;
  studentId: string;
  year: number;
  quarter: number;
  summary: string;
  startDate?: string | null;
  endDate?: string | null;
  updatedAt?: string | null;
  updatedByName?: string | null;
};

type YearlySummaryRecord = {
  id: string;
  studentId: string;
  year: number;
  summary: string;
  updatedAt?: string | null;
  updatedByName?: string | null;
};

type StudentReportRecord = {
  id: string;
  studentId: string;
  reportType: 'quarterly' | 'yearly' | string;
  title?: string | null;
  startDate: string;
  endDate: string;
  year?: number | null;
  summaryText: string;
  status: string;
  visibleToParent: boolean;
  updatedAt?: string | null;
};

type ManagedStudent = {
  id: string;
  name: string;
  grade: string;
  parentId?: string | null;
  parent?: AccessUser | null;
  dailyProgress: DailyProgressRecord[];
  weeklyFeedback: WeeklyFeedbackRecord[];
  quarterlySummaries: QuarterlySummaryRecord[];
  yearlySummaries: YearlySummaryRecord[];
  reports: StudentReportRecord[];
  stats: {
    dailyCount: number;
    weeklyCount: number;
    quarterlyCount: number;
    yearlyCount: number;
    reportCount: number;
    latestDailyDate?: string | null;
    latestWeeklyStart?: string | null;
    latestReportTitle?: string | null;
    missingDailyToday: boolean;
    missingCurrentWeekly: boolean;
  };
};

type AdminPayload = {
  generatedAt: string;
  today: string;
  currentYear: number;
  currentCycle: { startDate: string; endDate: string; notes?: string | null };
  metrics: Record<string, number>;
  access: {
    parents: AccessUser[];
    teachers: AccessUser[];
    pendingParents: AccessUser[];
    pendingTeachers: AccessUser[];
  };
  students: ManagedStudent[];
};

type EditableDaily = Pick<
  DailyProgressRecord,
  'id' | 'studentId' | 'date' | 'attendance' | 'attendanceStart' | 'attendanceEnd' | 'summary' | 'activities' | 'updatedAt'
>;

type EditableWeekly = Pick<
  WeeklyFeedbackRecord,
  | 'id'
  | 'studentId'
  | 'weekStarting'
  | 'weekEnding'
  | 'summary'
  | 'strengths'
  | 'areasToImprove'
  | 'teacherNotes'
  | 'nextWeekFocus'
  | 'updatedAt'
>;

const getAdminHeaders = (): HeadersInit => {
  const token = localStorage.getItem('edunet-token') || localStorage.getItem('adminToken');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const shortDate = (value?: string | null) => (value ? String(value).slice(0, 10) : 'No record');

const csvEscape = (value: unknown) => {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const downloadCsv = (filename: string, rows: Array<Record<string, unknown>>) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const toLines = (items?: string[]) => (items || []).join('\n');
const fromLines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);

const AdminDashboard: React.FC = () => {
  const [data, setData] = useState<AdminPayload | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [query, setQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [studentForm, setStudentForm] = useState({ name: '', grade: '', parentId: '' });
  const [dailyForm, setDailyForm] = useState<EditableDaily | null>(null);
  const [dailyActivitiesText, setDailyActivitiesText] = useState('[]');
  const [weeklyForm, setWeeklyForm] = useState<EditableWeekly | null>(null);
  const [termForm, setTermForm] = useState({ year: '', quarter: '1', summary: '', startDate: '', endDate: '', updatedAt: '' });
  const [yearForm, setYearForm] = useState({ year: '', summary: '', updatedAt: '' });
  const { toast } = useToast();

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl('admin/student-management'), {
        headers: getAdminHeaders(),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Failed to load admin dashboard');
      setData(payload);
      setSelectedId((current) => current || payload.students?.[0]?.id || '');
    } catch (error) {
      toast({
        title: 'Failed to load admin data',
        description: error instanceof Error ? error.message : 'Please sign in as an admin again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const grades = useMemo(() => {
    const allGrades = new Set((data?.students || []).map((student) => student.grade).filter(Boolean));
    return Array.from(allGrades).sort();
  }, [data]);

  const filteredStudents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.students || []).filter((student) => {
      const matchesQuery = !normalized || [student.name, student.grade, student.parent?.name, student.parent?.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
      const matchesGrade = gradeFilter === 'all' || student.grade === gradeFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'missingDaily' && student.stats.missingDailyToday) ||
        (statusFilter === 'missingWeekly' && student.stats.missingCurrentWeekly) ||
        (statusFilter === 'noParent' && !student.parentId);
      return matchesQuery && matchesGrade && matchesStatus;
    });
  }, [data, gradeFilter, query, statusFilter]);

  const selectedStudent = useMemo(
    () => (data?.students || []).find((student) => student.id === selectedId) || filteredStudents[0] || null,
    [data, filteredStudents, selectedId],
  );

  useEffect(() => {
    if (!selectedStudent) return;
    setStudentForm({
      name: selectedStudent.name,
      grade: selectedStudent.grade,
      parentId: selectedStudent.parentId || '',
    });
    const latestDaily = selectedStudent.dailyProgress[0];
    setDailyForm(latestDaily ? {
      id: latestDaily.id,
      studentId: latestDaily.studentId,
      date: shortDate(latestDaily.date),
      attendance: latestDaily.attendance,
      attendanceStart: latestDaily.attendanceStart || '',
      attendanceEnd: latestDaily.attendanceEnd || '',
      summary: latestDaily.summary || '',
      activities: latestDaily.activities || [],
      updatedAt: latestDaily.updatedAt || '',
    } : null);
    setDailyActivitiesText(JSON.stringify(latestDaily?.activities || [], null, 2));
    const latestWeekly = selectedStudent.weeklyFeedback[0];
    setWeeklyForm(latestWeekly ? {
      id: latestWeekly.id,
      studentId: latestWeekly.studentId,
      weekStarting: shortDate(latestWeekly.weekStarting),
      weekEnding: shortDate(latestWeekly.weekEnding),
      summary: latestWeekly.summary || '',
      strengths: latestWeekly.strengths || [],
      areasToImprove: latestWeekly.areasToImprove || [],
      teacherNotes: latestWeekly.teacherNotes || '',
      nextWeekFocus: latestWeekly.nextWeekFocus || '',
      updatedAt: latestWeekly.updatedAt || '',
    } : null);
    const latestTerm = selectedStudent.quarterlySummaries[0];
    setTermForm({
      year: String(latestTerm?.year || data?.currentYear || new Date().getFullYear()),
      quarter: String(latestTerm?.quarter || 1),
      summary: latestTerm?.summary || '',
      startDate: shortDate(latestTerm?.startDate || ''),
      endDate: shortDate(latestTerm?.endDate || ''),
      updatedAt: latestTerm?.updatedAt || '',
    });
    const latestYear = selectedStudent.yearlySummaries[0];
    setYearForm({
      year: String(latestYear?.year || data?.currentYear || new Date().getFullYear()),
      summary: latestYear?.summary || '',
      updatedAt: latestYear?.updatedAt || '',
    });
  }, [data?.currentYear, selectedStudent]);

  const handleAccessAction = async (id: string, role: string, action: 'approve' | 'reject') => {
    try {
      const res = await fetch(buildApiUrl(`admin/${action}`), {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ id, role }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: `User ${action}d`, description: `${role} account updated.` });
      fetchDashboard();
    } catch (error) {
      toast({ title: `Failed to ${action} user`, variant: 'destructive' });
    }
  };

  const saveStudent = async () => {
    if (!selectedStudent) return;
    setSaving(true);
    try {
      const res = await fetch(buildApiUrl(`students/${selectedStudent.id}`), {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          name: studentForm.name,
          grade: studentForm.grade,
          parentId: studentForm.parentId || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: 'Student profile saved' });
      fetchDashboard();
    } catch (error) {
      toast({ title: 'Failed to save student', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const saveDaily = async () => {
    if (!dailyForm) return;
    setSaving(true);
    try {
      const activities = JSON.parse(dailyActivitiesText);
      if (!Array.isArray(activities)) throw new Error('Activities must be a JSON array');
      const res = await fetch(buildApiUrl(`progress/${dailyForm.id}`), {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify({ ...dailyForm, activities }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Failed to save daily progress');
      toast({ title: 'Daily progress saved' });
      fetchDashboard();
    } catch (error) {
      toast({
        title: 'Failed to save daily progress',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const saveWeekly = async () => {
    if (!weeklyForm) return;
    setSaving(true);
    try {
      const res = await fetch(buildApiUrl(`feedback/${weeklyForm.id}`), {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify(weeklyForm),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Failed to save weekly feedback');
      toast({ title: 'Weekly feedback saved' });
      fetchDashboard();
    } catch (error) {
      toast({
        title: 'Failed to save weekly feedback',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const saveTermSummary = async () => {
    if (!selectedStudent) return;
    setSaving(true);
    try {
      const res = await fetch(buildApiUrl(`students/${selectedStudent.id}/quarterly-summary`), {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          year: Number(termForm.year),
          quarter: Number(termForm.quarter),
          summary: termForm.summary,
          startDate: termForm.startDate || undefined,
          endDate: termForm.endDate || undefined,
          updatedAt: termForm.updatedAt || undefined,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Failed to save term summary');
      toast({ title: 'Term summary saved' });
      fetchDashboard();
    } catch (error) {
      toast({
        title: 'Failed to save term summary',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const saveYearSummary = async () => {
    if (!selectedStudent) return;
    setSaving(true);
    try {
      const res = await fetch(buildApiUrl(`students/${selectedStudent.id}/yearly-summary`), {
        method: 'PUT',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          year: Number(yearForm.year),
          summary: yearForm.summary,
          updatedAt: yearForm.updatedAt || undefined,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Failed to save yearly summary');
      toast({ title: 'Yearly summary saved' });
      fetchDashboard();
    } catch (error) {
      toast({
        title: 'Failed to save yearly summary',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const exportStudents = () => {
    downloadCsv('admin-students.csv', filteredStudents.map((student) => ({
      studentId: student.id,
      name: student.name,
      grade: student.grade,
      parent: student.parent?.name || '',
      parentEmail: student.parent?.email || '',
      dailyRecords: student.stats.dailyCount,
      weeklyRecords: student.stats.weeklyCount,
      termRecords: student.stats.quarterlyCount,
      yearlyRecords: student.stats.yearlyCount,
      reports: student.stats.reportCount,
      latestDailyDate: student.stats.latestDailyDate || '',
      latestWeeklyStart: student.stats.latestWeeklyStart || '',
      missingDailyToday: student.stats.missingDailyToday ? 'yes' : 'no',
      missingCurrentWeekly: student.stats.missingCurrentWeekly ? 'yes' : 'no',
    })));
  };

  const exportSelectedRecords = () => {
    if (!selectedStudent) return;
    const rows = [
      ...selectedStudent.dailyProgress.map((record) => ({
        type: 'daily',
        date: shortDate(record.date),
        rangeEnd: '',
        title: record.attendance,
        summary: record.summary || '',
      })),
      ...selectedStudent.weeklyFeedback.map((record) => ({
        type: 'weekly',
        date: shortDate(record.weekStarting),
        rangeEnd: shortDate(record.weekEnding),
        title: record.nextWeekFocus || '',
        summary: record.summary,
      })),
      ...selectedStudent.quarterlySummaries.map((record) => ({
        type: 'term',
        date: `${record.year} Q${record.quarter}`,
        rangeEnd: '',
        title: '',
        summary: record.summary,
      })),
      ...selectedStudent.yearlySummaries.map((record) => ({
        type: 'yearly',
        date: String(record.year),
        rangeEnd: '',
        title: '',
        summary: record.summary,
      })),
      ...selectedStudent.reports.map((record) => ({
        type: record.reportType,
        date: shortDate(record.startDate),
        rangeEnd: shortDate(record.endDate),
        title: record.title || '',
        summary: record.summaryText,
      })),
    ];
    downloadCsv(`${selectedStudent.name}-records.csv`, rows);
  };

  const metricItems = [
    { label: 'Students', value: data?.metrics.totalStudents || 0, icon: Users },
    { label: 'Missing daily', value: data?.metrics.missingDailyToday || 0, icon: ClipboardList },
    { label: 'Missing weekly', value: data?.metrics.missingCurrentWeekly || 0, icon: FileText },
    { label: 'Pending access', value: (data?.metrics.pendingParents || 0) + (data?.metrics.pendingTeachers || 0), icon: ShieldCheck },
  ];

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-8 text-slate-900">
        <div className="mx-auto max-w-7xl text-sm text-slate-600">Loading admin data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-amber-700">Admin operations</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal">Student Data Management</h1>
            <p className="mt-2 text-sm text-slate-600">
              Current week {data?.currentCycle.startDate} to {data?.currentCycle.endDate}. Last refreshed {data ? new Date(data.generatedAt).toLocaleString() : ''}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={fetchDashboard} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" onClick={exportStudents}>
              <ArrowDownToLine className="mr-2 h-4 w-4" />
              Export Students
            </Button>
            <Button onClick={exportSelectedRecords} disabled={!selectedStudent}>
              <ArrowDownToLine className="mr-2 h-4 w-4" />
              Export Selected
            </Button>
          </div>
        </div>
      </div>

      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-6">
        <section className="grid gap-3 md:grid-cols-4">
          {metricItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-md border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">{item.label}</span>
                  <Icon className="h-4 w-4 text-amber-700" />
                </div>
                <div className="mt-3 text-3xl font-semibold">{item.value}</div>
              </div>
            );
          })}
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(420px,0.95fr)_1.4fr]">
          <div className="rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-slate-500" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search student, grade, parent"
                  className="h-9"
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <select
                  value={gradeFilter}
                  onChange={(event) => setGradeFilter(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">All grades</option>
                  {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                </select>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">All status</option>
                  <option value="missingDaily">Missing daily</option>
                  <option value="missingWeekly">Missing weekly</option>
                  <option value="noParent">No parent</option>
                </select>
              </div>
            </div>
            <div className="max-h-[690px] overflow-auto">
              {filteredStudents.map((student) => (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => setSelectedId(student.id)}
                  className={`grid w-full gap-2 border-b border-slate-100 p-4 text-left transition hover:bg-slate-50 ${
                    selectedStudent?.id === student.id ? 'bg-amber-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{student.name}</div>
                      <div className="text-sm text-slate-500">{student.grade} · {student.parent?.name || 'No parent linked'}</div>
                    </div>
                    <div className="flex gap-1">
                      {student.stats.missingDailyToday && <Badge variant="outline">Daily</Badge>}
                      {student.stats.missingCurrentWeekly && <Badge variant="outline">Weekly</Badge>}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs text-slate-500">
                    <span>{student.stats.dailyCount} daily</span>
                    <span>{student.stats.weeklyCount} weekly</span>
                    <span>{student.stats.quarterlyCount} term</span>
                    <span>{student.stats.yearlyCount} year</span>
                  </div>
                </button>
              ))}
              {!filteredStudents.length && (
                <div className="p-6 text-sm text-slate-500">No students match the current filters.</div>
              )}
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white">
            {!selectedStudent ? (
              <div className="p-6 text-sm text-slate-500">Select a student to inspect records.</div>
            ) : (
              <Tabs defaultValue="summary" className="w-full">
                <div className="border-b border-slate-200 px-4 pt-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold">{selectedStudent.name}</h2>
                      <p className="text-sm text-slate-500">
                        {selectedStudent.grade} · {selectedStudent.parent?.name || 'No parent linked'} · latest daily {shortDate(selectedStudent.stats.latestDailyDate)}
                      </p>
                    </div>
                    <TabsList className="grid grid-cols-5">
                      <TabsTrigger value="summary">Summary</TabsTrigger>
                      <TabsTrigger value="daily">Daily</TabsTrigger>
                      <TabsTrigger value="weekly">Weekly</TabsTrigger>
                      <TabsTrigger value="reports">Reports</TabsTrigger>
                      <TabsTrigger value="access">Access</TabsTrigger>
                    </TabsList>
                  </div>
                </div>

                <TabsContent value="summary" className="m-0 grid gap-5 p-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-md border border-slate-200 p-4">
                      <div className="text-sm text-slate-500">Latest daily</div>
                      <div className="mt-2 text-xl font-semibold">{shortDate(selectedStudent.stats.latestDailyDate)}</div>
                    </div>
                    <div className="rounded-md border border-slate-200 p-4">
                      <div className="text-sm text-slate-500">Latest weekly</div>
                      <div className="mt-2 text-xl font-semibold">{shortDate(selectedStudent.stats.latestWeeklyStart)}</div>
                    </div>
                    <div className="rounded-md border border-slate-200 p-4">
                      <div className="text-sm text-slate-500">Reports</div>
                      <div className="mt-2 text-xl font-semibold">{selectedStudent.stats.reportCount}</div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="grid gap-2">
                      <Label>Name</Label>
                      <Input value={studentForm.name} onChange={(event) => setStudentForm((form) => ({ ...form, name: event.target.value }))} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Grade</Label>
                      <Input value={studentForm.grade} onChange={(event) => setStudentForm((form) => ({ ...form, grade: event.target.value }))} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Parent</Label>
                      <select
                        value={studentForm.parentId}
                        onChange={(event) => setStudentForm((form) => ({ ...form, parentId: event.target.value }))}
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">No parent</option>
                        {(data?.access.parents || []).map((parent) => (
                          <option key={parent.id} value={parent.id}>{parent.name} {parent.email ? `(${parent.email})` : ''}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <Button onClick={saveStudent} disabled={saving}>Save Student Profile</Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-3 rounded-md border border-slate-200 p-4">
                      <div className="font-medium">Term summary editor</div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={termForm.year} onChange={(event) => setTermForm((form) => ({ ...form, year: event.target.value }))} placeholder="Year" />
                        <Input value={termForm.quarter} onChange={(event) => setTermForm((form) => ({ ...form, quarter: event.target.value }))} placeholder="Quarter" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={termForm.startDate === 'No record' ? '' : termForm.startDate} onChange={(event) => setTermForm((form) => ({ ...form, startDate: event.target.value }))} placeholder="Start date" />
                        <Input value={termForm.endDate === 'No record' ? '' : termForm.endDate} onChange={(event) => setTermForm((form) => ({ ...form, endDate: event.target.value }))} placeholder="End date" />
                      </div>
                      <Textarea value={termForm.summary} onChange={(event) => setTermForm((form) => ({ ...form, summary: event.target.value }))} rows={6} />
                      <Button onClick={saveTermSummary} disabled={saving}>Save Term Summary</Button>
                    </div>
                    <div className="grid gap-3 rounded-md border border-slate-200 p-4">
                      <div className="font-medium">Yearly summary editor</div>
                      <Input value={yearForm.year} onChange={(event) => setYearForm((form) => ({ ...form, year: event.target.value }))} placeholder="Year" />
                      <Textarea value={yearForm.summary} onChange={(event) => setYearForm((form) => ({ ...form, summary: event.target.value }))} rows={8} />
                      <Button onClick={saveYearSummary} disabled={saving}>Save Yearly Summary</Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="daily" className="m-0 grid gap-4 p-4">
                  {dailyForm ? (
                    <div className="grid gap-3 rounded-md border border-slate-200 p-4">
                      <div className="grid gap-3 md:grid-cols-4">
                        <Input value={dailyForm.date} onChange={(event) => setDailyForm({ ...dailyForm, date: event.target.value })} />
                        <select value={dailyForm.attendance} onChange={(event) => setDailyForm({ ...dailyForm, attendance: event.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                          <option value="present">present</option>
                          <option value="late">late</option>
                          <option value="absent">absent</option>
                        </select>
                        <Input value={dailyForm.attendanceStart || ''} onChange={(event) => setDailyForm({ ...dailyForm, attendanceStart: event.target.value })} placeholder="Start HH:mm" />
                        <Input value={dailyForm.attendanceEnd || ''} onChange={(event) => setDailyForm({ ...dailyForm, attendanceEnd: event.target.value })} placeholder="End HH:mm" />
                      </div>
                      <Textarea value={dailyForm.summary || ''} onChange={(event) => setDailyForm({ ...dailyForm, summary: event.target.value })} placeholder="Daily summary" rows={4} />
                      <Textarea value={dailyActivitiesText} onChange={(event) => setDailyActivitiesText(event.target.value)} rows={12} className="font-mono text-xs" />
                      <Button onClick={saveDaily} disabled={saving}>Save Latest Daily Record</Button>
                    </div>
                  ) : (
                    <div className="rounded-md border border-slate-200 p-4 text-sm text-slate-500">No daily progress records yet.</div>
                  )}
                  <RecordList records={selectedStudent.dailyProgress.map((record) => ({
                    id: record.id,
                    primary: shortDate(record.date),
                    secondary: `${record.attendance} · ${record.summary || 'No summary'}`,
                  }))} />
                </TabsContent>

                <TabsContent value="weekly" className="m-0 grid gap-4 p-4">
                  {weeklyForm ? (
                    <div className="grid gap-3 rounded-md border border-slate-200 p-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input value={weeklyForm.weekStarting} onChange={(event) => setWeeklyForm({ ...weeklyForm, weekStarting: event.target.value })} />
                        <Input value={weeklyForm.weekEnding} onChange={(event) => setWeeklyForm({ ...weeklyForm, weekEnding: event.target.value })} />
                      </div>
                      <Textarea value={weeklyForm.summary} onChange={(event) => setWeeklyForm({ ...weeklyForm, summary: event.target.value })} rows={5} placeholder="Weekly summary" />
                      <div className="grid gap-3 md:grid-cols-2">
                        <Textarea value={toLines(weeklyForm.strengths)} onChange={(event) => setWeeklyForm({ ...weeklyForm, strengths: fromLines(event.target.value) })} rows={5} placeholder="Strengths, one per line" />
                        <Textarea value={toLines(weeklyForm.areasToImprove)} onChange={(event) => setWeeklyForm({ ...weeklyForm, areasToImprove: fromLines(event.target.value) })} rows={5} placeholder="Areas to improve, one per line" />
                      </div>
                      <Textarea value={weeklyForm.teacherNotes || ''} onChange={(event) => setWeeklyForm({ ...weeklyForm, teacherNotes: event.target.value })} rows={3} placeholder="Teacher notes" />
                      <Input value={weeklyForm.nextWeekFocus || ''} onChange={(event) => setWeeklyForm({ ...weeklyForm, nextWeekFocus: event.target.value })} placeholder="Next week focus" />
                      <Button onClick={saveWeekly} disabled={saving}>Save Latest Weekly Feedback</Button>
                    </div>
                  ) : (
                    <div className="rounded-md border border-slate-200 p-4 text-sm text-slate-500">No weekly feedback records yet.</div>
                  )}
                  <RecordList records={selectedStudent.weeklyFeedback.map((record) => ({
                    id: record.id,
                    primary: `${shortDate(record.weekStarting)} - ${shortDate(record.weekEnding)}`,
                    secondary: record.summary,
                  }))} />
                </TabsContent>

                <TabsContent value="reports" className="m-0 grid gap-4 p-4">
                  <RecordList records={[
                    ...selectedStudent.quarterlySummaries.map((record) => ({
                      id: record.id,
                      primary: `${record.year} Q${record.quarter}`,
                      secondary: record.summary,
                    })),
                    ...selectedStudent.yearlySummaries.map((record) => ({
                      id: record.id,
                      primary: `${record.year} yearly`,
                      secondary: record.summary,
                    })),
                    ...selectedStudent.reports.map((record) => ({
                      id: record.id,
                      primary: `${record.title || record.reportType} · ${record.status}`,
                      secondary: `${shortDate(record.startDate)} - ${shortDate(record.endDate)} · ${record.summaryText}`,
                    })),
                  ]} />
                </TabsContent>

                <TabsContent value="access" className="m-0 grid gap-4 p-4">
                  <AccessQueue title="Pending Parents" users={data?.access.pendingParents || []} role="parent" onAction={handleAccessAction} />
                  <AccessQueue title="Pending Teachers" users={data?.access.pendingTeachers || []} role="teacher" onAction={handleAccessAction} />
                </TabsContent>
              </Tabs>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

const RecordList = ({ records }: { records: Array<{ id: string; primary: string; secondary: string }> }) => (
  <div className="overflow-hidden rounded-md border border-slate-200">
    {records.length ? records.map((record) => (
      <div key={record.id} className="border-b border-slate-100 p-3 last:border-b-0">
        <div className="text-sm font-medium">{record.primary}</div>
        <div className="mt-1 line-clamp-2 text-sm text-slate-500">{record.secondary}</div>
      </div>
    )) : (
      <div className="p-4 text-sm text-slate-500">No records available.</div>
    )}
  </div>
);

const AccessQueue = ({
  title,
  users,
  role,
  onAction,
}: {
  title: string;
  users: AccessUser[];
  role: 'parent' | 'teacher';
  onAction: (id: string, role: string, action: 'approve' | 'reject') => void;
}) => (
  <div className="rounded-md border border-slate-200">
    <div className="border-b border-slate-200 p-3 font-medium">{title}</div>
    {users.length ? users.map((user) => (
      <div key={user.id} className="flex items-center justify-between gap-3 border-b border-slate-100 p-3 last:border-b-0">
        <div>
          <div className="text-sm font-medium">{user.name}</div>
          <div className="text-sm text-slate-500">{user.email || 'No email'}</div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onAction(user.id, role, 'approve')}>
            <Check className="mr-1 h-4 w-4" />
            Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAction(user.id, role, 'reject')}>
            <X className="mr-1 h-4 w-4" />
            Reject
          </Button>
        </div>
      </div>
    )) : (
      <div className="p-3 text-sm text-slate-500">No pending accounts.</div>
    )}
  </div>
);

export default AdminDashboard;
