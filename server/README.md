
# EduNet Backend API

This is the backend API for the EduNet application, providing endpoints for student data, daily progress, and weekly feedback.

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL database

## Setup Instructions

1. Install dependencies:
   ```
   npm install
   ```

2. Set up the PostgreSQL database:
   - Create a database named 'edunet'
   - Run the schema.sql script to create tables and sample data:
     ```
     psql -d edunet -f schema.sql
     ```

3. Configure environment variables:
   - Copy the .env file and update with your PostgreSQL credentials
4. (Optional) Generate Drizzle types and migrations:
   ```
   npm run db:generate
   ```

5. Start the server:
   ```
   node index.js
   ```

The server will start on port 3001 (or the port specified in your .env file).

## API Endpoints

### Students
- GET /api/students - Get all students
- GET /api/students/:id - Get a student by ID
- POST /api/students - Create a new student
- PUT /api/students/:id - Update a student

### Daily Progress
- GET /api/students/:studentId/progress - Get progress entries for a student
- POST /api/progress - Create a new progress entry

### Weekly Feedback
- GET /api/students/:studentId/feedback - Get feedback entries for a student
- POST /api/feedback - Create a new feedback entry

## Using Drizzle ORM

This project uses [Drizzle ORM](https://orm.drizzle.team/) for database access. The table definitions are located in `server/schema.js` and the database connection is configured in `server/db.js`.

To generate types and migration files with Drizzle Kit run:

```bash
npm run db:generate
```

This will read `drizzle.config.ts` and place generated files in `server/migrations`.
