import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { queryKeys } from '@/app/queryKeys';
import { requestJson } from '@/services/http';
import { useWebCopy } from '@/i18n/web';
import { AsyncState } from '@/components/shared/AsyncState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { StudySettings } from './contracts';
function Form({ initial }: {
    initial: StudySettings;
}) {
    const c = useWebCopy();
    const [form, setForm] = useState(initial);
    const [saved, setSaved] = useState(initial);
    const [pending, setPending] = useState(false);
    const [message, setMessage] = useState('');
    async function save(event: React.FormEvent) {
        event.preventDefault();
        setPending(true);
        setMessage('');
        try {
            await requestJson('admin/study-settings', { method: 'PUT', body: form });
            const loaded = await requestJson<StudySettings>('study-settings');
            setForm(loaded);
            setSaved(loaded);
            setMessage(c('晚自习默认值已保存。', 'Study defaults saved.'));
        }
        catch {
            setMessage(c('无法确认保存结果。请刷新后检查。当前输入已保留。', 'Save could not be confirmed. Refresh to check. Your input is retained.'));
        }
        finally {
            setPending(false);
        }
    }
    return <form className="web-card space-y-4" onSubmit={save}><h2>{c('晚自习默认值', 'Study defaults')}</h2><p>{c('用于新建每日记录的初始值，不会修改已有出勤记录或发送提醒。', 'Initial values for new daily records. Existing attendance records are unchanged and no reminders are sent.')}</p><fieldset disabled={pending} className="space-y-4"><label className="flex gap-2"><input type="checkbox" checked={form.enabled} onChange={event => setForm({ ...form, enabled: event.target.checked })}/>{c('启用', 'Enabled')}</label><div className="flex flex-wrap gap-3">{['日', '一', '二', '三', '四', '五', '六'].map((day, index) => <label className="flex gap-1" key={day}><input type="checkbox" checked={form.days.includes(index)} onChange={event => setForm({ ...form, days: event.target.checked ? [...form.days, index].sort() : form.days.filter(value => value !== index) })}/>{c(`周${day}`, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][index])}</label>)}</div><div className="web-grid"><label className="web-field">{c('开始时间', 'Start time')}<Input type="time" required value={form.startTime} onChange={event => setForm({ ...form, startTime: event.target.value })}/></label><label className="web-field">{c('结束时间', 'End time')}<Input type="time" required value={form.endTime} onChange={event => setForm({ ...form, endTime: event.target.value })}/></label></div></fieldset>{!form.days.length && <p role="alert">{c('请至少选择一天；服务器会把空选择重置为周日至周四。', 'Select at least one day; the server replaces empty selections with Sunday–Thursday.')}</p>}<div className="flex gap-3"><Button disabled={pending || !form.days.length}>{c('保存晚自习默认值', 'Save study defaults')}</Button><Button type="button" variant="outline" disabled={pending} onClick={() => setForm(saved)}>{c('取消', 'Cancel')}</Button></div>{message && <p role="status">{message}</p>}</form>;
}
export function StudySettingsEditor() {
    const { user } = useAuth();
    const query = useQuery({ queryKey: queryKeys.resource(user, 'study-settings'), queryFn: ({ signal }) => requestJson<StudySettings>('study-settings', { signal }) });
    return <><AsyncState pending={query.isPending} error={query.error} retry={() => void query.refetch()}/>{query.isSuccess && <Form initial={query.data}/>}</>;
}
