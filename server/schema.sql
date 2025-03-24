
-- Users table (for both teachers and parents)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(100) NOT NULL, -- In a production app, this would be hashed
  role VARCHAR(20) NOT NULL CHECK (role IN ('teacher', 'parent')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Students table
CREATE TABLE students (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  grade VARCHAR(20) NOT NULL,
  parent_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Daily progress table
CREATE TABLE daily_progress (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id) NOT NULL,
  date DATE NOT NULL,
  activities JSONB NOT NULL,
  mood VARCHAR(20) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Weekly feedback table
CREATE TABLE weekly_feedback (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id) NOT NULL,
  week_ending DATE NOT NULL,
  academic_progress TEXT NOT NULL,
  behavior TEXT NOT NULL,
  recommendations TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create some sample data
INSERT INTO users (name, email, password, role) VALUES
  ('John Teacher', 'teacher@example.com', 'password', 'teacher'),
  ('Jane Parent', 'parent@example.com', 'password', 'parent');

INSERT INTO students (name, grade, parent_id) VALUES
  ('Alice', '3rd Grade', 2),
  ('Bob', '5th Grade', 2);

INSERT INTO daily_progress (student_id, date, activities, mood, notes) VALUES
  (1, CURRENT_DATE - INTERVAL '1 day', '{"reading": "30 minutes", "math": "completed worksheet"}', 'Happy', 'Great day overall'),
  (1, CURRENT_DATE - INTERVAL '2 days', '{"science": "plant experiment", "writing": "short story"}', 'Focused', 'Worked well independently');

INSERT INTO weekly_feedback (student_id, week_ending, academic_progress, behavior, recommendations) VALUES
  (1, CURRENT_DATE - INTERVAL '2 days', 'Improved in reading comprehension', 'Participates actively in group activities', 'Continue daily reading practice');
