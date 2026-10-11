import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useWebCopy } from '@/i18n/web';
import { queryKeys } from '@/app/queryKeys';
import { studentsApi, type Student } from '@/services/studentsApi';
import { requestJson } from '@/services/http';
import { businessToday, isBusinessDate, reportingWeek } from '@/domain/businessDates';
import { can } from '@/app/permissions';
import { AsyncState } from '@/components/shared/AsyncState';
import Students from './Students';
type Queue = {
    missing?: Student[];
    incomplete?: Array<Student & {
        completion: Record<string, {
            completed?: number;
            target?: number;
        } | boolean>;
    }>;
    cycle?: {
        startDate: string;
        endDate: string;
    };
    upcoming?: Array<{
        id: string;
        name: string;
        student: Student;
        examDate: string;
        subject?: {
            name: string;
            examDate?: string;
        };
    }>;
};
function QueueCard({ title, endpoint, date, week, kind }: {
    title: string;
    endpoint: string;
    date: string;
    week: string;
    kind: 'daily' | 'weekly' | 'tasks' | 'exams';
}) {
    const { user } = useAuth();
    const c = useWebCopy();
    const query = useQuery({ queryKey: queryKeys.resource(user, endpoint), queryFn: ({ signal }) => requestJson<Queue>(endpoint, { signal }) });
    const taskLabels: Record<string, string> = { reading: c('阅读', 'Reading'), editing: c('改错', 'Editing'), grammar: c('语法', 'Grammar'), vocab: c('词汇', 'Vocabulary'), composition: c('作文', 'Composition') };
    const rows = query.data?.missing || query.data?.incomplete;
    const count = rows?.length ?? query.data?.upcoming?.length;
    return <section className="web-card"><h2>{title} {count !== undefined && <span className="web-count">{count}</span>}</h2><AsyncState pending={query.isPending} error={query.error} retry={() => void query.refetch()}/>
    {query.isSuccess && <><p className="text-sm text-muted-foreground">{query.data.cycle ? `${query.data.cycle.startDate} — ${query.data.cycle.endDate}` : date}</p>{count === 0 ? <p>{c('当前没有待处理项。', 'No outstanding items.')}</p> : <details open><summary>{c('查看列表', 'View list')}</summary><ul className="web-queue">{rows?.map(student => <li key={student.id}><Link to={kind === 'daily' ? `/daily-progress?student=${encodeURIComponent(student.id)}&date=${date}` : kind === 'weekly' ? `/weekly-feedback?student=${encodeURIComponent(student.id)}&weekStarting=${week}` : `/students/${encodeURIComponent(student.id)}`}>{student.name} <span>{student.grade}</span></Link>{'completion' in student && Object.entries(student.completion).map(([task, value]) => typeof value === 'object' && value && <small key={task}>{taskLabels[task] || task}: {value.completed ?? '—'}/{value.target ?? '—'} </small>)}</li>)}{query.data.upcoming?.map(exam => <li key={`${exam.id}:${exam.subject?.name}`}><Link to={`/students/${encodeURIComponent(exam.student.id)}`}>{exam.student.name} · {exam.name}</Link><small>{exam.subject?.name} · {exam.subject?.examDate || exam.examDate}</small></li>)}</ul></details>}</>}
  </section>;
}
export default function Dashboard() {
    const { user } = useAuth();
    const c = useWebCopy();
    const [params, setParams] = useSearchParams();
    const rawDate = params.get('date') || businessToday();
    const date = isBusinessDate(rawDate) ? rawDate : businessToday();
    const rawWeek = params.get('weekStarting') || date;
    const week = reportingWeek(isBusinessDate(rawWeek) ? rawWeek : date);
    const children = useQuery({ queryKey: queryKeys.students(user), queryFn: ({ signal }) => studentsApi.list(signal), enabled: user.role === 'parent' || !!user.isReviewer });
    if (user.role === 'admin')
        return <Navigate to="/admin/dashboard" replace/>;
    if (user.role === 'parent' || user.isReviewer) {
        if (children.isPending || children.isError)
            return <AsyncState pending={children.isPending} error={children.error} retry={() => void children.refetch()}/>;
        if (children.data.length === 1)
            return <Navigate to={`/students/${encodeURIComponent(children.data[0].id)}`} replace/>;
        return <Students />;
    }
    return <section className="web-content"><div className="web-heading"><div><p className="web-eyebrow">EDUNET / OVERVIEW</p><h1>{c('学习工作台', 'Learning dashboard')}</h1><p>{c('欢迎回来', 'Welcome back')}，{user.name}</p></div><Link className="web-primary-link" to="/students">{c('查看学生', 'View students')} →</Link></div><div className="web-filters"><label>{c('记录日期', 'Record date')}<input type="date" min="2000-01-01" max="2100-12-31" value={date} onChange={event => { if (isBusinessDate(event.target.value)) {
        const next = new URLSearchParams(params);
        next.set('date', event.target.value);
        setParams(next);
    } }}/></label><label>{c('反馈周（周日至周六）', 'Feedback week (Sunday–Saturday)')}<input type="date" min="2000-01-01" max="2100-12-31" value={week.start} onChange={event => { if (isBusinessDate(event.target.value)) {
        const next = new URLSearchParams(params);
        next.set('weekStarting', reportingWeek(event.target.value).start);
        setParams(next);
    } }}/></label></div><div className="web-grid">
    {can(user, 'queues') && <><QueueCard title={c('未填写每日记录', 'Missing daily records')} endpoint={`daily-progress/missing?date=${date}`} date={date} week={week.start} kind="daily"/><QueueCard title={c('未填写每周反馈', 'Missing weekly feedback')} endpoint={`feedback/missing?weekStarting=${week.start}`} date={date} week={week.start} kind="weekly"/></>}
    {can(user, 'strictTeacher') && !user.isReviewer && <><QueueCard title={c('近期考试', 'Upcoming exams')} endpoint={`exams/upcoming?date=${date}`} date={date} week={week.start} kind="exams"/><QueueCard title={c('周期任务未完成', 'Incomplete cycle tasks')} endpoint={`weekly-tasks/incomplete?date=${date}`} date={date} week={week.start} kind="tasks"/></>}
  </div></section>;
}
