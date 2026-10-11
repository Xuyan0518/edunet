import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { queryKeys } from '@/app/queryKeys';
import { requestJson, ApiError } from '@/services/http';
import { useWebCopy } from '@/i18n/web';
import { AsyncState } from '@/components/shared/AsyncState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { makeTask, presets, tasksPayload, validateTasks, type EnglishTask, type TaskField, type TaskSettings } from './contracts';
function Editor({ initial, endpoint, globalScope }: {
    initial: TaskSettings;
    endpoint: string;
    globalScope: boolean;
}) {
    const c = useWebCopy();
    const { user } = useAuth();
    const cache = useQueryClient();
    const [tasks, setTasks] = useState(() => structuredClone(initial.tasks));
    const [snapshot, setSnapshot] = useState(initial);
    const [pending, setPending] = useState(false);
    const [message, setMessage] = useState('');
    const [unknownOutcome, setUnknownOutcome] = useState(false);
    const [preset, setPreset] = useState('custom');
    const dirty = JSON.stringify(tasks) !== JSON.stringify(snapshot.tasks);
    const update = (index: number, patch: Partial<EnglishTask>) => setTasks(tasks.map((task, i) => i === index ? { ...task, ...patch } : task));
    function move(index: number, direction: number) {
        const next = [...tasks];
        const target = index + direction;
        if (target < 0 || target >= next.length)
            return;
        [next[index], next[target]] = [next[target], next[index]];
        setTasks(next.map((task, sortOrder) => ({ ...task, sortOrder })));
    }
    async function reload() {
        setPending(true);
        try {
            const loaded = await requestJson<TaskSettings>(endpoint);
            setTasks(structuredClone(loaded.tasks));
            setSnapshot(loaded);
            setUnknownOutcome(false);
            setMessage('');
            cache.setQueryData(queryKeys.resource(user, endpoint), loaded);
        }
        catch {
            setMessage(c('刷新失败。当前输入仍保留。', 'Refresh failed. Your entered values are retained.'));
        }
        finally {
            setPending(false);
        }
    }
    async function write(reset = false) {
        if (pending || unknownOutcome)
            return;
        setPending(true);
        setMessage('');
        let confirmed = false;
        try {
            await requestJson<TaskSettings>(reset ? `${endpoint}/reset` : endpoint, { method: reset ? 'POST' : 'PUT', ...(reset ? {} : { body: tasksPayload(tasks) }) });
            confirmed = true;
            const loaded = await requestJson<TaskSettings>(endpoint);
            setTasks(structuredClone(loaded.tasks));
            setSnapshot(loaded);
            cache.setQueryData(queryKeys.resource(user, endpoint), loaded);
            setMessage(c('配置已保存并刷新。', 'Configuration saved and reloaded.'));
        }
        catch (error) {
            const knownFailure = error instanceof ApiError && error.status < 500 && !confirmed;
            setUnknownOutcome(!knownFailure);
            setMessage(confirmed ? c('保存已成功，但刷新失败。请重新加载配置确认结果。', 'Saved, but reload failed. Reload the configuration to confirm.') : error instanceof ApiError && error.status === 409 ? c('配置正在被修改。输入已保留，请稍后重试或重新加载。', 'Configuration is being changed. Your input is retained; retry later or reload.') : c('无法确认保存结果。输入已保留，请重新加载配置。', 'Save could not be confirmed. Your input is retained; reload the configuration.'));
        }
        finally {
            setPending(false);
        }
    }
    const fieldLabels: [
        TaskField,
        string
    ][] = [['practiceCount', c('练习次数', 'Practice count')], ['score', c('分数', 'Score')], ['problems', c('问题记录', 'Problems')]];
    return <form className="space-y-5" onSubmit={event => { event.preventDefault(); void write(); }}>
    <div className="web-card"><p>{snapshot.isDefault ? c('默认配置', 'Default configuration') : c('自定义配置', 'Custom configuration')}</p><p className="text-sm text-muted-foreground">{c('这里设置每日英文项目。工作台未完成队列使用独立的周期目标；此配置不会修改历史记录。', 'These settings configure daily English tasks. The dashboard uses separate cycle targets; this configuration does not change historical records.')}</p></div>
    <fieldset disabled={pending || unknownOutcome} className="space-y-4">
      {tasks.map((task, index) => <section key={task.id} className="web-card space-y-4">
        <div className="flex flex-wrap justify-between gap-3"><h2>{index + 1}. {task.displayName}</h2><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`${c('上移', 'Move up')} ${task.displayName}`}>↑</Button><Button type="button" variant="outline" size="sm" disabled={index === tasks.length - 1} onClick={() => move(index, 1)} aria-label={`${c('下移', 'Move down')} ${task.displayName}`}>↓</Button><Button type="button" variant="outline" size="sm" disabled={tasks.length === 1} onClick={() => setTasks(tasks.filter((_, i) => i !== index))}>{c('移除项目', 'Remove task')}</Button></div></div>
        <label className="flex gap-2"><input type="checkbox" checked={task.enabled} onChange={event => update(index, { enabled: event.target.checked })}/>{c('启用', 'Enabled')}</label>
        <div className="web-grid"><label className="web-field">{c('中文名', 'Chinese name')}<Input maxLength={80} value={task.chineseName} onChange={event => update(index, { chineseName: event.target.value })}/></label><label className="web-field">{c('英文名', 'English name')}<Input maxLength={80} value={task.englishName} onChange={event => update(index, { englishName: event.target.value })}/></label><label className="web-field">{c('显示名称', 'Display name')}<Input required maxLength={120} value={task.displayName} onChange={event => update(index, { displayName: event.target.value })}/></label><label className="web-field">{c('每周目标次数', 'Weekly target count')}<Input type="number" min={0} max={500} step={1} required value={Number.isNaN(task.weeklyTargetCount) ? '' : task.weeklyTargetCount} onChange={event => update(index, { weeklyTargetCount: event.target.value === '' ? NaN : Number(event.target.value) })}/></label></div>
        <fieldset><legend>{c('填写字段（至少一项）', 'Entry fields (at least one)')}</legend><div className="flex flex-wrap gap-4">{fieldLabels.map(([field, label]) => <label key={field} className="flex gap-2"><input type="checkbox" checked={task.enabledFields.includes(field)} disabled={task.enabledFields.length === 1 && task.enabledFields.includes(field)} onChange={event => update(index, { enabledFields: event.target.checked ? [...task.enabledFields, field] : task.enabledFields.filter(value => value !== field) })}/>{label}</label>)}</div></fieldset>
      </section>)}
      <div className="flex flex-wrap gap-3 items-end"><label className="web-field">{c('添加任务类型', 'Task preset')}<select value={preset} onChange={event => setPreset(event.target.value)}>{presets.map(([key, zh, en]) => <option key={key} value={key}>{c(zh, en)}</option>)}</select></label><Button type="button" variant="outline" disabled={tasks.length >= 30} onClick={() => { const next = makeTask(preset, tasks.length, crypto.randomUUID()); setTasks([...tasks, next]); setPreset('custom'); }}>{c('添加项目', 'Add task')}</Button></div>
    </fieldset>
    {message && <p role="status">{message}</p>}
    <div className="flex flex-wrap gap-3"><Button disabled={pending || unknownOutcome || !dirty || !validateTasks(tasks)}>{pending ? c('保存中…', 'Saving…') : c('保存配置', 'Save configuration')}</Button><Button type="button" variant="outline" disabled={pending} onClick={() => { setTasks(structuredClone(snapshot.tasks)); setMessage(''); }}>{c('取消修改', 'Cancel edits')}</Button>
      <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="outline" disabled={pending || unknownOutcome}>{c('重置默认', 'Reset defaults')}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogTitle>{globalScope ? c('重置全局英文配置？', 'Reset global English configuration?') : c('清除该学生的配置覆盖？', 'Clear this student’s configuration override?')}</AlertDialogTitle><AlertDialogDescription>{globalScope ? c('将采用内置默认配置。历史每日记录、章节进度和周期目标保持原样。', 'Use built-in defaults. Historical daily records, chapter progress and cycle targets remain intact.') : c('将采用当前全局配置。历史每日记录、章节进度和周期目标保持原样。', 'Use the current global configuration. Historical daily records, chapter progress and cycle targets remain intact.')}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>{c('取消', 'Cancel')}</AlertDialogCancel><AlertDialogAction onClick={() => void write(true)}>{c('确认重置', 'Confirm reset')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      {unknownOutcome && <Button type="button" variant="outline" disabled={pending} onClick={() => void reload()}>{c('加载服务器配置（替换当前输入）', 'Load server configuration (replace input)')}</Button>}
    </div>
  </form>;
}
export function EnglishTasksEditor({ studentId }: {
    studentId?: string;
}) {
    const { user } = useAuth();
    const endpoint = studentId ? `students/${encodeURIComponent(studentId)}/english-tasks` : 'admin/english-tasks';
    const query = useQuery({ queryKey: queryKeys.resource(user, endpoint), queryFn: ({ signal }) => requestJson<TaskSettings>(endpoint, { signal }) });
    return <><AsyncState pending={query.isPending} error={query.error} retry={() => void query.refetch()}/>{query.isSuccess && <Editor key={endpoint} initial={query.data} endpoint={endpoint} globalScope={!studentId}/>}</>;
}
