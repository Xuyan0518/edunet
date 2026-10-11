import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useWebCopy } from '@/i18n/web';
import { queryKeys } from '@/app/queryKeys';
import { requestJson } from '@/services/http';
import { studentsApi, type Student } from '@/services/studentsApi';
import { parentIdsFor, saveStudentProfile, saveStudentAssignments } from '@/features/studentSave';
import { AsyncState } from '@/components/shared/AsyncState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
type Parent = {
    id: string;
    name: string;
    status: string;
};
type Subject = {
    id: string;
    code: string;
    name: string;
    isRequired?: boolean;
};
function StudentForm({ student, parents, subjects, assigned }: {
    student?: Student;
    parents: Parent[];
    subjects: Subject[];
    assigned: string[];
}) {
    const { user } = useAuth();
    const c = useWebCopy();
    const navigate = useNavigate();
    const cache = useQueryClient();
    const [name, setName] = useState(student?.name || '');
    const [grade, setGrade] = useState(student?.grade || '');
    const [parentIds, setParents] = useState(student ? parentIdsFor(student) : []);
    const required = subjects.filter(subject => subject.isRequired || subject.code === 'ENGLISH').map(subject => subject.id);
    const [subjectIds, setSubjects] = useState([...new Set([...assigned, ...required])]);
    const [createdId, setCreatedId] = useState<string>();
    const [profileSaved, setProfileSaved] = useState(false);
    const [pending, setPending] = useState(false);
    const [uncertain, setUncertain] = useState(false);
    const [error, setError] = useState('');
    const toggle = (values: string[], id: string) => values.includes(id) ? values.filter(value => value !== id) : [...values, id];
    async function save(event: React.FormEvent) {
        event.preventDefault();
        setPending(true);
        setError('');
        let id = createdId || student?.id;
        let saved = profileSaved;
        try {
            if (!saved) {
                const result = await saveStudentProfile({ name: name.trim(), grade: grade.trim(), parentIds }, id);
                id = result.id;
                setCreatedId(id);
                setProfileSaved(true);
                saved = true;
            }
            await saveStudentAssignments(id!, subjectIds);
            const reloaded = await studentsApi.get(id!);
            if (reloaded.name !== name.trim() || reloaded.grade !== grade.trim() || parentIdsFor(reloaded).sort().join() !== [...parentIds].sort().join())
                throw new Error('Profile read did not match');
            await cache.invalidateQueries({ queryKey: queryKeys.students(user) });
            await cache.invalidateQueries({ queryKey: queryKeys.student(user, id!) });
            navigate(`/students/${encodeURIComponent(id!)}`);
        }
        catch {
            if (saved)
                setError(c('学生资料已保存；科目或刷新步骤未完成。可重试后续步骤。', 'Student profile saved; assignments or reload are incomplete. Retry the remaining steps.'));
            else {
                setUncertain(true);
                setError(c('无法确认保存结果。请先返回学生列表检查，避免重复创建或覆盖记录。', 'Save outcome is unknown. Check the student list before another save to avoid duplicate creation or overwriting a record.'));
            }
        }
        finally {
            setPending(false);
        }
    }
    return <form className="web-card web-form" onSubmit={save}>
    <fieldset disabled={pending || profileSaved || uncertain} className="space-y-5"><label className="web-field">{c('姓名', 'Name')}<Input minLength={2} maxLength={100} required value={name} onChange={event => setName(event.target.value)}/></label><label className="web-field">{c('年级', 'Grade')}<Input required maxLength={20} value={grade} onChange={event => setGrade(event.target.value)}/></label>
      <fieldset><legend>{c('家长关联（可多选）', 'Parent bindings (multiple allowed)')}</legend>{parents.map(parent => <label className="flex gap-2 py-2" key={parent.id}><input type="checkbox" checked={parentIds.includes(parent.id)} onChange={() => setParents(toggle(parentIds, parent.id))}/>{parent.name}</label>)}{parentIds.filter(id => !parents.some(parent => parent.id === id)).map(id => <label className="flex gap-2 py-2" key={id}><input type="checkbox" checked onChange={() => setParents(toggle(parentIds, id))}/>{c('已有关联', 'Existing binding')} · {id}</label>)}</fieldset>
    </fieldset>
    <fieldset disabled={pending || uncertain}><legend>{c('学习科目', 'Subjects')}</legend>{subjects.map(subject => <label className="flex gap-2 py-2" key={subject.id}><input type="checkbox" disabled={required.includes(subject.id)} checked={subjectIds.includes(subject.id)} onChange={() => setSubjects(toggle(subjectIds, subject.id))}/>{subject.name} {required.includes(subject.id) && c('（必修）', '(required)')}</label>)}<p className="text-sm text-muted-foreground">{c('调整科目时保留已记录的章节进度。必修科目保留。', 'Subject changes preserve recorded chapter progress. Required subjects are retained.')}</p></fieldset>
    {error && <p role="alert">{error}</p>}<div className="flex flex-wrap gap-3"><Button disabled={pending || uncertain || name.trim().length < 2 || !grade.trim()}>{pending ? c('保存中…', 'Saving…') : profileSaved ? c('重试后续步骤', 'Retry remaining steps') : c('保存', 'Save')}</Button><Link to={createdId ? `/students/${encodeURIComponent(createdId)}` : '/students'} className="underline self-center">{c('返回查看', 'Return to records')}</Link></div>
  </form>;
}
export default function AddStudent() {
    const { id } = useParams();
    const { user } = useAuth();
    const c = useWebCopy();
    const query = useQuery({ queryKey: queryKeys.resource(user, `student-form:${id || 'new'}`), queryFn: async ({ signal }) => {
            const [parents, subjects, student, assigned] = await Promise.all([
                requestJson<Parent[]>('parents', { signal }), requestJson<Subject[]>('subjects', { signal }),
                id ? studentsApi.get(id, signal) : undefined, id ? requestJson<string[]>(`students/${encodeURIComponent(id)}/subjects`, { signal }) : [],
            ]);
            return { parents, subjects, student, assigned };
        } });
    return <section className="web-content"><h1>{id ? c('编辑学生资料', 'Edit student') : c('添加学生', 'Add student')}</h1><AsyncState pending={query.isPending} error={query.error} retry={() => void query.refetch()}/>{query.isSuccess && <StudentForm key={id || 'new'} {...query.data}/>}</section>;
}
