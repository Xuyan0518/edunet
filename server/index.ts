import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { db } from './db';
import { eq, desc } from 'drizzle-orm';
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
  WeeklyFeedbackSchema
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
    const result = await db.insert(teachersTable).values(parsed.data).returning();
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
  const parsed = DailyProgressSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const data = {
      ...parsed.data,
      date: parsed.data.date.toISOString(),
    };
    const result = await db.insert(dailyProgress).values(data).returning();
    res.status(201).json(result[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/progress/:id', async (req, res) => {
  const id = req.params.id;
  const parsed = DailyProgressSchema.safeParse({ ...req.body, id });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const data = {
      ...parsed.data,
      date: parsed.data.date.toISOString(),
    };
    const result = await db.update(dailyProgress).set(data).where(eq(dailyProgress.id, id)).returning();
    if (!result.length) return res.status(404).json({ error: 'Progress not found' });
    res.json(result[0]);
  } catch (err) {
    console.error('Error:', err);
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
  const parsed = WeeklyFeedbackSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const data = {
      ...parsed.data,
      weekEnding: parsed.data.weekEnding.toISOString(),
    };
    const result = await db.insert(weeklyFeedback).values(data).returning();
    res.status(201).json(result[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/feedback/:id', async (req, res) => {
  const parsed = WeeklyFeedbackSchema.safeParse({ ...req.body, id: req.params.id });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const data = {
      ...parsed.data,
      weekEnding: parsed.data.weekEnding.toISOString(),
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

app.post('/api/login', async (req, res) => {
  const { email, password, role } = req.body;
  try {
    if (role === 'parent') {
      // Log the actual login attempt
      console.log('Parent login attempt:', { email, password, role });
      const parent = await db.select().from(parentsTable)
        .where(eq(parentsTable.email, email));
      if (!parent.length || parent[0].password !== password) {
        return res.status(401).json({ error: 'Invalid credentials or not a parent' });
      }
      const { password: _, ...parentInfo } = parent[0];
      return res.json({ user: parentInfo, role: 'parent' });
    } else {
      console.log('Teacher login attempt:', { email, password, role });
      const teacher = await db.select().from(teachersTable)
        .where(eq(teachersTable.email, email));
      if (!teacher.length || teacher[0].password !== password) {
        return res.status(401).json({ error: 'Invalid credentials or not a teacher' });
      }
      const { password: _, ...teacherInfo } = teacher[0];
      return res.json({ user: teacherInfo, role: 'Teacher' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
