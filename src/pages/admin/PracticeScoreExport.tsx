import { useMemo, useState } from 'react';
import { ArrowDownToLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWebCopy } from '@/i18n/web';
import { parsePracticeExportRequest, pastMonthRange } from '@/domain/practiceExport';
import { requestDownload } from '@/services/http';
import { saveBlob } from '@/services/downloads';

type ExportStudent = { id: string; name: string; grade: string };
export default function PracticeScoreExport({ students }: { students: ExportStudent[] }) {
  const c = useWebCopy();
  const [scope, setScope] = useState<'selected' | 'grade' | 'all'>('selected');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [grade, setGrade] = useState('');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState(() => pastMonthRange());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const grades = useMemo(() => [...new Set(students.map(student => student.grade).filter(Boolean))].sort(), [students]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const availableIds = useMemo(() => new Set(students.map(student => student.id)), [students]);
  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter(student => `${student.name} ${student.grade}`.toLowerCase().includes(query));
  }, [students, search]);
  const currentIds = selectedIds.filter(id => availableIds.has(id));
  const parsed = parsePracticeExportRequest({ scope, grade, studentIds: currentIds, ...range });
  const count = scope === 'all' ? students.length : scope === 'grade' ? students.filter(student => student.grade === grade).length : currentIds.length;
  const changed = () => { setError(''); setDownloaded(false); };
  const changeDate = (key: 'startDate' | 'endDate', value: string) => {
    setRange(previous => ({ ...previous, [key]: value })); changed();
  };

  return <section className="rounded-md border border-slate-200 bg-white p-4 sm:p-6" aria-labelledby="practice-export-title">
    <h2 id="practice-export-title" className="text-xl font-semibold">{c('导出练习成绩', 'Export practice scores')}</h2>
    <p className="mt-2 text-sm text-slate-600">{c('下载包含每次试卷练习及英语练习成绩的 Excel 文件。零分会保留；未评分的练习显示为空。', 'Download an Excel file with each practice paper and English practice attempt. Zero scores are preserved; unscored attempts are blank.')}</p>
    <fieldset disabled={pending} className="mt-4 space-y-4">
      <legend className="sr-only">{c('导出范围与日期', 'Export scope and dates')}</legend>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-2 text-sm">{c('导出范围', 'Export scope')}
          <select aria-label={c('导出范围', 'Export scope')} className="h-10 rounded-md border border-input bg-background px-3" value={scope} onChange={event => { setScope(event.target.value as typeof scope); changed(); }}>
            <option value="selected">{c('所选学生', 'Selected students')}</option>
            <option value="grade">{c('整个年级', 'Whole grade')}</option>
            <option value="all">{c('所有学生', 'All students')}</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm">{c('开始日期', 'Start date')}
          <Input type="date" value={range.startDate} onInput={event => changeDate('startDate', event.currentTarget.value)} onChange={event => changeDate('startDate', event.currentTarget.value)} />
        </label>
        <label className="grid gap-2 text-sm">{c('结束日期', 'End date')}
          <Input type="date" value={range.endDate} onInput={event => changeDate('endDate', event.currentTarget.value)} onChange={event => changeDate('endDate', event.currentTarget.value)} />
        </label>
      </div>
      {scope === 'grade' && <label className="grid max-w-sm gap-2 text-sm">{c('选择年级', 'Choose grade')}
        <select aria-label={c('选择年级', 'Choose grade')} className="h-10 rounded-md border border-input bg-background px-3" value={grade} onChange={event => { setGrade(event.target.value); changed(); }}>
          <option value="">{c('请选择年级', 'Choose a grade')}</option>
          {grades.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>}
      {scope === 'selected' && <div className="space-y-3">
        <label className="grid max-w-md gap-2 text-sm">{c('查找学生', 'Find students')}
          <Input value={search} placeholder={c('搜索姓名或年级', 'Search name or grade')} onChange={event => setSearch(event.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!matches.length} onClick={() => { setSelectedIds(previous => [...new Set([...previous, ...matches.map(student => student.id)])]); changed(); }}>{c('选择搜索结果', 'Select matching students')}</Button>
          <Button type="button" variant="outline" size="sm" disabled={!selectedIds.length} onClick={() => { setSelectedIds([]); changed(); }}>{c('清空选择', 'Clear selection')}</Button>
        </div>
        <fieldset className="max-h-56 overflow-y-auto rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium">{c('选择要导出的学生', 'Students to export')}</legend>
          {matches.map(student => <label key={student.id} className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 text-sm hover:bg-slate-50">
            <input type="checkbox" checked={selectedSet.has(student.id)} onChange={event => { const checked = event.target.checked; setSelectedIds(previous => checked ? [...previous, student.id] : previous.filter(id => id !== student.id)); changed(); }} />
            <span>{student.name} <span className="text-slate-500">({student.grade})</span></span>
          </label>)}
          {!matches.length && <p className="text-sm text-slate-500">{c('没有符合条件的学生。', 'No matching students.')}</p>}
        </fieldset>
      </div>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={() => { setRange(pastMonthRange()); changed(); }}>{c('重置为过去一个月', 'Reset to past month')}</Button>
        <p className="text-sm text-slate-600" aria-live="polite">{c(`导出 ${count} 位学生`, `${count} students to export`)}{parsed.success ? ` · ${parsed.data.startDate} — ${parsed.data.endDate}` : ''}</p>
      </div>
      <p className="text-xs text-slate-500">{c('默认范围为上个月同日至今天（含首尾日期）。月末会调整为上个月最后一天。清空日期时仍使用默认范围。', 'Defaults to the same day last month through today, including both dates. Month-end dates are clamped. Empty dates use the default range.')}</p>
      {!parsed.success && <p className="text-sm text-slate-600">{scope === 'selected' && !count ? c('请选择至少一位学生。', 'Select at least one student.') : scope === 'grade' && !grade ? c('请选择年级。', 'Choose a grade.') : c('请输入有效日期，开始日期不得晚于结束日期。', 'Enter valid dates with the start on or before the end.')}</p>}
      <Button type="button" disabled={!parsed.success || !count || pending} onClick={async () => {
        if (!parsed.success) return;
        setPending(true); setError(''); setDownloaded(false);
        try {
          const file = await requestDownload('admin/practice-scores/export', { method: 'POST', body: parsed.data });
          saveBlob(file.blob, file.filename); setDownloaded(true);
        } catch (cause) { setError(cause instanceof Error ? cause.message : c('导出失败，请重试。', 'Export failed. Please try again.')); }
        finally { setPending(false); }
      }}><ArrowDownToLine className="mr-2 h-4 w-4" />{pending ? c('正在导出…', 'Exporting…') : c('下载练习成绩 XLSX', 'Download practice scores XLSX')}</Button>
    </fieldset>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {downloaded && <p role="status" className="mt-3 text-sm text-slate-600">{c('Excel 文件已准备好，请查看浏览器下载。', 'Excel file prepared. Check your browser downloads.')}</p>}
  </section>;
}
