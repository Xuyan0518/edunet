import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { db } from './db';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { format } from 'date-fns';
import {
  studentsTable,
  dailyProgress,
  weeklyFeedback,
  teachersTable,
  parentsTable,
  TeacherSchema,
  ParentSchema,
  StudentSchema,
  DailyProgressSchema,
  WeeklyFeedbackSchema,
  adminsTable
} from './schema';

dotenv.config();

const app = express();
const port = process.env.API_PORT || 3003;

app.use(cors({ origin: 'http://localhost:3001' }));
app.use(bodyParser.json());

// ========== TEACHER ROUTES ==========

app.get('/api/teachers', async (_, res) => {
  try {
    const result = await db.select().from(teachersTable);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/teachers/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await db.select().from(teachersTable).where(eq(teachersTable.id, id));
    if (!result.length) return res.status(404).json({ error: 'Teacher not found' });
    res.json(result[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/teachers', async (req, res) => {
  const parsed = TeacherSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const result = await db.insert(teachersTable).values({
      ...parsed.data,
      password: req.body.password,
      status: 'pending'
    }).returning();
    res.status(201).json(result[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/teachers/:id', async (req, res) => {
  const id = req.params.id;
  const parsed = TeacherSchema.safeParse({ ...req.body, id });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const result = await db.update(teachersTable).set(parsed.data).where(eq(teachersTable.id, id)).returning();
    if (!result.length) return res.status(404).json({ error: 'Teacher not found' });
    res.json(result[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/teachers/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await db.delete(teachersTable).where(eq(teachersTable.id, id)).returning();
    if (!result.length) return res.status(404).json({ error: 'Teacher not found' });
    res.json({ message: 'Teacher deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ========== PARENT ROUTES ==========
app.get('/api/parents/unassigned', async (req, res) => {
  try {
    const unassignedParents = await db
      .select()
      .from(parentsTable)
      .leftJoin(studentsTable, eq(parentsTable.id, studentsTable.parentId))
      .where(
        and(
          eq(parentsTable.status, 'approved'),
          isNull(studentsTable.parentId) 
        )
      );
    
    const flattenedParents = unassignedParents.map(p => p.parents);
    res.status(200).json(flattenedParents);
  } catch (error) {
    console.error('Error fetching available parents:', error);
    res.status(500).json({ error: 'Failed to fetch available parents' });
  }
});

app.get('/api/parents', async (_, res) => {
  try {
    const result = await db.select().from(parentsTable);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/parents/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await db.select().from(parentsTable).where(eq(parentsTable.id, id));
    if (!result.length) return res.status(404).json({ error: 'Parent not found' });
    res.json(result[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/parents/:id/students', async (req, res) => {
  const parentId = req.params.id;
  try {
    const result = await db.select().from(studentsTable).where(eq(studentsTable.parentId, parentId));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/parents', async (req, res) => {
  const parsed = ParentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    // Directly save password (no encryption)
    const result = await db.insert(parentsTable).values({
      ...parsed.data,
      password: req.body.password,
      status: 'pending'
    }).returning();
    res.status(201).json(result[0]);
  } catch (err) {
    if (err.message && err.message.includes('duplicate key')) return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/parents/:id', async (req, res) => {
  const id = req.params.id;
  const parsed = ParentSchema.safeParse({ ...req.body, id });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const result = await db.update(parentsTable).set(parsed.data).where(eq(parentsTable.id, id)).returning();
    if (!result.length) return res.status(404).json({ error: 'Parent not found' });
    res.json(result[0]);
  } catch (err) {
    if (err.message.includes('duplicate key')) return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/parents/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const students = await db.select().from(studentsTable).where(eq(studentsTable.parentId, id));
    if (students.length) return res.status(400).json({ error: 'Cannot delete parent with associated students' });
    const result = await db.delete(parentsTable).where(eq(parentsTable.id, id)).returning();
    if (!result.length) return res.status(404).json({ error: 'Parent not found' });
    res.json({ message: 'Parent deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ========== STUDENT ROUTES ==========

app.get('/api/students', async (_, res) => {
  try {
    const result = await db.select().from(studentsTable);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/students/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await db.select().from(studentsTable).where(eq(studentsTable.id, id));
    if (!result.length) return res.status(404).json({ error: 'Student not found' });
    res.json(result[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/students', async (req, res) => {
  const parsed = StudentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const result = await db.insert(studentsTable).values(parsed.data).returning();
    res.status(201).json(result[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/students/:id', async (req, res) => {
  const id = req.params.id;
  const parsed = StudentSchema.safeParse({ ...req.body, id });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const result = await db.update(studentsTable).set(parsed.data).where(eq(studentsTable.id, id)).returning();
    if (!result.length) return res.status(404).json({ error: 'Student not found' });
    res.json(result[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/students/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await db.delete(studentsTable).where(eq(studentsTable.id, id)).returning();
    if (!result.length) return res.status(404).json({ error: 'Student not found' });
    res.json({ message: 'Student deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ========== ADMIN ROUTES ==========
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const admins = await db.select().from(adminsTable).where(eq(adminsTable.email, email));

    if (admins.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const admin = admins[0];

    if (admin.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Exclude password from response
    const { password: _, ...adminInfo } = admin;

    // Here you could generate a token (JWT) if you want

    return res.json({
      user: {
        ...adminInfo,
        role: 'admin',
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


app.get('/api/admin/pending', async (req, res) => {
  const parents = await db.select().from(parentsTable).where(eq(parentsTable.status, 'pending'));
  const teachers = await db.select().from(teachersTable).where(eq(teachersTable.status, 'pending'));
  res.json({ parents, teachers });
});

app.post('/api/admin/approve', async (req, res) => {
  const { id, role } = req.body;
  if (role === 'parent') {
    await db.update(parentsTable).set({ status: 'approved' }).where(eq(parentsTable.id, id));
  } else if (role === 'teacher') {
    await db.update(teachersTable).set({ status: 'approved' }).where(eq(teachersTable.id, id));
  }
  res.json({ success: true });
});

app.post('/api/admin/reject', async (req, res) => {
  const { id, role } = req.body;
  if (role === 'parent') {
    await db.update(parentsTable).set({ status: 'rejected' }).where(eq(parentsTable.id, id));
  } else if (role === 'teacher') {
    await db.update(teachersTable).set({ status: 'rejected' }).where(eq(teachersTable.id, id));
  }
  res.json({ success: true });
});

// ========== DAILY PROGRESS ROUTES ==========
app.get('/api/progress', async (_, res) => {
  try {
    const result = await db.select().from(dailyProgress).orderBy(desc(dailyProgress.date));
    res.json(result);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/progress', async (req, res) => {
  const body = {...req.body, date: new Date(req.body.date)};
  const parsed = DailyProgressSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const data = {
      ...parsed.data,
      date: format(parsed.data.date, 'yyyy-MM-dd'), // convert Date to string for DB
    };
    const result = await db.insert(dailyProgress).values(data).returning();
    res.status(201).json(result[0]);
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      throw new Error("A daily progress entry already exists for this student on this date.");
    }
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/progress/:id', async (req, res) => {
  const id = req.params.id;
  const bodyWithDate = { ...req.body, id, date: new Date(req.body.date) };
  const parsed = DailyProgressSchema.safeParse(bodyWithDate);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const data = {
      ...parsed.data,
      date: format(parsed.data.date, 'yyyy-MM-dd'),
    };
    const result = await db.update(dailyProgress).set(data).where(eq(dailyProgress.id, id)).returning();
    if (!result.length) return res.status(404).json({ error: 'Progress not found' });
    res.json(result[0]);
  } catch (err) {
    console.error('Error: progress for the date selected already existed', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/progress/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await db.delete(dailyProgress).where(eq(dailyProgress.id, id)).returning();
    if (!result.length) return res.status(404).json({ error: 'Progress not found' });
    res.json({ message: 'Progress deleted successfully' });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/progress/student', async (req, res) => {
  const { studentId, date } = req.query;

  if (!studentId || !date) {
    return res.status(400).json({ error: 'Missing studentId or date query parameter' });
  }

  try {
    // Convert date string to Date object
    const targetDate = new Date(date as string);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const formattedDate = format(targetDate, 'yyyy-MM-dd');

    const progress = await db
      .select()
      .from(dailyProgress)
      .where(
        and(
          eq(dailyProgress.studentId, studentId),
          eq(dailyProgress.date, formattedDate),
        )
      )
      .limit(1);

    if (progress.length === 0) {
      return res.status(404).json({ error: 'No progress found for this student on this date' });
    }

    res.json(progress[0]);
  } catch (err) {
    console.error('Error fetching student progress:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ========== WEEKLY FEEDBACK ROUTES ==========

app.get('/api/feedback', async (_, res) => {
  try {
    const result = await db.select().from(weeklyFeedback).orderBy(desc(weeklyFeedback.weekEnding));
    res.json(result);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/feedback', async (req, res) => {
  const body = {...req.body, weekStarting: new Date(req.body.weekStarting), weekEnding: new Date(req.body.weekEnding)}
  const parsed = WeeklyFeedbackSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const data = {
      ...parsed.data,
      weekStarting: format(parsed.data.weekStarting, 'yyyy-MM-dd'),
      weekEnding: format(parsed.data.weekEnding, 'yyyy-MM-dd'),
    };
    const result = await db.insert(weeklyFeedback).values(data).returning();
    res.status(201).json(result[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/feedback/:id', async (req, res) => {
  const body = {...req.body, id: req.params.id, weekStarting: new Date(req.body.week_starting), weekEnding: new Date(req.body.week_ending)}
  const parsed = WeeklyFeedbackSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const data = {
      ...parsed.data,
      weekStarting: format(parsed.data.weekStarting, 'yyyy-MM-dd'),
      weekEnding: format(parsed.data.weekEnding, 'yyyy-MM-dd'),
    };
    const result = await db.update(weeklyFeedback)
      .set(data)
      .where(eq(weeklyFeedback.id, req.params.id))
      .returning();

    if (!result.length) return res.status(404).json({ error: 'Not found' });
    res.json(result[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/feedback/:id', async (req, res) => {
  try {
    const result = await db.delete(weeklyFeedback).where(eq(weeklyFeedback.id, req.params.id)).returning();
    if (!result.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ========== LOGIN ROUTE ==========

app.post('/api/login', async (req, res) => {
  const { email, password, role } = req.body;

  try {
    if (role === 'parent') {
      console.log('Parent login attempt:', { email, password, role });

      const parent = await db.select().from(parentsTable)
        .where(eq(parentsTable.email, email));

      if (!parent.length || parent[0].password !== password || parent[0].status !== 'approved') {
        return res.status(401).json({ error: 'Not approved or invalid credentials' });
      }

      const { password: _, ...parentInfo } = parent[0];
      return res.json({
        user: {
          ...parentInfo,
          role: 'parent'
        }
      });
    }

    if (role === 'teacher') {
      console.log('Teacher login attempt:', { email, password, role });

      const teacher = await db.select().from(teachersTable)
        .where(eq(teachersTable.email, email));

      if (!teacher.length || teacher[0].password !== password || teacher[0].status !== 'approved') {
        return res.status(401).json({ error: 'Not approved or invalid credentials' });
      }

      const { password: _, ...teacherInfo } = teacher[0];
      return res.json({
        user: {
          ...teacherInfo,
          role: 'teacher'
        }
      });
    }

    return res.status(400).json({ error: 'Invalid role' });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});


app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
