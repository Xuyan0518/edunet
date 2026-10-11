import fs from 'node:fs';
import crypto from 'node:crypto';
import { sql, databaseKey, stateFile, readState, safeFailure } from './database';
try {
    if (!process.argv.includes('--confirm-dev'))
        throw new Error('Use --confirm-dev only for the designated development database.');
    const catalog = await sql`SELECT id, code, is_required FROM subjects WHERE is_active=true ORDER BY sort_order, name`;
    if (!catalog.some(row => row.code === 'ENGLISH'))
        throw new Error('The development subject catalog needs an active ENGLISH subject before seeding accounts.');
    const generic = catalog.find(row => row.code !== 'ENGLISH');
    const selectedSubjects = catalog.filter(row => row.code === 'ENGLISH' || row.is_required || row.id === generic?.id);
    fs.mkdirSync('.dev', { recursive: true, mode: 0o700 });
    const namespace = `edunet-qa-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(3).toString('hex')}`;
    const person = (role: string) => ({ id: crypto.randomUUID(), email: `${role}.${namespace}@example.test`, name: `QA ${role} ${namespace}`, password: crypto.randomBytes(15).toString('base64url') });
    const state = fs.existsSync(stateFile) ? readState() : { databaseKey, namespace, teacher: person('teacher'), admin: person('admin'), parent: person('parent'), otherParent: person('other-parent'), student: { id: crypto.randomUUID(), name: `QA Student ${namespace}`, grade: 'P3' }, otherStudent: { id: crypto.randomUUID(), name: `QA Other ${namespace}`, grade: 'P3' } };
    if (!fs.existsSync(stateFile))
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
    const { teacher, admin, parent, otherParent, student, otherStudent } = state;
    await sql.transaction([
        sql `INSERT INTO teacher(id,name,display_name,email,password,status,email_verified) VALUES(${teacher.id},${teacher.name},${teacher.name},${teacher.email},${teacher.password},'approved','true') ON CONFLICT(id) DO NOTHING`,
        sql `INSERT INTO admins(id,name,display_name,email,password) VALUES(${admin.id},${admin.name},${admin.name},${admin.email},${admin.password}) ON CONFLICT(id) DO NOTHING`,
        ...[parent, otherParent].map(p => sql `INSERT INTO parents(id,name,display_name,email,password,status,email_verified) VALUES(${p.id},${p.name},${p.name},${p.email},${p.password},'approved','true') ON CONFLICT(id) DO NOTHING`),
        sql `INSERT INTO students(id,name,grade,parent_id) VALUES(${student.id},${student.name},${student.grade},${parent.id}),(${otherStudent.id},${otherStudent.name},${otherStudent.grade},${otherParent.id}) ON CONFLICT(id) DO NOTHING`,
        sql `INSERT INTO student_parent_bindings(id,student_id,parent_id) VALUES(${crypto.randomUUID()},${student.id},${parent.id}),(${crypto.randomUUID()},${otherStudent.id},${otherParent.id}) ON CONFLICT(student_id,parent_id) DO NOTHING`,
        ...[student, otherStudent].flatMap(child => selectedSubjects.map(subject => sql`INSERT INTO student_subjects(id,student_id,subject_id) VALUES(${crypto.randomUUID()},${child.id},${subject.id}) ON CONFLICT(student_id,subject_id) DO NOTHING`))
    ]);
    console.log('Created/reused synthetic dev accounts and two isolated students. Credentials: .dev/accounts.json (gitignored).');
    console.log('Namespace:', state.namespace);
}
catch (error) {
    safeFailure(error);
}
