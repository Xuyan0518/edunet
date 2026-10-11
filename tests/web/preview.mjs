import { featureFixtures } from './featureFixtures.mjs';
// Isolated browser fixture server. No app server, environment files, database or sends.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
const students = [
  { id: 'child-1', name: '林小雨', grade: 'P3', parentId: 'parent-primary', parentIds: ['parent-primary', 'parent'], createdAt: '2026-01-01' },
  { id: 'child-2', name: '林小禾', grade: 'P5', parentId: 'parent', parentIds: ['parent'], createdAt: '2026-01-01' },
];
const users = {
  teacher: { id: 'teacher', name: '陈老师', role: 'teacher', status: 'approved' },
  manager: { id: 'manager', name: '管理教师', role: 'teacher', status: 'approved', canManageStudentsAndParents: true },
  parent: { id: 'parent', name: '林家长', role: 'parent', status: 'approved' },
  admin: { id: 'admin', name: '管理员', role: 'admin', status: 'approved' },
  reviewer: { id: 'reviewer', name: '体验教师', role: 'teacher', status: 'approved', isReviewer: true, reviewerStudentId: 'child-1' },
};
const levels=[{id:'primary',name:'Primary',description:'Fixture level',sortOrder:0,isDefault:true,isActive:true}];
const topics=[{id:'t1',subjectId:'english',code:'R1',title:'Reading foundations',parentTopicId:null,orderIndex:'1.01'}];
const parents=[{id:'parent',name:'林家长',status:'approved'},{id:'parent-primary',name:'林先生',status:'approved'},{id:'parent-unlinked',name:'未关联家长',status:'approved'}];
const subjects = [{ id: 'english', name: 'English', code: 'ENGLISH', level: 'Primary',levelId:'primary',isActive:true,sortOrder:0, isRequired: true }, { id: 'math', name: '数学', code: 'MATH', level: 'Primary',levelId:'primary',isActive:true,sortOrder:1 }];
const dailyRecords=new Map();
const weeklyRecords=new Map();
const gradePlans=[];const planRecords=[];
const fixtureCycle={startDate:"2026-09-27",endDate:"2026-10-01"};
const papers=[]; const exams=[];let fixtureSequence=0;
const paperTypes=[{id:'type-1',name:'Practice'}];const paperSchools=[{id:'school-1',name:'Fixture School'}];
const assignments = new Map(students.map(student => [student.id, ['english', 'math']]));
const defaultTasks = [['editing','改错','Editing',5],['reading','阅读理解','Reading',5],['grammar','语法','Grammar',5],['vocab','词汇','Vocab',50],['recitation','单词句子背诵','Recitation',5],['essay','作文','Essay',1]].map(([key,zh,en,target],sortOrder) => ({id:key,key,chineseName:zh,englishName:en,displayName:`${zh} (${en})`,weeklyTargetCount:target,enabled:true,enabledFields:['practiceCount','score','problems'],sortOrder}));
let globalTasks = structuredClone(defaultTasks);
const taskOverrides = new Map();
let studySettings = { enabled:true, days:[0,1,2,3,4], startTime:'18:00', endTime:'21:00' };
const extraFixtures=featureFixtures(users,students);
const fixture = {
  name: 'isolated-fixtures',
  configureServer(server) {
    server.middlewares.use('/api', async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const send = (value, status = 200) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
      let body = {}; if (req.method !== 'GET') { let text = ''; for await (const chunk of req) text += chunk; try { body = JSON.parse(text || '{}'); } catch { return send({}, 400); } }
      if (['/login', '/admin/login', '/auth/reviewer-login'].includes(url.pathname)) {
        const key = url.pathname.includes('reviewer') ? 'reviewer' : String(body.email || '').split('@')[0];
        if (body.password !== 'fixture-only' || !users[key]) return send({ error: 'Invalid fixture credentials' }, 401);
        return send({ token: `fixture:${key}`, user: users[key] });
      }
      const key = String(req.headers.authorization || '').replace('Bearer fixture:', ''); const user = users[key];
      if (!user) return send({ error: 'Unauthorized' }, 401);
      if(await extraFixtures({url,req,res,body,user,send}))return;
      if (url.pathname === '/profile') { if (req.method === 'PUT') user.name = user.displayName = body.displayName; return send({ user }); }
      if (url.pathname === '/students') {
        if (req.method === 'POST') { const student = { ...body, id: `child-${students.length + 1}`, createdAt: '2026-10-03' }; students.push(student); assignments.set(student.id, ['english']); return send(student, 201); }
        return send(user.isReviewer ? students.slice(0, 1) : students);
      }
      const match = url.pathname.match(/^\/students\/([^/]+)(.*)$/);
      if (match) {
        const student = students.find(student => student.id === match[1]); if (!student || (user.isReviewer && student.id !== user.reviewerStudentId)) return send({ error: 'Forbidden' }, 403);
        if (!match[2]) { if (req.method === 'PUT') Object.assign(student, body); return send(student); }
        if(match[2]==='/weekly-plan-record'){const plan=gradePlans.find(row=>row.grade===student.grade)||null;const record=plan?planRecords.find(row=>row.studentId===student.id&&row.gradeWeeklyPlanId===plan.id)||null:null;return send({cycle:fixtureCycle,student,plan,record,completed:!!record?.completed&&record.score!==null});}
        if (match[2] === '/papers/batch' && req.method==='PUT') {
          const current=papers.filter(row=>row.studentId===student.id&&row.date===body.date);
          const latest=current.map(row=>row.updatedAt).sort().at(-1)||null;
          if(latest!==(body.expectedUpdatedAt||null))return send({error:'CONFLICT',updatedAt:latest},409);
          for(let i=papers.length-1;i>=0;i--)if(papers[i].studentId===student.id&&papers[i].date===body.date)papers.splice(i,1);
          const saved=body.papers.map(row=>({...row,id:`paper-${++fixtureSequence}`,studentId:student.id,updatedAt:new Date().toISOString()}));papers.push(...saved);return send(saved);
        }
        const assessment=match[2].match(/^\/(papers|exams)(?:\/([^/]+))?$/);
        if(assessment){
          const rows=assessment[1]==='papers'?papers:exams;
          if(req.method==='POST'){const created={...body,id:`${assessment[1]}-${++fixtureSequence}`,studentId:student.id,updatedAt:new Date().toISOString()};rows.push(created);return send(created,201);}
          if(assessment[2]){const index=rows.findIndex(row=>row.id===assessment[2]&&row.studentId===student.id);if(index<0)return send({error:'Not found'},404);if(req.method!=='GET'&&rows[index].updatedAt!==body.updatedAt)return send({error:'CONFLICT',updatedAt:rows[index].updatedAt},409);if(req.method==='DELETE'){rows.splice(index,1);return send({success:true});}if(req.method==='PUT')Object.assign(rows[index],body,{updatedAt:new Date().toISOString()});return send(rows[index]);}
          return send(rows.filter(row=>row.studentId===student.id&&(!url.searchParams.get('date')||row.date===url.searchParams.get('date'))));
        }
        if (match[2] === '/subjects') { if (req.method === 'PUT') assignments.set(student.id, body.subjectIds); return send(assignments.get(student.id)); }
        if (match[2] === '/subjects/full') return send([{ subject: subjects[0], topics: [{ id: 't1', code: 'R1', title: 'Reading foundations', definitionRecited: true, chapterExerciseCompleted: false, status: 'in_progress', children: [] }] }]);
        if (match[2].startsWith('/parents')) {
          if (!user.canManageStudentsAndParents && user.role!=='admin') return send({error:'Forbidden'},403);
          const remove=match[2].match(/^\/parents\/([^/]+)$/);
          if(req.method==='POST') student.parentIds=[...new Set([...student.parentIds,body.parentId])];
          if(req.method==='DELETE'&&remove) student.parentIds=student.parentIds.filter(id=>id!==remove[1]);
          student.parentId=student.parentIds[0]||null;
          return send({studentId:student.id,parentIds:student.parentIds,parents:parents.filter(parent=>student.parentIds.includes(parent.id))});
        }
        if (match[2] === '/progress') return send([...dailyRecords.values()].filter(row=>row.studentId===student.id));
      }
      const taskMatch = url.pathname.match(/^\/(admin|students\/[^/]+)\/english-tasks(\/reset)?$/);
      if (taskMatch) {
        const scope = taskMatch[1];
        if ((scope === 'admin' && user.role !== 'admin') || user.role === 'parent') return send({error:'Forbidden'},403);
        if (user.isReviewer && scope !== `students/${user.reviewerStudentId}`) return send({error:'Forbidden'},403);
        if (req.method === 'PUT') { if (scope === 'admin') globalTasks=structuredClone(body.tasks); else taskOverrides.set(scope,structuredClone(body.tasks)); }
        if (req.method === 'POST' && taskMatch[2]) { if (scope === 'admin') globalTasks=structuredClone(defaultTasks); else taskOverrides.delete(scope); }
        const tasks=scope === 'admin' ? globalTasks : taskOverrides.get(scope) || globalTasks;
        return send({tasks,isDefault:JSON.stringify(tasks) === JSON.stringify(defaultTasks)});
      }
      if(url.pathname==='/grade-weekly-plans'){if(req.method==='POST'){const found=gradePlans.find(row=>row.grade===body.grade);const plan={...body,id:found?.id||`plan-${++fixtureSequence}`,updatedAt:new Date().toISOString()};if(found)Object.assign(found,plan);else gradePlans.push(plan);return send({plan,cycle:fixtureCycle},201);}return send({plans:gradePlans,cycle:fixtureCycle});}
      if(url.pathname==='/student-weekly-plan-records'){const found=planRecords.find(row=>row.studentId===body.studentId&&row.gradeWeeklyPlanId===body.gradeWeeklyPlanId);const record={...body,id:found?.id||`plan-record-${++fixtureSequence}`,updatedAt:new Date().toISOString()};if(found)Object.assign(found,record);else planRecords.push(record);return send({record,completed:record.completed},201);}
      if(url.pathname==='/paper-types'||url.pathname==='/paper-schools') {const rows=url.pathname==='/paper-types'?paperTypes:paperSchools;if(req.method==='POST'){const existing=rows.find(row=>row.name===body.name);if(existing)return send({error:'Already exists',data:existing},409);const row={id:`dictionary-${++fixtureSequence}`,name:body.name};rows.push(row);return send(row,201);}return send(rows);}
      if(url.pathname==='/loss-points')return send({categories:[{id:'grammar',name:'Grammar',points:[{id:'tense',label:'Tense'}]}]});
      const examPath=url.pathname.match(/^\/exams\/([^/]+)$/);if(examPath&&examPath[1]!=='upcoming'){const index=exams.findIndex(row=>row.id===examPath[1]);if(index<0)return send({error:'Not found'},404);if(exams[index].updatedAt!==body.updatedAt)return send({error:'CONFLICT',updatedAt:exams[index].updatedAt},409);if(req.method==='DELETE'){exams.splice(index,1);return send({success:true});}Object.assign(exams[index],body,{updatedAt:new Date().toISOString()});return send(exams[index]);}
      if (url.pathname === '/study-settings') return send(studySettings);
      if (url.pathname === '/admin/study-settings' && req.method === 'PUT' && user.role === 'admin') { studySettings=body; return send(studySettings); }
      if(url.pathname==='/subjects/hierarchy') {
        const tree=(subjectId,parentTopicId=null)=>topics.filter(topic=>topic.subjectId===subjectId&&topic.parentTopicId===parentTopicId).map(topic=>({...topic,children:tree(subjectId,topic.id)}));
        return send({defaultLevelId:'primary',levels:levels.filter(level=>level.isActive).map(level=>({...level,subjects:subjects.filter(subject=>subject.levelId===level.id&&subject.isActive).map(subject=>({...subject,topics:tree(subject.id)}))}))});
      }
      if(url.pathname==='/subject-levels'||url.pathname==='/subjects') {
        const list=url.pathname==='/subjects'?subjects:levels;
        if(req.method==='POST'){const created={...body,id:`fixture-${list.length+1}`,isDefault:false};list.push(created);return send(created,201);}
        return send(list);
      }
      const catalog=url.pathname.match(/^\/(subject-levels|subjects|topics)\/([^/]+)$/);
      if(catalog){const list=catalog[1]==='subject-levels'?levels:catalog[1]==='subjects'?subjects:topics;const index=list.findIndex(item=>item.id===catalog[2]);if(index<0)return send({error:'Not found'},404);if(req.method==='PUT')Object.assign(list[index],body);if(req.method==='DELETE'){list.splice(index,1);return send({success:true});}return send(list[index]);}
      const newTopic=url.pathname.match(/^\/subjects\/([^/]+)\/topics$/);if(newTopic&&req.method==='POST'){const created={...body,subjectId:newTopic[1],id:`topic-${topics.length+1}`};topics.push(created);return send(created,201);}
      if(url.pathname==='/parents')return send(parents);
      const parentPath=url.pathname.match(/^\/parents\/([^/]+)(\/students)?$/);
      if(parentPath){const index=parents.findIndex(parent=>parent.id===parentPath[1]);if(index<0)return send({error:'Not found'},404);const linked=students.filter(student=>student.parentIds.includes(parentPath[1]));if(parentPath[2])return send(linked);if(req.method==='DELETE'){if(linked.length)return send({error:'Parent still linked'},400);parents.splice(index,1);return send({success:true});}return send(parents[index]);}
      if (url.pathname === '/daily-progress/missing' || url.pathname === '/feedback/missing') return send({ date: url.searchParams.get('date'), missing: students, ...(url.pathname.includes('feedback') ? { cycle: { startDate: url.searchParams.get('weekStarting'), endDate: '2026-10-03' } } : {}) });
      if (url.pathname === '/exams/upcoming') return send({ upcoming: [{ id: 'exam', name: '期中测验', examDate: '2026-10-08', student: students[0], subject: { name: '数学', examDate: '2026-10-08' } }] });
      if (url.pathname === '/weekly-tasks/incomplete') return send({ cycle: { startDate: '2026-09-27', endDate: '2026-10-01' }, incomplete: [{ ...students[0], completion: { reading: { completed: 2, target: 3 } } }] });
      if(url.pathname==='/progress/student')return send(dailyRecords.get(`${url.searchParams.get('studentId')}:${url.searchParams.get('date')}`)||null);
      if(url.pathname==='/progress'&&req.method==='POST'){
        const recordKey=`${body.studentId}:${body.date}`;if(dailyRecords.has(recordKey))return send({error:'Duplicate daily record'},409);
        const row={...body,id:`daily-${dailyRecords.size+1}`,updatedAt:new Date().toISOString()};dailyRecords.set(recordKey,row);return send(row,201);
      }
      const dailyMatch=url.pathname.match(/^\/progress\/([^/]+)$/);
      if(dailyMatch&&req.method==='PUT'){const found=[...dailyRecords.entries()].find(([,row])=>row.id===dailyMatch[1]);if(!found)return send({error:'Not found'},404);if(found[1].updatedAt!==body.updatedAt)return send({error:'CONFLICT',updatedAt:found[1].updatedAt},409);const row={...body,id:found[1].id,updatedAt:new Date().toISOString()};dailyRecords.delete(found[0]);dailyRecords.set(`${row.studentId}:${row.date}`,row);return send(row);}
      if(url.pathname==='/progress/list')return send([...dailyRecords.values()].filter(row=>row.studentId===url.searchParams.get('studentId')));
      if(url.pathname==='/feedback/one'){const row=weeklyRecords.get(`${url.searchParams.get('studentId')}:${url.searchParams.get('weekStarting')}`);return send(row&&(!row.visibleToParent&&user.role==='parent')?null:row||null);}
      if(url.pathname==='/feedback/list')return send([...weeklyRecords.values()].filter(row=>row.studentId===url.searchParams.get('studentId')&&(user.role!=='parent'||row.visibleToParent)));
      if(url.pathname==='/ai/weekly-summary')return send({summary:'Fixture AI draft — no provider was contacted.'});
      if(url.pathname==='/feedback'&&req.method==='POST'){const key=`${body.studentId}:${body.weekStarting}`;if(weeklyRecords.has(key))return send({error:'Duplicate feedback'},500);const row={...body,id:`weekly-${++fixtureSequence}`,updatedAt:new Date().toISOString(),reviewStatus:'pending',visibleToParent:false};weeklyRecords.set(key,row);return send(row,201);}
      const weeklyPath=url.pathname.match(/^\/feedback\/([^/]+)$/);if(weeklyPath){const found=[...weeklyRecords.entries()].find(([,row])=>row.id===weeklyPath[1]);if(!found)return send({error:'Not found'},404);if(found[1].updatedAt!==body.updatedAt)return send({error:'CONFLICT',updatedAt:found[1].updatedAt},409);if(req.method==='DELETE'){weeklyRecords.delete(found[0]);return send({success:true});}const row={...found[1],...body,updatedAt:new Date().toISOString(),reviewStatus:'pending',visibleToParent:false};weeklyRecords.set(found[0],row);return send(row);}

      return send({ error: 'Fixture route not implemented' }, 404);
    });
  },
};
const server = await createServer({ configFile: false, envDir: '/tmp/edunet-no-environment', mode: 'test', plugins: [fixture, react()], resolve: { alias: { '@': path.resolve('src') } }, define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') }, server: { host: '127.0.0.1', port: 4317, strictPort: true } });
await server.listen();
console.log('Isolated fixture browser: http://127.0.0.1:4317 — fixture passwords: fixture-only');
