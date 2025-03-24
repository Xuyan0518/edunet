
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'edunet',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err.stack);
  } else {
    console.log('Database connected successfully');
  }
});

// API Routes

// Get all students
app.get('/api/students', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM students');
    res.json(result.rows);
  } catch (err) {
    console.error('Error executing query', err.stack);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get a single student by ID
app.get('/api/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM students WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error executing query', err.stack);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create a new student
app.post('/api/students', async (req, res) => {
  try {
    const { name, grade, parent_id } = req.body;
    const result = await pool.query(
      'INSERT INTO students (name, grade, parent_id) VALUES ($1, $2, $3) RETURNING *',
      [name, grade, parent_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error executing query', err.stack);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update a student
app.put('/api/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, grade, parent_id } = req.body;
    const result = await pool.query(
      'UPDATE students SET name = $1, grade = $2, parent_id = $3 WHERE id = $4 RETURNING *',
      [name, grade, parent_id, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error executing query', err.stack);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get daily progress for a student
app.get('/api/students/:studentId/progress', async (req, res) => {
  try {
    const { studentId } = req.params;
    const result = await pool.query(
      'SELECT * FROM daily_progress WHERE student_id = $1 ORDER BY date DESC',
      [studentId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error executing query', err.stack);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create daily progress entry
app.post('/api/progress', async (req, res) => {
  try {
    const { student_id, date, activities, mood, notes } = req.body;
    const result = await pool.query(
      'INSERT INTO daily_progress (student_id, date, activities, mood, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [student_id, date, activities, mood, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error executing query', err.stack);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get weekly feedback for a student
app.get('/api/students/:studentId/feedback', async (req, res) => {
  try {
    const { studentId } = req.params;
    const result = await pool.query(
      'SELECT * FROM weekly_feedback WHERE student_id = $1 ORDER BY week_ending DESC',
      [studentId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error executing query', err.stack);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create weekly feedback
app.post('/api/feedback', async (req, res) => {
  try {
    const { student_id, week_ending, academic_progress, behavior, recommendations } = req.body;
    const result = await pool.query(
      'INSERT INTO weekly_feedback (student_id, week_ending, academic_progress, behavior, recommendations) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [student_id, week_ending, academic_progress, behavior, recommendations]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error executing query', err.stack);
    res.status(500).json({ error: 'Database error' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
