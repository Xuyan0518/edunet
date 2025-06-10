import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { db } from './db.js';
import { eq, desc } from 'drizzle-orm';
import { studentsTable, dailyProgress, weeklyFeedback } from './schema.js';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// API Routes
// Get all students
app.get('/api/students', async (req, res) => {
  try {
    const result = await db.select().from(studentsTable);
    res.json(result);
  } catch (err) {
    console.error('Error executing query', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get a single student by ID
app.get('/api/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db
      .select()
      .from(studentsTable)
      .where(eq(studentsTable.id, Number(id)));

    if (result.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.json(result[0]);
  } catch (err) {
    console.error('Error executing query', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create a new student
app.post('/api/students', async (req, res) => {
  try {
    const { name, grade, parent_id } = req.body;
    const result = await db
      .insert(studentsTable)
      .values({ name, grade, parentId: parent_id })
      .returning();
    res.status(201).json(result[0]);
  } catch (err) {
    console.error('Error executing query', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update a student
app.put('/api/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, grade, parent_id } = req.body;
    const result = await db
      .update(studentsTable)
      .set({ name, grade, parentId: parent_id })
      .where(eq(studentsTable.id, Number(id)))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.json(result[0]);
  } catch (err) {
    console.error('Error executing query', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get daily progress for a student
app.get('/api/students/:studentId/progress', async (req, res) => {
  try {
    const { studentId } = req.params;
    const result = await db
      .select()
      .from(dailyProgress)
      .where(eq(dailyProgress.studentId, Number(studentId)))
      .orderBy(desc(dailyProgress.date));
    res.json(result);
  } catch (err) {
    console.error('Error executing query', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create daily progress entry
app.post('/api/progress', async (req, res) => {
  try {
    const { student_id, date, activities, mood, notes } = req.body;
    const result = await db
      .insert(dailyProgress)
      .values({
        studentId: student_id,
        date,
        activities,
        mood,
        notes,
      })
      .returning();
    res.status(201).json(result[0]);
  } catch (err) {
    console.error('Error executing query', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get weekly feedback for a student
app.get('/api/students/:studentId/feedback', async (req, res) => {
  try {
    const { studentId } = req.params;
    const result = await db
      .select()
      .from(weeklyFeedback)
      .where(eq(weeklyFeedback.studentId, Number(studentId)))
      .orderBy(desc(weeklyFeedback.weekEnding));
    res.json(result);
  } catch (err) {
    console.error('Error executing query', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create weekly feedback
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
    console.error('Error executing query', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
