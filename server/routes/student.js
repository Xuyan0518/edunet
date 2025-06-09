// /app/server/routes/student.js

import express from 'express';
const router = express.Router();

// Import your PostgreSQL pool (adjust the path as needed)
import { pool } from '../db/pool.js'; // Create this if not already

// GET all students
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM students');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET a single student by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM students WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching student:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST a new student
router.post('/', async (req, res) => {
  try {
    const { name, grade, parent_id } = req.body;
    const result = await pool.query(
      'INSERT INTO students (name, grade, parent_id) VALUES ($1, $2, $3) RETURNING *',
      [name, grade, parent_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating student:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// PUT (update) a student
router.put('/:id', async (req, res) => {
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
    console.error('Error updating student:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
