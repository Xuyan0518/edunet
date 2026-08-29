import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bot, Download, Edit, FileText, Plus, RefreshCw, RotateCcw, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { apiRequest, jsonBody } from '@/services/http';
import { toBinMutationBody } from '@/utils/studentBin';
import {
  STUDENT_RECORDS_DEFAULT_TAB,
  summarizeStudentRecords,
  type StudentRecordCategoryCounts,
} from '@/utils/studentProfileView';

type Student = { id: string; name: string; grade: string };
type ExamSubject = { name: string; score: string; scope?: string; examDate?: string | null };
type Exam = { id: string; name: string; examDate: string; examType?: string | null; reminderDate?: string | null; subjects: ExamSubject[]; updatedAt?: string };
type Paper = { id: string; subjectId?: string; subjectName?: string; typeId: string; typeName?: string; schoolId: string; schoolName?: string; date: string; score?: string; total?: string; percentage?: number; grade?: string; description?: string; strengths?: string; improvements?: string; updatedAt?: string };
type Report = { id: string; title?: string; reportType: string; startDate: string; endDate: string; summary?: string; summaryText?: string; status?: string; visibleToParent?: boolean; updatedAt?: string };
type Summary = { id?: string; year: number; quarter?: number; summary: string; startDate?: string; endDate?: string; reviewStatus?: string; visibleToParent?: boolean; updatedAt?: string };
type BinItem = { recordId: string; recordType: string; title?: string; originalDate?: string; deletedAt?: string; daysRemaining?: number };
type Option = { id: string; name: string };

const today = () => new Date().toISOString().slice(0, 10);
const currentYear = new Date().getFullYear();
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Request failed';

const Empty = ({ text }: { text: string }) => (
  <div className="py-12 text-center text-sm text-muted-foreground">{text}</div>
);

const Meta = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs text-muted-foreground">{children}</p>
);

export default function StudentRecords() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const canEdit = role === 'teacher';
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<Student | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [quarterly, setQuarterly] = useState<Summary[]>([]);
  const [yearly, setYearly] = useState<Summary | null>(null);
  const [bin, setBin] = useState<Record<string, BinItem[]>>({});
  const [subjects, setSubjects] = useState<Option[]>([]);
  const [paperTypes, setPaperTypes] = useState<Option[]>([]);
  const [paperSchools, setPaperSchools] = useState<Option[]>([]);
  const [dailyProgressCount, setDailyProgressCount] = useState(0);
  const [weeklyFeedbackCount, setWeeklyFeedbackCount] = useState(0);
  const [year, setYear] = useState(currentYear);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [studentData, examData, paperData, reportData, quarterlyData, yearlyData, subjectData, typeData, schoolData, dailyProgressData, weeklyFeedbackData] = await Promise.all([
        apiRequest<Student>(`students/${id}`),
        apiRequest<Exam[]>(`students/${id}/exams`),
        apiRequest<Paper[]>(`students/${id}/papers`),
        apiRequest<Report[]>(`students/${id}/reports`),
        apiRequest<Summary[]>(`students/${id}/quarterly-summary?year=${year}`),
        apiRequest<Summary>(`students/${id}/yearly-summary?year=${year}`),
        apiRequest<Array<{ subject: Option }>>(`students/${id}/subjects/full`),
        apiRequest<Option[]>('paper-types'),
        apiRequest<Option[]>('paper-schools'),
        apiRequest<unknown[]>(`students/${id}/progress`),
        apiRequest<unknown[]>(`feedback/list?studentId=${encodeURIComponent(id)}`),
      ]);
      setStudent(studentData);
      setExams(examData || []);
      setPapers(paperData || []);
      setReports(reportData || []);
      setQuarterly(quarterlyData || []);
      setYearly(yearlyData?.id ? yearlyData : null);
      setSubjects((subjectData || []).map((entry) => entry.subject).filter(Boolean));
      setPaperTypes(typeData || []);
      setPaperSchools(schoolData || []);
      setDailyProgressCount(dailyProgressData?.length || 0);
      setWeeklyFeedbackCount(weeklyFeedbackData?.length || 0);
      if (canEdit) {
        const binData = await apiRequest<{ groups: Record<string, BinItem[]> }>(`students/${id}/bin`);
        setBin(binData.groups || {});
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [canEdit, id, year]);

  useEffect(() => { void load(); }, [load]);

  const binItems = useMemo(() => Object.values(bin).flat(), [bin]);
  const overview = useMemo(() => summarizeStudentRecords({
    dailyProgress: dailyProgressCount,
    weeklyFeedback: weeklyFeedbackCount,
    exams: exams.length,
    papers: papers.length,
    reports: reports.length,
    semesterSummaries: quarterly.length,
    yearlySummaries: yearly ? 1 : 0,
  }), [dailyProgressCount, exams.length, papers.length, quarterly.length, reports.length, weeklyFeedbackCount, yearly]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/student/${id}`)} aria-label="Back to student">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold">{student?.name || 'Student records'}</h1>
          <p className="text-sm text-muted-foreground">Grade {student?.grade || '-'} · Academic records and reports</p>
        </div>
        <Input className="w-28" type="number" value={year} min={2000} max={2100} onChange={(event) => setYear(Number(event.target.value))} aria-label="Summary year" />
        <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading} aria-label="Refresh">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <Tabs defaultValue={STUDENT_RECORDS_DEFAULT_TAB}>
        <TabsList className="mb-5 h-auto w-full justify-start gap-1 overflow-x-auto bg-transparent p-0">
          {['overview', 'exams', 'papers', 'reports', 'semester', 'yearly', ...(canEdit ? ['bin'] : [])].map((tab) => (
            <TabsTrigger key={tab} value={tab} className="shrink-0 capitalize data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">{tab}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview"><StudentRecordsOverview counts={overview} /></TabsContent>
        <TabsContent value="exams"><ExamPanel studentId={id} canEdit={canEdit} items={exams} onChanged={load} /></TabsContent>
        <TabsContent value="papers"><PaperPanel studentId={id} canEdit={canEdit} items={papers} subjects={subjects} types={paperTypes} schools={paperSchools} onChanged={load} /></TabsContent>
        <TabsContent value="reports"><ReportPanel studentId={id} canEdit={canEdit} items={reports} onChanged={load} /></TabsContent>
        <TabsContent value="semester"><QuarterlyPanel studentId={id} canEdit={canEdit} year={year} items={quarterly} onChanged={load} /></TabsContent>
        <TabsContent value="yearly"><YearlyPanel studentId={id} canEdit={canEdit} year={year} item={yearly} onChanged={load} /></TabsContent>
        {canEdit && <TabsContent value="bin"><BinPanel studentId={id} items={binItems} onChanged={load} /></TabsContent>}
      </Tabs>
    </main>
  );
}

function StudentRecordsOverview({ counts }: { counts: StudentRecordCategoryCounts & { total: number } }) {
  const categories = [
    { label: 'Daily progress', count: counts.dailyProgress, detail: 'Attendance, activities, and teacher notes' },
    { label: 'Weekly feedback', count: counts.weeklyFeedback, detail: 'Weekly summaries, strengths, and next steps' },
    { label: 'Exams', count: counts.exams, detail: 'Exam schedules, subjects, and scores' },
    { label: 'Papers & quizzes', count: counts.papers, detail: 'Practice results, strengths, and improvements' },
    { label: 'Structured reports', count: counts.reports, detail: 'Teacher drafts and published reports' },
    { label: 'Semester summaries', count: counts.semesterSummaries, detail: 'Summaries for the selected year' },
    { label: 'Yearly summaries', count: counts.yearlySummaries, detail: 'Year-end progress summaries' },
  ];

  return <div className="space-y-5">
    <Card>
      <CardHeader>
        <CardTitle>Complete student record</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {counts.total} saved records are available across the profile and academic workspace. Daily progress and weekly feedback remain on the student profile; use the tabs above for exams, papers, reports, and summaries.
        </p>
      </CardContent>
    </Card>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((category) => <Card key={category.label}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{category.label}</p>
              <Meta>{category.detail}</Meta>
            </div>
            <Badge variant="outline" className="text-base">{category.count}</Badge>
          </div>
        </CardContent>
      </Card>)}
    </div>
  </div>;
}

function ExamPanel({ studentId, canEdit, items, onChanged }: { studentId: string; canEdit: boolean; items: Exam[]; onChanged: () => Promise<void> }) {
  const [form, setForm] = useState({ name: '', examDate: today(), examType: 'WA1', reminderDate: '', subject: '', score: '', scope: '' });
  const save = async () => {
    if (!form.name.trim() || !form.subject.trim()) return toast.error('Exam name and subject are required');
    try {
      await apiRequest(`students/${studentId}/exams`, { method: 'POST', ...jsonBody({ name: form.name, examDate: form.examDate, examType: form.examType, reminderDate: form.reminderDate || null, subjects: [{ name: form.subject, score: form.score, scope: form.scope, examDate: form.examDate }] }) });
      setForm({ name: '', examDate: today(), examType: 'WA1', reminderDate: '', subject: '', score: '', scope: '' });
      toast.success('Exam saved'); await onChanged();
    } catch (error) { toast.error(errorMessage(error)); }
  };
  const remove = async (item: Exam) => {
    if (!confirm('Move this exam to the recycle bin?')) return;
    try { await apiRequest(`exams/${item.id}?updatedAt=${encodeURIComponent(item.updatedAt || '')}`, { method: 'DELETE' }); toast.success('Exam moved to bin'); await onChanged(); } catch (error) { toast.error(errorMessage(error)); }
  };
  const edit = async (item: Exam) => {
    const name = prompt('Exam name', item.name);
    if (!name?.trim()) return;
    const examDate = prompt('Exam date (YYYY-MM-DD)', String(item.examDate).slice(0, 10));
    if (!examDate?.trim()) return;
    try {
      await apiRequest(`exams/${item.id}`, { method: 'PUT', ...jsonBody({ studentId, name: name.trim(), examDate: examDate.trim(), examType: item.examType, reminderDate: item.reminderDate, subjects: item.subjects, updatedAt: item.updatedAt }) });
      toast.success('Exam updated'); await onChanged();
    } catch (error) { toast.error(errorMessage(error)); }
  };
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
    <div className="space-y-3">{items.length ? items.map((item) => <Card key={item.id}><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{item.name}</h3><Meta>{String(item.examDate).slice(0, 10)} {item.examType ? `· ${item.examType}` : ''}</Meta></div>{canEdit && <div className="flex"><Button variant="ghost" size="icon" onClick={() => void edit(item)} aria-label="Edit exam"><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => void remove(item)} aria-label="Delete exam"><Trash2 className="h-4 w-4" /></Button></div>}</div><div className="mt-4 grid gap-2 sm:grid-cols-2">{item.subjects.map((subject, index) => <div key={`${subject.name}-${index}`} className="border-l-2 border-primary pl-3"><p className="text-sm font-medium">{subject.name} <span className="text-primary">{subject.score || 'Scheduled'}</span></p>{subject.scope && <Meta>{subject.scope}</Meta>}</div>)}</div></CardContent></Card>) : <Empty text="No exam records yet." />}</div>
    {canEdit && <Card className="h-fit"><CardHeader><CardTitle className="text-base">Add exam</CardTitle></CardHeader><CardContent className="space-y-3"><Field label="Exam name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Exam date"><Input type="date" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} /></Field><Field label="Reminder"><Input type="date" value={form.reminderDate} onChange={(e) => setForm({ ...form, reminderDate: e.target.value })} /></Field></div><Field label="Type"><Select value={form.examType} onValueChange={(value) => setForm({ ...form, examType: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['WA1', 'WA2', 'WA3', 'FINALS'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></Field><Field label="Subject"><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field><Field label="Score (optional)"><Input value={form.score} placeholder="82/100" onChange={(e) => setForm({ ...form, score: e.target.value })} /></Field><Field label="Scope"><Textarea value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} /></Field><Button className="w-full" onClick={() => void save()}><Plus className="mr-2 h-4 w-4" />Add exam</Button></CardContent></Card>}
  </div>;
}

function PaperPanel({ studentId, canEdit, items, subjects, types, schools, onChanged }: { studentId: string; canEdit: boolean; items: Paper[]; subjects: Option[]; types: Option[]; schools: Option[]; onChanged: () => Promise<void> }) {
  const [form, setForm] = useState({ subjectId: '', typeId: '', schoolId: '', date: today(), score: '', total: '', description: '', strengths: '', improvements: '' });
  const [editing, setEditing] = useState<Paper | null>(null);
  const save = async () => {
    const subject = subjects.find((item) => item.id === form.subjectId);
    if (!subject || !form.typeId || !form.schoolId || !form.strengths.trim() || !form.improvements.trim()) return toast.error('Subject, type, school, strengths, and improvements are required');
    try { const endpoint = editing ? `students/${studentId}/papers/${editing.id}` : `students/${studentId}/papers`; await apiRequest(endpoint, { method: editing ? 'PUT' : 'POST', ...jsonBody({ ...form, subjectName: subject.name, updatedAt: editing?.updatedAt }) }); toast.success('Paper saved'); setEditing(null); setForm({ subjectId: '', typeId: '', schoolId: '', date: today(), score: '', total: '', description: '', strengths: '', improvements: '' }); await onChanged(); } catch (error) { toast.error(errorMessage(error)); }
  };
  const startEdit = (item: Paper) => { setEditing(item); setForm({ subjectId: item.subjectId || '', typeId: item.typeId, schoolId: item.schoolId, date: item.date, score: item.score == null ? '' : String(item.score), total: item.total == null ? '' : String(item.total), description: item.description || '', strengths: item.strengths || '', improvements: item.improvements || '' }); };
  const remove = async (item: Paper) => {
    if (!confirm('Move this paper to the recycle bin?')) return;
    try { await apiRequest(`students/${studentId}/papers/${item.id}?updatedAt=${encodeURIComponent(item.updatedAt || '')}`, { method: 'DELETE' }); toast.success('Paper moved to bin'); await onChanged(); } catch (error) { toast.error(errorMessage(error)); }
  };
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]"><div className="space-y-3">{items.length ? items.map((item) => <Card key={item.id}><CardContent className="p-5"><div className="flex items-start justify-between"><div><h3 className="font-semibold">{item.subjectName || 'Paper'} · {item.typeName || 'Assessment'}</h3><Meta>{item.schoolName || 'No school'} · {item.date}</Meta></div>{canEdit && <div className="flex"><Button variant="ghost" size="icon" onClick={() => startEdit(item)} aria-label="Edit paper"><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => void remove(item)} aria-label="Delete paper"><Trash2 className="h-4 w-4" /></Button></div>}</div><div className="mt-3 flex gap-2"><Badge>{item.score || '-'}{item.total ? `/${item.total}` : ''}</Badge>{item.percentage != null && <Badge variant="outline">{item.percentage}% · {item.grade}</Badge>}</div>{item.description && <p className="mt-3 text-sm">{item.description}</p>}<div className="mt-3 grid gap-3 sm:grid-cols-2"><div><Meta>Strengths</Meta><p className="text-sm">{item.strengths || '-'}</p></div><div><Meta>Improvements</Meta><p className="text-sm">{item.improvements || '-'}</p></div></div></CardContent></Card>) : <Empty text="No papers or quizzes yet." />}</div>{canEdit && <Card className="h-fit"><CardHeader><CardTitle className="text-base">{editing ? 'Edit paper' : 'Add paper'}</CardTitle></CardHeader><CardContent className="space-y-3"><OptionField label="Subject" value={form.subjectId} options={subjects} onChange={(value) => setForm({ ...form, subjectId: value })} /><OptionField label="Type" value={form.typeId} options={types} onChange={(value) => setForm({ ...form, typeId: value })} /><OptionField label="School" value={form.schoolId} options={schools} onChange={(value) => setForm({ ...form, schoolId: value })} /><Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Score"><Input type="number" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} /></Field><Field label="Total"><Input type="number" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} /></Field></div><Field label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field><Field label="Strengths"><Textarea value={form.strengths} onChange={(e) => setForm({ ...form, strengths: e.target.value })} /></Field><Field label="Improvements"><Textarea value={form.improvements} onChange={(e) => setForm({ ...form, improvements: e.target.value })} /></Field><Button className="w-full" onClick={() => void save()}><Save className="mr-2 h-4 w-4" />Save paper</Button>{editing && <Button variant="ghost" className="w-full" onClick={() => setEditing(null)}>Cancel edit</Button>}</CardContent></Card>}</div>;
}

function ReportPanel({ studentId, canEdit, items, onChanged }: { studentId: string; canEdit: boolean; items: Report[]; onChanged: () => Promise<void> }) {
  const [form, setForm] = useState({ reportType: 'quarterly', title: '', startDate: `${currentYear}-01-01`, endDate: today(), summary: '' });
  const save = async () => { try { await apiRequest('reports', { method: 'POST', ...jsonBody({ studentId, ...form, year: Number(form.startDate.slice(0, 4)), status: 'draft', visibleToParent: false }) }); toast.success('Draft sent for admin review'); setForm({ ...form, title: '', summary: '' }); await onChanged(); } catch (error) { toast.error(errorMessage(error)); } };
  const remove = async (item: Report) => { if (!confirm('Move this report to the recycle bin?')) return; try { await apiRequest(`reports/${item.id}`, { method: 'DELETE' }); toast.success('Report moved to bin'); await onChanged(); } catch (error) { toast.error(errorMessage(error)); } };
  const edit = async (item: Report) => { const summary = prompt('Report summary', item.summary || item.summaryText || ''); if (summary == null) return; try { await apiRequest(`reports/${item.id}`, { method: 'PATCH', ...jsonBody({ summary, updatedAt: item.updatedAt }) }); toast.success('Report updated for review'); await onChanged(); } catch (error) { toast.error(errorMessage(error)); } };
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]"><div className="space-y-3">{items.length ? items.map((item) => <Card key={item.id}><CardContent className="p-5"><div className="flex items-start justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{item.title || `${item.reportType} report`}</h3><Badge variant={item.visibleToParent ? 'default' : 'outline'}>{item.visibleToParent ? 'Published' : item.status || 'Draft'}</Badge></div><Meta>{item.startDate} to {item.endDate}</Meta></div>{canEdit && <div className="flex"><Button variant="ghost" size="icon" onClick={() => void edit(item)} aria-label="Edit report"><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => void remove(item)} aria-label="Delete report"><Trash2 className="h-4 w-4" /></Button></div>}</div><p className="mt-4 whitespace-pre-wrap text-sm">{item.summary || item.summaryText || 'No summary'}</p></CardContent></Card>) : <Empty text="No structured reports yet." />}</div>{canEdit && <Card className="h-fit"><CardHeader><CardTitle className="text-base">Create report draft</CardTitle></CardHeader><CardContent className="space-y-3"><Field label="Report type"><Select value={form.reportType} onValueChange={(value) => setForm({ ...form, reportType: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="quarterly">Semester</SelectItem><SelectItem value="yearly">Yearly</SelectItem></SelectContent></Select></Field><Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Start"><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field><Field label="End"><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field></div><Field label="Summary"><Textarea className="min-h-40" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></Field><Button className="w-full" onClick={() => void save()}><FileText className="mr-2 h-4 w-4" />Save draft</Button></CardContent></Card>}</div>;
}

function QuarterlyPanel({ studentId, canEdit, year, items, onChanged }: { studentId: string; canEdit: boolean; year: number; items: Summary[]; onChanged: () => Promise<void> }) {
  const [quarter, setQuarter] = useState('1'); const [startDate, setStartDate] = useState(`${year}-01-01`); const [endDate, setEndDate] = useState(`${year}-06-30`); const [summary, setSummary] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { const item = items.find((row) => row.quarter === Number(quarter)); setSummary(item?.summary || ''); setStartDate(item?.startDate || `${year}-01-01`); setEndDate(item?.endDate || `${year}-06-30`); }, [items, quarter, year]);
  const generate = async () => { setBusy(true); try { const result = await apiRequest<{ summary: string }>('ai/quarterly-summary', { method: 'POST', ...jsonBody({ studentId, startDate, endDate }) }); setSummary(result.summary || ''); toast.success('AI draft generated'); } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); } };
  const save = async () => { const existing = items.find((row) => row.quarter === Number(quarter)); try { await apiRequest(`students/${studentId}/quarterly-summary`, { method: 'PUT', ...jsonBody({ year, quarter: Number(quarter), summary, startDate, endDate, updatedAt: existing?.updatedAt }) }); toast.success('Semester summary sent for review'); await onChanged(); } catch (error) { toast.error(errorMessage(error)); } };
  return <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]"><div className="space-y-2">{[1,2,3,4].map((value) => { const item = items.find((row) => row.quarter === value); return <button key={value} onClick={() => setQuarter(String(value))} className={`w-full border p-4 text-left ${quarter === String(value) ? 'border-primary bg-primary/5' : 'bg-card'}`}><span className="font-medium">Semester {value}</span><Meta>{item ? (item.visibleToParent ? 'Published' : item.reviewStatus || 'Pending review') : 'Not created'}</Meta></button>; })}</div><Card><CardContent className="space-y-4 p-5"><div className="grid gap-3 sm:grid-cols-2"><Field label="Start date"><Input type="date" value={startDate} disabled={!canEdit} onChange={(e) => setStartDate(e.target.value)} /></Field><Field label="End date"><Input type="date" value={endDate} disabled={!canEdit} onChange={(e) => setEndDate(e.target.value)} /></Field></div><Field label={`Semester ${quarter} summary`}><Textarea className="min-h-72" value={summary} readOnly={!canEdit} onChange={(e) => setSummary(e.target.value)} /></Field>{canEdit && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void generate()} disabled={busy}><Bot className="mr-2 h-4 w-4" />{busy ? 'Generating...' : 'Generate with AI'}</Button><Button onClick={() => void save()}><Save className="mr-2 h-4 w-4" />Save for review</Button></div>}</CardContent></Card></div>;
}

function YearlyPanel({ studentId, canEdit, year, item, onChanged }: { studentId: string; canEdit: boolean; year: number; item: Summary | null; onChanged: () => Promise<void> }) {
  const [summary, setSummary] = useState(''); const [busy, setBusy] = useState(false); useEffect(() => setSummary(item?.summary || ''), [item]);
  const generate = async () => { setBusy(true); try { const result = await apiRequest<{ summary: string }>('ai/yearly-summary', { method: 'POST', ...jsonBody({ studentId, year }) }); setSummary(result.summary || ''); toast.success('AI draft generated'); } catch (error) { toast.error(errorMessage(error)); } finally { setBusy(false); } };
  const save = async () => { try { await apiRequest(`students/${studentId}/yearly-summary`, { method: 'PUT', ...jsonBody({ year, summary, updatedAt: item?.updatedAt }) }); toast.success('Yearly summary sent for review'); await onChanged(); } catch (error) { toast.error(errorMessage(error)); } };
  const exportMarkdown = async () => { try { const result = await apiRequest<{ markdown?: string; content?: string }>(`students/${studentId}/report-export?startDate=${year}-01-01&endDate=${year}-12-31&format=markdown`); const blob = new Blob([result.markdown || result.content || JSON.stringify(result, null, 2)], { type: 'text/markdown' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${studentId}-${year}-report.md`; link.click(); URL.revokeObjectURL(url); } catch (error) { toast.error(errorMessage(error)); } };
  return <Card><CardHeader><div className="flex items-center justify-between"><CardTitle>{year} yearly summary</CardTitle>{item && <Badge variant={item.visibleToParent ? 'default' : 'outline'}>{item.visibleToParent ? 'Published' : item.reviewStatus || 'Pending review'}</Badge>}</div></CardHeader><CardContent className="space-y-4"><Textarea className="min-h-80" value={summary} readOnly={!canEdit} onChange={(e) => setSummary(e.target.value)} /> <div className="flex flex-wrap gap-2">{canEdit && <><Button variant="outline" onClick={() => void generate()} disabled={busy}><Bot className="mr-2 h-4 w-4" />{busy ? 'Generating...' : 'Generate with AI'}</Button><Button onClick={() => void save()}><Save className="mr-2 h-4 w-4" />Save for review</Button></>}<Button variant="outline" onClick={() => void exportMarkdown()}><Download className="mr-2 h-4 w-4" />Export markdown</Button></div></CardContent></Card>;
}

function BinPanel({ studentId, items, onChanged }: { studentId: string; items: BinItem[]; onChanged: () => Promise<void> }) {
  const act = async (item: BinItem, permanent: boolean) => { if (!confirm(permanent ? 'Permanently delete this record? This cannot be undone.' : 'Restore this record?')) return; try { await apiRequest(`students/${studentId}/bin/${permanent ? 'permanent' : 'restore'}`, { method: permanent ? 'DELETE' : 'POST', ...jsonBody(toBinMutationBody(item)) }); toast.success(permanent ? 'Record permanently deleted' : 'Record restored'); await onChanged(); } catch (error) { toast.error(errorMessage(error)); } };
  return <Card><CardHeader><CardTitle>Recycle bin</CardTitle></CardHeader><CardContent>{items.length ? <div className="divide-y">{items.map((item) => <div key={`${item.recordType}-${item.recordId}`} className="flex flex-wrap items-center gap-3 py-4"><div className="min-w-0 flex-1"><p className="font-medium">{item.title || item.recordType}</p><Meta>{item.originalDate || 'No date'} · deleted {String(item.deletedAt || '').slice(0, 10)} · {item.daysRemaining ?? 0} days left</Meta></div><Button variant="outline" size="sm" onClick={() => void act(item, false)}><RotateCcw className="mr-2 h-4 w-4" />Restore</Button><Button variant="destructive" size="sm" onClick={() => void act(item, true)}><Trash2 className="mr-2 h-4 w-4" />Delete</Button></div>)}</div> : <Empty text="The recycle bin is empty." />}</CardContent></Card>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function OptionField({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) { return <Field label={label}><Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue placeholder={`Select ${label.toLowerCase()}`} /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectContent></Select></Field>; }
