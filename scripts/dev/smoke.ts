import fs from 'node:fs';
import assert from 'node:assert/strict';
import { databaseKey, readState, sql, safeFailure } from './database';
// This suite writes ONLY newly-created QA students. Never aim it at a live API.
// AI is opt-in because it calls the configured provider and may incur usage.
const origin = new URL(process.env.TEST_BASE_URL || 'http://127.0.0.1:3001');
const includeAi = process.argv.includes('--ai');
const results: {
    name: string;
    status: string;
    detail?: string;
}[] = [];
const ids: Record<string, string> = {};
type Row = {
    id: string;
    updatedAt: string;
    [key: string]: unknown;
};
type Account = {
    email: string;
    password: string;
};
let currentStep = 'local development server guard';
async function step<T>(name: string, run: () => Promise<T>) {
    currentStep = name;
    const result = await run();
    results.push({ name, status: 'passed' });
    console.log(`PASS ${name}`);
    return result;
}
async function request<T = Row>(path: string, token = '', method = 'GET', body?: unknown, expected?: number): Promise<T> {
    const response = await fetch(new URL(`/api${path}`, origin), {
        method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(path.startsWith('/ai/') ? 240000 : 30000),
        redirect: 'error',
    });
    const text = await response.text();
    let data: unknown;
    try {
        data = text ? JSON.parse(text) : null;
    }
    catch {
        throw new Error(`${method} ${path}: non-JSON response (${response.status})`);
    }
    if (expected !== undefined ? response.status !== expected : !response.ok) {
        throw new Error(`${method} ${path}: HTTP ${response.status}; ${JSON.stringify(data).slice(0, 1000)}`);
    }
    return data as T;
}
async function login(account: Account, role: 'teacher' | 'admin' | 'parent') {
    const data = await request<{
        token: string;
        user: {
            role: string;
        };
    }>(role === 'admin' ? '/admin/login' : '/login', '', 'POST', { ...account, role });
    assert.equal(data.user.role, role);
    assert.ok(data.token);
    return data.token;
}
const versionQuery = (row: Row) => `?updatedAt=${encodeURIComponent(row.updatedAt)}`;
const day = (date: Date) => date.toISOString().slice(0, 10);
try {
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'TEST_BASE_URL must be loopback');
    assert.equal(origin.protocol, 'http:');
    const health = await request<{
        devTesting: boolean;
        notificationsDisabled: boolean;
        databaseKey: string;
    }>('/health');
    assert.equal(health.devTesting, true, 'Start the API with npm run dev:connected or docker-compose');
    assert.equal(health.notificationsDisabled, true, 'Notifications must be disabled');
    assert.equal(health.databaseKey, databaseKey, 'Server and local .env must identify the same development database');
    await sql `SELECT 1 AS connected`;
    const state = readState();
    results.push({ name: currentStep, status: 'passed' });
    const teacher = await step('teacher login', () => login(state.teacher, 'teacher'));
    const admin = await step('admin login', () => login(state.admin, 'admin'));
    const parent = await step('parent login', () => login(state.parent, 'parent'));
    const otherParent = await step('unrelated parent login', () => login(state.otherParent, 'parent'));
    const student = await step('create isolated student with parent binding', () => request('/students', admin, 'POST', {
        name: `QA Connected ${new Date().toISOString()}`, grade: 'P3', parentIds: [state.parent.id],
    }, 201));
    ids.student = student.id;
    const studentPath = `/students/${student.id}`;
    const now = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())}T12:00:00Z`);
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - start.getUTCDay());
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const date = day(now), weekStarting = day(start), weekEnding = day(end);
    const subjects = await step('fetch subjects and assign to test student', async () => {
        const catalog = await request<Row[]>('/subjects', teacher);
        assert.ok(catalog.some(row => row.code === 'ENGLISH'), 'ENGLISH catalog subject is required');
        let generic = catalog.find(row => row.code !== 'ENGLISH');
        if (!generic)
            generic = await request('/subjects', admin, 'POST', { code: `QA_${Date.now()}`, name: 'QA Mathematics' }, 201);
        const selected = [catalog.find(row => row.code === 'ENGLISH')!.id, generic.id];
        await request(`${studentPath}/subjects`, admin, 'PUT', { subjectIds: selected, resetProgress: 'keep' });
        const assigned = await request<string[]>(`${studentPath}/subjects`, teacher);
        assert.ok(selected.every(id => assigned.includes(id)));
        return { english: catalog.find(row => row.code === 'ENGLISH')!, generic };
    });
    const dailyBody = {
        studentId: student.id, date, attendance: 'present', attendanceStart: '18:00', attendanceEnd: '21:00',
        summary: 'Synthetic QA daily progress', activities: [{ subjectId: subjects.generic.id, subjectName: subjects.generic.name, type: 'generic',
                taskSummary: 'Completed ten fraction exercises', strengths: 'Equivalent fractions are accurate', improvements: 'Explain each simplification step' }],
    };
    let daily = await step('daily create and persisted fetch', async () => {
        const created = await request('/progress', teacher, 'POST', dailyBody, 201);
        ids.daily = created.id;
        const loaded = await request(`/progress/student?studentId=${student.id}&date=${date}`, teacher);
        assert.equal(loaded.id, created.id);
        assert.equal(loaded.summary, dailyBody.summary);
        return loaded;
    });
    daily = await step('admin daily edit and stale-version rejection', async () => {
        const edited = await request(`/progress/${daily.id}`, admin, 'PUT', { ...dailyBody, updatedAt: daily.updatedAt, summary: 'QA administrator reviewed daily progress' });
        await request(`/progress/${daily.id}`, teacher, 'PUT', { ...dailyBody, updatedAt: '2000-01-01T00:00:00.000Z' }, 409);
        return edited;
    });
    await step('daily delete, absence, and bin restore', async () => {
        await request(`/progress/${daily.id}${versionQuery(daily)}`, teacher, 'DELETE');
        await request(`/progress/student?studentId=${student.id}&date=${date}`, teacher, 'GET', undefined, 404);
        await request(`${studentPath}/bin/restore`, admin, 'POST', { recordType: 'dailyProgress', recordId: daily.id });
        assert.equal((await request(`/progress/student?studentId=${student.id}&date=${date}`, teacher)).id, daily.id);
    });
    await step('exam create, admin update, and parent read', async () => {
        const body = { name: 'QA Fractions WA1', examDate: date, examType: 'WA1', subjects: [{ name: subjects.generic.name, score: '8/10', scope: 'Fractions', examDate: date }] };
        const exam = await request(`${studentPath}/exams`, teacher, 'POST', body, 201);
        ids.exam = exam.id;
        await request(`/exams/${exam.id}`, admin, 'PUT', { ...body, updatedAt: exam.updatedAt, name: 'QA Reviewed WA1' });
        assert.ok((await request<Row[]>(`${studentPath}/exams`, parent)).some(row => row.id === exam.id));
    });
    await step('practice create, admin update, and parent read', async () => {
        const types = await request<Row[]>('/paper-types', teacher);
        const schools = await request<Row[]>('/paper-schools', teacher);
        const type = types[0] || await request('/paper-types', admin, 'POST', { name: `QA Practice ${Date.now()}` }, 201);
        const school = schools[0] || await request('/paper-schools', admin, 'POST', { name: `QA School ${Date.now()}` }, 201);
        const body = { subjectId: subjects.generic.id, subjectName: subjects.generic.name, date, typeId: type.id, schoolId: school.id,
            description: 'QA fractions practice', strengths: 'Clear workings', improvements: 'Check final answers', score: 0, total: 10 };
        const paper = await request(`${studentPath}/papers`, teacher, 'POST', body, 201);
        ids.paper = paper.id;
        await request(`${studentPath}/papers/${paper.id}`, admin, 'PUT', { ...body, updatedAt: paper.updatedAt, score: 8 });
        assert.ok((await request<Row[]>(`${studentPath}/papers`, parent)).some(row => row.id === paper.id));
    });
    let weeklySummary = 'QA weekly feedback about fractions and practice';
    if (includeAi)
        weeklySummary = await step('real weekly AI summary', async () => {
            const generated = await request<{
                summary: string;
            }>('/ai/weekly-summary', teacher, 'POST', { studentId: student.id, weekStarting, weekEnding });
            assert.ok(generated.summary?.trim());
            return generated.summary;
        });
    else
        results.push({ name: 'real weekly AI summary', status: 'skipped', detail: 'Run with --ai to call the configured provider' });
    const weeklyBody = { studentId: student.id, weekStarting, weekEnding, summary: weeklySummary, strengths: ['Fractions'], areasToImprove: ['Show workings'], teacherNotes: 'QA private teacher note', nextWeekFocus: 'Fraction word problems' };
    let weekly = await step('weekly create, fetch, and parent draft exclusion', async () => {
        const created = await request('/feedback', teacher, 'POST', weeklyBody, 201);
        ids.weekly = created.id;
        assert.equal((await request(`/feedback/one?studentId=${student.id}&weekStarting=${weekStarting}`, teacher)).id, created.id);
        assert.ok(!(await request<Row[]>(`/feedback/list?studentId=${student.id}`, parent)).some(row => row.id === created.id));
        return created;
    });
    weekly = await step('admin weekly edit and stale-version rejection', async () => {
        const edited = await request(`/feedback/${weekly.id}`, admin, 'PUT', { ...weeklyBody, updatedAt: weekly.updatedAt, summary: `${weeklySummary}\nQA admin reviewed.` });
        await request(`/feedback/${weekly.id}`, teacher, 'PUT', { ...weeklyBody, updatedAt: '2000-01-01T00:00:00.000Z' }, 409);
        return edited;
    });
    await step('weekly delete, absence, and bin restore', async () => {
        await request(`/feedback/${weekly.id}${versionQuery(weekly)}`, teacher, 'DELETE');
        assert.equal(await request(`/feedback/one?studentId=${student.id}&weekStarting=${weekStarting}`, teacher), null);
        await request(`${studentPath}/bin/restore`, admin, 'POST', { recordType: 'weeklyReport', recordId: weekly.id });
    });
    await step('admin weekly review, publish, and parent visibility', async () => {
        const review = await request<{
            pending: Row[];
        }>('/admin/feedback-review', admin);
        assert.ok(review.pending.some(row => row.id === weekly.id));
        await request(`/admin/feedback-review/weekly/${weekly.id}/publish`, admin, 'POST');
        assert.ok((await request<Row[]>(`/feedback/list?studentId=${student.id}`, parent)).some(row => row.id === weekly.id));
    });
    const report = await step(includeAi ? 'real AI report generation and draft persistence' : 'manual report draft persistence (AI skipped)', async () => {
        if (includeAi) {
            const generated = await request<{
                reportId: string;
                parseError?: string;
            }>('/ai/quarterly-summary', teacher, 'POST', { studentId: student.id, startDate: weekStarting, endDate: weekEnding, saveReport: true });
            assert.ok(generated.reportId);
            ids.report = generated.reportId;
            assert.ok(!generated.parseError, `AI report parse error: ${generated.parseError}`);
            return request(`/reports/${generated.reportId}`, teacher);
        }
        return request('/reports', teacher, 'POST', { studentId: student.id, reportType: 'quarterly', startDate: weekStarting, endDate: weekEnding, title: 'QA learning report', summary: weeklySummary, status: 'draft', visibleToParent: false }, 201);
    });
    ids.report = report.id;
    await step('admin report review, update, publish, and parent read', async () => {
        assert.ok(!(await request<Row[]>(`${studentPath}/reports`, parent)).some(row => row.id === report.id));
        await request(`/reports/${report.id}`, admin);
        await request(`/reports/${report.id}`, admin, 'PATCH', { title: 'QA Administrator reviewed report', summary: 'QA reviewed learning report', status: 'final' });
        await request(`/reports/${report.id}/visibility`, admin, 'PATCH', { visibleToParent: true });
        assert.ok((await request<Row[]>(`${studentPath}/reports`, parent)).some(row => row.id === report.id));
        assert.equal((await request(`/reports/${report.id}`, parent)).title, 'QA Administrator reviewed report');
    });
    await step('parent own profile access, cross-child denial, and write denial', async () => {
        assert.equal((await request(studentPath, parent)).id, student.id);
        for (const path of [studentPath, `${studentPath}/exams`, `${studentPath}/papers`, `${studentPath}/reports`, `/feedback/list?studentId=${student.id}`, `/reports/${report.id}`]) {
            await request(path, otherParent, 'GET', undefined, 403);
        }
        await request('/progress', parent, 'POST', dailyBody, 403);
        await request('/feedback', parent, 'POST', weeklyBody, 403);
        await request(`/admin/students/${student.id}/records-export`, parent, 'GET', undefined, 403);
    });
    await step('admin XLSX download', async () => {
        const response = await fetch(new URL(`/api/admin/students/${student.id}/records-export`, origin), { headers: { Authorization: `Bearer ${admin}` }, redirect: 'error', signal: AbortSignal.timeout(30000) });
        assert.equal(response.status, 200);
        assert.ok(response.headers.get('content-type')?.includes('spreadsheetml.sheet'));
        assert.ok(response.headers.get('content-disposition')?.includes('.xlsx'));
        const buffer = Buffer.from(await response.arrayBuffer());
        assert.equal(buffer.readUInt32LE(), 0x04034b50);
        fs.writeFileSync('.dev/student-records.xlsx', buffer, { mode: 0o600 });
    });
    await step('direct dev database confirms API writes persisted', async () => {
        const [row] = await sql `SELECT s.id, d.summary, w.visible_to_parent AS weekly_visible, r.visible_to_parent AS report_visible FROM students s JOIN daily_progress d ON d.student_id=s.id JOIN weekly_feedback w ON w.student_id=s.id JOIN student_reports r ON r.student_id=s.id WHERE s.id=${student.id} AND d.id=${daily.id} AND w.id=${weekly.id} AND r.id=${report.id}`;
        assert.equal(row?.id, student.id);
        assert.equal(row?.weekly_visible, true);
        assert.equal(row?.report_visible, true);
    });
}
catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name: currentStep, status: 'failed', detail });
    safeFailure(error);
}
finally {
    fs.mkdirSync('.dev', { recursive: true, mode: 0o700 });
    if (fs.existsSync('.dev/api-results.json')) {
        const previous = JSON.parse(fs.readFileSync('.dev/api-results.json', 'utf8'));
        fs.mkdirSync('.dev/runs', { recursive: true, mode: 0o700 });
        fs.writeFileSync(`.dev/runs/${String(previous.time).replace(/[^0-9A-Za-z]/g, '-')}.json`, JSON.stringify(previous, null, 2), { mode: 0o600 });
    }
    fs.writeFileSync('.dev/api-results.json', JSON.stringify({ time: new Date().toISOString(), baseUrl: origin.origin, aiRequested: includeAi, ids, results }, null, 2), { mode: 0o600 });
    console.log('Evidence: .dev/api-results.json.');
    console.log(ids.student ? 'The new QA student remains for browser inspection; no existing records were overwritten.' : 'No test student or business records were created.');
}
