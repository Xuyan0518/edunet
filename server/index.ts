// server/index.ts
import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { db } from './db';
import { eq, desc } from 'drizzle-orm';
import { studentsTable, dailyProgress, weeklyFeedback } from './schema';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

// GET all students
app.get('/api/students', async (req, res) => {
  try {
    const result = await db.select().from(studentsTable);
    res.json(result);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET student by ID
app.get('/api/students/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await db.select().from(studentsTable).where(eq(studentsTable.id, id));

    if (result.length === 0) return res.status(404).json({ error: 'Student not found' });
    res.json(result[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST create student
app.post('/api/students', async (req, res) => {
  try {
    const { name, grade, parent_id } = req.body;
    const result = await db
      .insert(studentsTable)
      .values({ name, grade, parentId: parent_id })
      .returning();
    res.status(201).json(result[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT update student
app.put('/api/students/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, grade, parent_id } = req.body;
    const result = await db
      .update(studentsTable)
      .set({ name, grade, parentId: parent_id })
      .where(eq(studentsTable.id, id))
      .returning();

    if (result.length === 0) return res.status(404).json({ error: 'Student not found' });
    res.json(result[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET daily progress
app.get('/api/students/:studentId/progress', async (req, res) => {
  try {
    const studentId = Number(req.params.studentId);
    const result = await db
      .select()
      .from(dailyProgress)
      .where(eq(dailyProgress.studentId, studentId))
      .orderBy(desc(dailyProgress.date));
    res.json(result);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST daily progress
app.post('/api/progress', async (req, res) => {
  try {
    const { student_id, date, activities, mood, notes } = req.body;
    const result = await db
      .insert(dailyProgress)
      .values({ studentId: student_id, date, activities, mood, notes })
      .returning();
    res.status(201).json(result[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET weekly feedback
app.get('/api/students/:studentId/feedback', async (req, res) => {
  try {
    const studentId = Number(req.params.studentId);
    const result = await db
      .select()
      .from(weeklyFeedback)
      .where(eq(weeklyFeedback.studentId, studentId))
      .orderBy(desc(weeklyFeedback.weekEnding));
    res.json(result);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST weekly feedback
app.post('/api/feedback', async (req, res) => {
  try {
    const { student_id, week_ending, academic_progress, behavior, recommendations } = req.body;
    const result = await db
      .insert(weeklyFeedback)
      .values({
        studentId: student_id,
        weekEnding: week_ending,
        academicProgress: academic_progress,
        behavior,
        recommendations,
      })
      .returning();
    res.status(201).json(result[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
