CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  email varchar(100) NOT NULL UNIQUE,
  password varchar(100) NOT NULL,
  role varchar(20) NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE TABLE admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  email varchar(100) NOT NULL UNIQUE,
  password varchar(100) NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE TABLE teacher (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  email varchar(100) NOT NULL UNIQUE,
  password varchar(100) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  created_at timestamp DEFAULT now()
);

CREATE TABLE parents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  email varchar(100) NOT NULL UNIQUE,
  password varchar(100) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  created_at timestamp DEFAULT now()
);

CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  grade varchar(20) NOT NULL,
  parent_id uuid REFERENCES parents(id),
  created_at timestamp DEFAULT now()
);

CREATE TABLE daily_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id),
  date date NOT NULL,
  activities jsonb NOT NULL,
  mood varchar(20) NOT NULL,
  notes text,
  created_at timestamp DEFAULT now()
);

CREATE TABLE weekly_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id),
  week_ending date NOT NULL,
  academic_progress text NOT NULL,
  behavior text NOT NULL,
  recommendations text,
  created_at timestamp DEFAULT now()
);
