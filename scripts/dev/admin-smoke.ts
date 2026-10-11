import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { databaseKey, readState, sql, safeFailure } from './database';

const origin = new URL(process.env.TEST_BASE_URL || 'http://127.0.0.1:3001');
const results: { name: string; status: string; detail?: string }[] = [];
const ids: Record<string, string> = {};
let currentStep = 'dev server guard';
let token = '';
type Row = { id: string; updatedAt?: string; [key: string]: unknown };
async function request<T = Row>(path: string, method = 'GET', body?: unknown, expected?: number): Promise<T> {
  const response = await fetch(new URL(`/api${path}`, origin), { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(30_000) });
  const data = await response.json();
  assert.ok(expected !== undefined ? response.status === expected : response.ok, `${method} ${path}: ${response.status} ${JSON.stringify(data).slice(0, 700)}`);
  return data;
}
async function step<T>(name: string, action: () => Promise<T>) {
  currentStep = name;
  const result = await action();
  results.push({ name, status: 'passed' });
  console.log(`PASS ${name}`);
  return result;
}
try {
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname));
  assert.equal(origin.protocol, 'http:');
  const health = await request('/health');
  assert.equal(health.devTesting, true);
  assert.equal(health.notificationsDisabled, true);
  assert.equal(health.databaseKey, databaseKey);
  const state = readState();
  const login = await request<{ token: string }>('/admin/login', 'POST', { email: state.admin.email, password: state.admin.password });
  token = login.token;
  assert.ok(token);
  const suffix = crypto.randomBytes(5).toString('hex');
  const grade = `QA-${suffix}`;
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const student = await step('admin student create/update with retained primary binding', async () => {
    const row = await request('/students', 'POST', { name: `QA Admin ${suffix}`, grade, parentIds: [state.parent.id] }, 201);
    ids.student = row.id;
    const updated = await request(`/students/${row.id}`, 'PUT', { name: `QA Admin Reviewed ${suffix}`, grade, parentIds: [state.parent.id] });
    assert.deepEqual(updated.parentIds, [state.parent.id]);
    return updated;
  });
  const path = `/students/${student.id}`;
  await step('admin settings, directories, cycles, and review endpoints load', async () => {
    for (const endpoint of ['/admin/english-tasks', '/study-settings', '/parents', '/admin/users', '/admin/pending', '/academic-terms', '/weekly-cycles', '/admin/feedback-review']) await request(endpoint);
  });
  const subject = await step('admin curriculum level/subject/topic create and edit', async () => {
    const level = await request('/subject-levels', 'POST', { name: `QA Level ${suffix}`, description: 'Synthetic test level', sortOrder: 999 }, 201); ids.level = level.id;
    await request(`/subject-levels/${level.id}`, 'PUT', { name: `QA Level ${suffix}`, description: 'Reviewed synthetic level', sortOrder: 998, isActive: true });
    const body = { code: `QA_${suffix.toUpperCase()}`, name: `QA Subject ${suffix}`, levelId: level.id, isRequired: false, isActive: true };
    const created = await request('/subjects', 'POST', body, 201); ids.subject = created.id;
    await request(`/subjects/${created.id}`, 'PUT', { ...body, name: `QA Reviewed Subject ${suffix}` });
    const topic = await request(`/subjects/${created.id}/topics`, 'POST', { code: '001.010', title: 'QA chapter', orderIndex: '001.010' }, 201); ids.topic = topic.id;
    await request(`/topics/${topic.id}`, 'PUT', { code: '001.010', title: 'QA reviewed chapter', orderIndex: '001.010', subjectId: created.id });
    return created;
  });
  await step('admin assigns subjects and changes chapter completion', async () => {
    await request(`${path}/subjects`, 'PUT', { subjectIds: [subject.id], resetProgress: 'keep' });
    await request(`${path}/topics/${ids.topic}/progress`, 'PUT', { definitionRecited: true, chapterExerciseCompleted: true });
    const [progress] = await sql`SELECT status, definition_recited, chapter_exercise_completed FROM student_topic_progress WHERE student_id=${student.id} AND topic_id=${ids.topic}`;
    assert.equal(progress.status, 'completed');
    assert.equal(progress.definition_recited, true);
    assert.equal(progress.chapter_exercise_completed, true);
  });
  await step('admin student English task edit and reset', async () => {
    const original = await request<{ tasks: Record<string, unknown>[] }>(`${path}/english-tasks`);
    assert.ok(original.tasks.length);
    const tasks = original.tasks.map((task, index) => index === 0 ? { ...task, displayName: `QA English ${suffix}`, weeklyTargetCount: 0 } : task);
    await request(`${path}/english-tasks`, 'PUT', { tasks });
    const saved = await request<{ tasks: Record<string, unknown>[] }>(`${path}/english-tasks`);
    assert.equal(saved.tasks[0].weeklyTargetCount, 0);
    assert.equal(saved.tasks[0].displayName, `QA English ${suffix}`);
    await request(`${path}/english-tasks/reset`, 'POST');
    assert.equal((await request(`${path}/english-tasks`)).isDefault, true);
  });
  await step('admin grade plan and student zero-score completion', async () => {
    const current = await request<{ cycle: { startDate: string; endDate: string } }>(`/grade-weekly-plans?weekStarting=${date}`);
    const plan = await request<{ plan: Row }>('/grade-weekly-plans', 'POST', { grade, topic: 'QA chapter review', notes: 'Synthetic grade only', weekStarting: current.cycle.startDate, weekEnding: current.cycle.endDate }, 201);
    ids.plan = plan.plan.id;
    await request('/student-weekly-plan-records', 'POST', { studentId: student.id, gradeWeeklyPlanId: plan.plan.id, score: 0, completed: true, comment: 'QA zero is a recorded score' }, 201);
    const saved = await request<{ completed: boolean; record: { score: number } }>(`${path}/weekly-plan-record?weekStarting=${date}`);
    assert.equal(saved.completed, true); assert.equal(saved.record.score, 0);
    await request(`/admin/weekly-plan-summary?weekStarting=${date}`);
    await request(`/admin/term-plan-summary?startDate=${date}&endDate=${date}`);
  });
  await step('all three admin plan exports return actual workbooks', async () => {
    const exports = [
      [`/admin/weekly-plan-summary/export?weekStarting=${date}`, 'weekly-plan.xls'],
      [`/admin/term-plan-summary/export?startDate=${date}&endDate=${date}`, 'term-plan.xls'],
      [`/admin/learning-task-completion/export?startDate=${date}&endDate=${date}`, 'task-completion.xlsx'],
    ];
    for (const [endpoint, name] of exports) {
      const response = await fetch(new URL(`/api${endpoint}`, origin), { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30_000) });
      assert.equal(response.status, 200, endpoint);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (name.endsWith('.xlsx')) assert.equal(bytes.readUInt32LE(), 0x04034b50);
      else assert.ok(bytes.toString().includes('<Workbook'));
      fs.writeFileSync(`.dev/${name}`, bytes, { mode: 0o600 });
    }
  });
  await step('admin approval/rejection and identity-role changes with secondary-parent protection', async () => {
    const id = crypto.randomUUID(), identity = `qa-synthetic-${suffix}`;
    ids.account = id;
    await sql`INSERT INTO teacher(id,name,display_name,status,wechat_open_id) VALUES(${id},${'QA Identity '+suffix},${'QA Identity '+suffix},'pending',${identity})`;
    assert.ok(JSON.stringify(await request('/admin/pending')).includes(id));
    await request('/admin/approve', 'POST', { id, role: 'teacher' });
    assert.equal((await sql`SELECT status FROM teacher WHERE id=${id}`)[0].status, 'approved');
    await request('/admin/reject', 'POST', { id, role: 'teacher' });
    assert.equal((await sql`SELECT status FROM teacher WHERE id=${id}`)[0].status, 'rejected');
    await request('/admin/approve', 'POST', { id, role: 'teacher' });
    await request('/admin/users/set-roles', 'POST', { sourceRole: 'teacher', sourceId: id, roles: ['teacher', 'parent'], displayName: `QA Identity ${suffix}` });
    const [parent] = await sql`SELECT id FROM parents WHERE wechat_open_id=${identity}`;
    assert.ok(parent?.id); ids.secondaryParent = parent.id;
    await request(`${path}/parents`, 'POST', { parentId: parent.id }, 201);
    const bound = await request(path);
    assert.ok((bound.parentIds as string[]).includes(state.parent.id));
    assert.ok((bound.parentIds as string[]).includes(parent.id));
    await request('/admin/users/set-roles', 'POST', { sourceRole: 'teacher', sourceId: id, roles: ['teacher'] }, 400);
    assert.equal((await sql`SELECT count(*)::int AS count FROM parents WHERE id=${parent.id}`)[0].count, 1);
    await request(`${path}/parents/${parent.id}`, 'DELETE');
    await request('/admin/users/set-roles', 'POST', { sourceRole: 'teacher', sourceId: id, roles: ['teacher'] });
    assert.equal((await sql`SELECT count(*)::int AS count FROM parents WHERE id=${parent.id}`)[0].count, 0);
  });
  await step('real student cascade removes only the new QA student and its relations', async () => {
    await request(`${path}/english-tasks`, 'PUT', { tasks: [{ id: 'qa', key: 'custom_qa', displayName: 'QA task', englishName: 'QA', chineseName: '测试', enabled: true, enabledFields: ['practiceCount'], weeklyTargetCount: 1, sortOrder: 0 }] });
    await request(path, 'DELETE');
    await request(path, 'GET', undefined, 404);
    for (const table of ['student_parent_bindings', 'student_subjects', 'student_topic_progress', 'student_english_task_configs', 'student_weekly_plan_records']) {
      const rows = await sql(`SELECT count(*)::int AS count FROM ${table} WHERE student_id=$1`, [student.id]);
      assert.equal(rows[0].count, 0, table);
    }
    assert.equal((await request(`/students/${state.student.id}`)).id, state.student.id);
  });
  await step('remove only the curriculum and account rows created by this test', async () => {
    await request(`/topics/${ids.topic}`, 'DELETE');
    await request(`/subjects/${ids.subject}`, 'DELETE');
    await request(`/subject-levels/${ids.level}`, 'DELETE');
    await request(`/teachers/${ids.account}`, 'DELETE');
    // Grade plans have no delete route. Delete only this script's exact new row.
    await sql`DELETE FROM grade_weekly_plans WHERE id=${ids.plan} AND grade=${grade}`;
  });
} catch (error) {
  results.push({ name: currentStep, status: 'failed', detail: error instanceof Error ? error.message : String(error) });
  safeFailure(error);
} finally {
  fs.mkdirSync('.dev', { recursive: true, mode: 0o700 });
  fs.writeFileSync('.dev/admin-results.json', JSON.stringify({ time: new Date().toISOString(), ids, results }, null, 2), { mode: 0o600 });
  console.log('Evidence: .dev/admin-results.json');
}
