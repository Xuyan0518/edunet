// // server/index.ts
// import express, { Request, Response } from 'express';
// import cors from 'cors';
// import bodyParser from 'body-parser';
// import dotenv from 'dotenv';
// import { db } from './db';
// import { eq, desc } from 'drizzle-orm';
// import { studentsTable, dailyProgress, weeklyFeedback, teacher, parentsTable } from './schema';

// dotenv.config();

// const app = express();
// const port = process.env.API_PORT || 3003;

// app.use(cors({
//   origin: 'http://localhost:3001' // Allow Vite frontend
// }));
// app.use(bodyParser.json());

// // ===== TEACHER ROUTES ===== //

// // GET all teachers
// app.get('/api/teachers', async (req, res) => {
//   try {
//     const result = await db.select().from(teacher);
//     res.json(result);
//   } catch (err) {
//     console.error('Error:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // GET teacher by ID
// app.get('/api/teachers/:id', async (req, res) => {
//   try {
//     const id = Number(req.params.id);
//     const result = await db.select().from(teacher).where(eq(teacher.id, id));

//     if (result.length === 0) return res.status(404).json({ error: 'Teacher not found' });
//     res.json(result[0]);
//   } catch (err) {
//     console.error('Error:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // POST create teacher
// app.post('/api/teachers', async (req, res) => {
//   try {
//     const { name } = req.body;
//     const result = await db
//       .insert(teacher)
//       .values({ name })
//       .returning();
//     res.status(201).json(result[0]);
//   } catch (err) {
//     console.error('Error:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // PUT update teacher
// app.put('/api/teachers/:id', async (req, res) => {
//   try {
//     const id = Number(req.params.id);
//     const { name } = req.body;
//     const result = await db
//       .update(teacher)
//       .set({ name })
//       .where(eq(teacher.id, id))
//       .returning();

//     if (result.length === 0) return res.status(404).json({ error: 'Teacher not found' });
//     res.json(result[0]);
//   } catch (err) {
//     console.error('Error:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // DELETE teacher
// app.delete('/api/teachers/:id', async (req, res) => {
//   try {
//     const id = Number(req.params.id);
//     const result = await db
//       .delete(teacher)
//       .where(eq(teacher.id, id))
//       .returning();

//     if (result.length === 0) return res.status(404).json({ error: 'Teacher not found' });
//     res.json({ message: 'Teacher deleted successfully' });
//   } catch (err) {
//     console.error('Error:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // ===== PARENT ROUTES ===== //

// // GET all parents
// app.get('/api/parents', async (req, res) => {
//   try {
//     const result = await db.select().from(parentsTable);
//     res.json(result);
//   } catch (err) {
//     console.error('Error:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // GET parent by ID
// app.get('/api/parents/:id', async (req, res) => {
//   try {
//     const id = Number(req.params.id);
//     const result = await db.select().from(parentsTable).where(eq(parentsTable.id, id));

//     if (result.length === 0) return res.status(404).json({ error: 'Parent not found' });
//     res.json(result[0]);
//   } catch (err) {
//     console.error('Error:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // GET all students for a parent
// app.get('/api/parents/:id/students', async (req, res) => {
//   try {
//     const parentId = Number(req.params.id);
//     const result = await db
//       .select()
//       .from(studentsTable)
//       .where(eq(studentsTable.parentId, parentId));
    
//     res.json(result);
//   } catch (err) {
//     console.error('Error:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // POST create parent
// app.post('/api/parents', async (req, res) => {
//   try {
//     const { name, email } = req.body;
//     const result = await db
//       .insert(parentsTable)
//       .values({ name, email })
//       .returning();
//     res.status(201).json(result[0]);
//   } catch (err) {
//     console.error('Error:', err);
//     if (err instanceof Error && err.message.includes('duplicate key')) {
//       return res.status(400).json({ error: 'Email already exists' });
//     }
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // PUT update parent
// app.put('/api/parents/:id', async (req, res) => {
//   try {
//     const id = Number(req.params.id);
//     const { name, email } = req.body;
//     const result = await db
//       .update(parentsTable)
//       .set({ name, email })
//       .where(eq(parentsTable.id, id))
//       .returning();

//     if (result.length === 0) return res.status(404).json({ error: 'Parent not found' });
//     res.json(result[0]);
//   } catch (err) {
//     console.error('Error:', err);
//     if (err instanceof Error && err.message.includes('duplicate key')) {
//       return res.status(400).json({ error: 'Email already exists' });
//     }
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // DELETE parent (with check for associated students)
// app.delete('/api/parents/:id', async (req, res) => {
//   try {
//     const id = Number(req.params.id);
    
//     // Check if parent has students
//     const students = await db
//       .select()
//       .from(studentsTable)
//       .where(eq(studentsTable.parentId, id));

//     if (students.length > 0) {
//       return res.status(400).json({ 
//         error: 'Cannot delete parent with associated students',
//         students: students.map(s => s.id) 
//       });
//     }

//     const result = await db
//       .delete(parentsTable)
//       .where(eq(parentsTable.id, id))
//       .returning();

//     if (result.length === 0) return res.status(404).json({ error: 'Parent not found' });
//     res.json({ message: 'Parent deleted successfully' });
//   } catch (err) {
//     console.error('Error:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // ===== STUDENTS ROUTES ===== //

// // GET all students
// app.get('/api/students', async (req, res) => {
//   try {
//     const result = await db.select().from(studentsTable);
//     res.json(result);
//   } catch (err) {
//     console.error('Error:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // GET student by ID
// app.get('/api/students/:id', async (req, res) => {
//   try {
//     const id = Number(req.params.id);
//     const result = await db.select().from(studentsTable).where(eq(studentsTable.id, id));

//     if (result.length === 0) return res.status(404).json({ error: 'Student not found' });
//     res.json(result[0]);
//   } catch (err) {
//     console.error('Error:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // POST create student (updated to match schema)
// app.post('/api/students', async (req, res) => {
//   try {
//     const { name, grade, parentId } = req.body;
    
//     // Verify parent exists
//     const parent = await db.select().from(parentsTable).where(eq(parentsTable.id, parentId));
//     if (parent.length === 0) return res.status(400).json({ error: 'Parent not found' });

//     const result = await db
//       .insert(studentsTable)
//       .values({ name, grade, parentId })
//       .returning();
//     res.status(201).json(result[0]);
//   } catch (err) {
//     console.error('Error:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // PUT update student (updated to match schema)
// app.put('/api/students/:id', async (req, res) => {
//   try {
//     const id = Number(req.params.id);
//     const { name, grade, parentId } = req.body;

//     // Verify parent exists if parentId is being updated
//     if (parentId) {
//       const parent = await db.select().from(parentsTable).where(eq(parentsTable.id, parentId));
//       if (parent.length === 0) return res.status(400).json({ error: 'Parent not found' });
//     }

//     const result = await db
//       .update(studentsTable)
//       .set({ name, grade, parentId })
//       .where(eq(studentsTable.id, id))
//       .returning();

//     if (result.length === 0) return res.status(404).json({ error: 'Student not found' });
//     res.json(result[0]);
//   } catch (err) {
//     console.error('Error:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // DELETE student (with cascading deletes for progress/feedback)
// app.delete('/api/students/:id', async (req, res) => {
//   try {
//     const id = Number(req.params.id);

//     // First delete dependent records
//     await db.delete(dailyProgress).where(eq(dailyProgress.studentId, id));
//     await db.delete(weeklyFeedback).where(eq(weeklyFeedback.studentId, id));

//     // Then delete student
//     const result = await db
//       .delete(studentsTable)
//       .where(eq(studentsTable.id, id))
//       .returning();

//     if (result.length === 0) return res.status(404).json({ error: 'Student not found' });
//     res.json({ message: 'Student and all associated data deleted successfully' });
//   } catch (err) {
//     console.error('Error:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // ===== DAILY PROGRESS ROUTES ===== //

// // GET daily progress
// app.get('/api/students/:studentId/progress', async (req, res) => {
//   try {
//     const studentId = Number(req.params.studentId);
//     const result = await db
//       .select()
//       .from(dailyProgress)
//       .where(eq(dailyProgress.studentId, studentId))
//       .orderBy(desc(dailyProgress.date));
//     res.json(result);
//   } catch (err) {
//     console.error('Error:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // GET single progress entry by ID
// app.get('/api/progress/:id', async (req, res) => {
//   try {
//     const id = Number(req.params.id);
//     const result = await db
//       .select()
//       .from(dailyProgress)
//       .where(eq(dailyProgress.id, id));

//     if (result.length === 0) return res.status(404).json({ error: 'Progress entry not found' });
//     res.json(result[0]);
//   } catch (err) {
//     console.error('Error:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // POST create new progress entry (fixed)
// app.post('/api/progress', async (req, res) => {
//   try {
//     const { studentId, date, activities, mood, notes } = req.body;

//     // Validate required fields
//     if (!studentId || !date || !activities || !mood) {
//       return res.status(400).json({ error: 'Missing required fields' });
//     }

//     // Validate date format
//     const parsedDate = new Date(date);
//     if (isNaN(parsedDate.getTime())) {
//       return res.status(400).json({ error: 'Invalid date format' });
//     }

//     // Validate activities is an object
//     if (typeof activities !== 'object' || activities === null || Array.isArray(activities)) {
//       return res.status(400).json({ error: 'Activities must be a JSON object' });
//     }

//     const result = await db
//       .insert(dailyProgress)
//       .values({
//         studentId,
//         date: parsedDate.toISOString(), // Convert to ISO string
//         activities,
//         mood,
//         notes: notes || null
//       })
//       .returning();

//     res.status(201).json(result[0]);
//   } catch (err) {
//     console.error('Error:', err);
//     if (err instanceof Error) {
//       if (err.message.includes('violates foreign key constraint')) {
//         return res.status(400).json({ error: 'Invalid studentId' });
//       }
//       if (err.message.includes('invalid input syntax for type date')) {
//         return res.status(400).json({ error: 'Invalid date format' });
//       }
//     }
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // PUT update progress entry (fixed)
// app.put('/api/progress/:id', async (req, res) => {
//   try {
//     const id = Number(req.params.id);
//     const { studentId, date, activities, mood, notes } = req.body;

//     // Prepare update data
//     const updateData: {
//       studentId?: number;
//       date?: string;
//       activities?: Record<string, string>;
//       mood?: string;
//       notes?: string | null;
//     } = {};

//     // Only include fields that are provided
//     if (studentId) updateData.studentId = studentId;
//     if (date) {
//       const parsedDate = new Date(date);
//       if (isNaN(parsedDate.getTime())) {
//         return res.status(400).json({ error: 'Invalid date format' });
//       }
//       updateData.date = parsedDate.toISOString();
//     }
//     if (activities) {
//       if (typeof activities !== 'object' || Array.isArray(activities)) {
//         return res.status(400).json({ error: 'Activities must be a JSON object' });
//       }
//       updateData.activities = activities;
//     }
//     if (mood) updateData.mood = mood;
//     if (notes !== undefined) updateData.notes = notes || null;

//     const result = await db
//       .update(dailyProgress)
//       .set(updateData)
//       .where(eq(dailyProgress.id, id))
//       .returning();

//     if (result.length === 0) return res.status(404).json({ error: 'Progress entry not found' });
//     res.json(result[0]);
//   } catch (err) {
//     console.error('Error:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // ===== WEEKLY FEEDBACK ROUTES ===== //

// // GET weekly feedback
// app.get('/api/students/:studentId/feedback', async (req, res) => {
//   try {
//     const studentId = Number(req.params.studentId);
//     const result = await db
//       .select()
//       .from(weeklyFeedback)
//       .where(eq(weeklyFeedback.studentId, studentId))
//       .orderBy(desc(weeklyFeedback.weekEnding));
//     res.json(result);
//   } catch (err) {
//     console.error('Error:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // GET single feedback entry by ID
// app.get('/api/feedback/:id', async (req, res) => {
//   try {
//     const id = Number(req.params.id);
//     const result = await db
//       .select()
//       .from(weeklyFeedback)
//       .where(eq(weeklyFeedback.id, id));

//     if (result.length === 0) return res.status(404).json({ error: 'Feedback entry not found' });
//     res.json(result[0]);
//   } catch (err) {
//     console.error('Error:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // POST create new feedback entry (fixed)
// app.post('/api/feedback', async (req, res) => {
//   try {
//     const { studentId, weekEnding, academicProgress, behavior, recommendations } = req.body;

//     // Validate required fields
//     if (!studentId || !weekEnding || !academicProgress || !behavior) {
//       return res.status(400).json({ error: 'Missing required fields' });
//     }

//     // Validate and parse date
//     const parsedDate = new Date(weekEnding);
//     if (isNaN(parsedDate.getTime())) {
//       return res.status(400).json({ error: 'Invalid date format' });
//     }

//     const result = await db
//       .insert(weeklyFeedback)
//       .values({
//         studentId,
//         weekEnding: parsedDate.toISOString(), // Convert to ISO string
//         academicProgress,
//         behavior,
//         recommendations: recommendations || null
//       })
//       .returning();

//     res.status(201).json(result[0]);
//   } catch (err) {
//     console.error('Error:', err);
//     if (err instanceof Error) {
//       if (err.message.includes('violates foreign key constraint')) {
//         return res.status(400).json({ error: 'Invalid studentId' });
//       }
//       if (err.message.includes('invalid input syntax for type date')) {
//         return res.status(400).json({ error: 'Invalid date format' });
//       }
//     }
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // PUT update feedback entry (fixed)
// app.put('/api/feedback/:id', async (req, res) => {
//   try {
//     const id = Number(req.params.id);
//     const { studentId, weekEnding, academicProgress, behavior, recommendations } = req.body;

//     // Prepare update data with proper types
//     const updateData: {
//       studentId?: number;
//       weekEnding?: string;
//       academicProgress?: string;
//       behavior?: string;
//       recommendations?: string | null;
//     } = {};

//     // Only include fields that are provided
//     if (studentId !== undefined) updateData.studentId = studentId;
//     if (weekEnding !== undefined) {
//       const parsedDate = new Date(weekEnding);
//       if (isNaN(parsedDate.getTime())) {
//         return res.status(400).json({ error: 'Invalid date format' });
//       }
//       updateData.weekEnding = parsedDate.toISOString();
//     }
//     if (academicProgress !== undefined) updateData.academicProgress = academicProgress;
//     if (behavior !== undefined) updateData.behavior = behavior;
//     if (recommendations !== undefined) updateData.recommendations = recommendations || null;

//     const result = await db
//       .update(weeklyFeedback)
//       .set(updateData)
//       .where(eq(weeklyFeedback.id, id))
//       .returning();

//     if (result.length === 0) return res.status(404).json({ error: 'Feedback entry not found' });
//     res.json(result[0]);
//   } catch (err) {
//     console.error('Error:', err);
//     if (err instanceof Error) {
//       if (err.message.includes('violates foreign key constraint')) {
//         return res.status(400).json({ error: 'Invalid studentId' });
//       }
//       if (err.message.includes('invalid input syntax for type date')) {
//         return res.status(400).json({ error: 'Invalid date format' });
//       }
//     }
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// // DELETE feedback entry
// app.delete('/api/feedback/:id', async (req, res) => {
//   try {
//     const id = Number(req.params.id);
//     const result = await db
//       .delete(weeklyFeedback)
//       .where(eq(weeklyFeedback.id, id))
//       .returning();

//     if (result.length === 0) return res.status(404).json({ error: 'Feedback entry not found' });
//     res.json({ message: 'Feedback entry deleted successfully' });
//   } catch (err) {
//     console.error('Error:', err);
//     res.status(500).json({ error: 'Database error' });
//   }
// });

// app.listen(port, () => {
//   console.log(`🚀 Server running on port ${port}`);
// });
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
  teacher,
  parentsTable,
  TeacherSchema,
  ParentSchema,
  StudentSchema,
  DailyProgressSchema,
  WeeklyFeedbackSchema,
} from './schema';

dotenv.config();

const app = express();
const port = process.env.API_PORT || 3003;

app.use(cors({ origin: 'http://localhost:3001' }));
app.use(bodyParser.json());

// ========== TEACHER ROUTES ==========

app.get('/api/teachers', async (_, res) => {
  try {
    const result = await db.select().from(teacher);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/teachers/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await db.select().from(teacher).where(eq(teacher.id, id));
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
    const result = await db.insert(teacher).values(parsed.data).returning();
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
    const result = await db.update(teacher).set(parsed.data).where(eq(teacher.id, id)).returning();
    if (!result.length) return res.status(404).json({ error: 'Teacher not found' });
    res.json(result[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/teachers/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await db.delete(teacher).where(eq(teacher.id, id)).returning();
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
    const result = await db.insert(parentsTable).values(parsed.data).returning();
    res.status(201).json(result[0]);
  } catch (err) {
    if (err.message.includes('duplicate key')) return res.status(400).json({ error: 'Email already exists' });
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


app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
